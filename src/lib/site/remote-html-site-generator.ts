import path from "path";
import { appendFile, mkdir, writeFile } from "fs/promises";
import { elapsedMs, extractUsageFromResponse, recordModelUsage, type ParsedModelUsage } from "@/lib/model-usage";
import {
  buildBrief,
  buildPrompt,
  publishSiteDirectory,
  resolveContentAssets,
  uploadedStyleReferences,
  type ContentAsset,
  type GenerateSitePreviewOptions
} from "@/lib/site/codex-site-generator";
import type { SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";
import { downloadAliyunOssObject, rootRelativeUrlToAliyunOssUrl } from "@/lib/storage/aliyun-oss-storage";

export type RemoteHtmlSitePreviewResult = {
  previewUrl: string;
  screenshotUrl?: string;
  generator: "remote_html";
  runDir: string;
  message?: string;
};

type RemoteHtmlConfig = {
  url: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  reasoningEffort?: string;
  maxImageInputs: number;
  maxImageBytes: number;
};

type RemoteImageInput = {
  sourceUrl: string;
  providerUrl: string;
  label: string;
  mimeType: string;
  bytes: number;
};

type StreamState = {
  content: string;
  model?: string;
  usage?: ParsedModelUsage;
  eventCount: number;
};

type ChatStreamChoice = {
  delta?: { content?: string | Array<{ type?: string; text?: string }> };
  message?: { content?: string };
};

type ChatStreamEvent = {
  model?: string;
  choices?: ChatStreamChoice[];
  usage?: unknown;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "site";
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function buildApiUrl(baseUrl: string, endpoint: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const requestPath = endpoint.replace(/^\/+/, "");
  if (base.endsWith("/v1") && requestPath.startsWith("v1/")) {
    return `${base}/${requestPath.slice(3)}`;
  }
  return `${base}/${requestPath}`;
}

function remoteHtmlConfig(): RemoteHtmlConfig {
  const baseUrl = process.env.REMOTE_SITE_API_BASE_URL?.trim();
  const apiKey = process.env.REMOTE_SITE_API_KEY?.trim();
  if (!baseUrl) throw new Error("远程官网生成接口未配置 REMOTE_SITE_API_BASE_URL。");
  if (!apiKey) throw new Error("远程官网生成接口未配置 REMOTE_SITE_API_KEY。");

  return {
    url: buildApiUrl(baseUrl, process.env.REMOTE_SITE_API_ENDPOINT?.trim() || "/v1/chat/completions"),
    apiKey,
    model: process.env.REMOTE_SITE_MODEL?.trim() || "gpt-5.6-sol",
    timeoutMs: positiveInteger(process.env.REMOTE_SITE_TIMEOUT_MS, 900_000, 1_800_000),
    maxOutputTokens: positiveInteger(process.env.REMOTE_SITE_MAX_OUTPUT_TOKENS, 24_000, 128_000),
    reasoningEffort: process.env.REMOTE_SITE_REASONING_EFFORT?.trim() || undefined,
    maxImageInputs: positiveInteger(process.env.REMOTE_SITE_MAX_IMAGE_INPUTS, 12, 40),
    maxImageBytes: positiveInteger(process.env.REMOTE_SITE_MAX_IMAGE_BYTES, 8_000_000, 20_000_000)
  };
}

function contentText(value: ChatStreamChoice | undefined) {
  const delta = value?.delta?.content;
  if (typeof delta === "string") return delta;
  if (Array.isArray(delta)) return delta.map((item) => item?.text || "").join("");
  return typeof value?.message?.content === "string" ? value.message.content : "";
}

export class ChatCompletionSseParser {
  private lineBuffer = "";
  private eventData: string[] = [];
  private state: StreamState = { content: "", eventCount: 0 };

  push(text: string) {
    this.lineBuffer += text;
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() || "";
    for (const line of lines) this.processLine(line);
  }

  finish(): StreamState {
    if (this.lineBuffer) this.processLine(this.lineBuffer);
    this.flushEvent();
    return { ...this.state };
  }

  private processLine(line: string) {
    if (!line.trim()) {
      this.flushEvent();
      return;
    }
    if (line.startsWith("data:")) this.eventData.push(line.slice(5).trimStart());
  }

  private flushEvent() {
    if (!this.eventData.length) return;
    const data = this.eventData.join("\n").trim();
    this.eventData = [];
    if (!data || data === "[DONE]") return;

    try {
      const event = JSON.parse(data) as ChatStreamEvent;
      this.state.eventCount += 1;
      if (!this.state.model && event.model) this.state.model = event.model;
      const piece = contentText(event.choices?.[0]);
      if (piece) this.state.content += piece;
      if (event.usage) this.state.usage = extractUsageFromResponse({ usage: event.usage });
    } catch {
      // Ignore non-JSON provider keepalive events; the final HTML validator remains authoritative.
    }
  }
}

export function extractRemoteHtml(raw: string) {
  let html = raw.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = html.search(/<!doctype\s+html/i);
  const endMatch = /<\/html\s*>/gi;
  let end = -1;
  let match: RegExpExecArray | null;
  while ((match = endMatch.exec(html))) end = match.index + match[0].length;
  if (start >= 0 && end > start) html = html.slice(start, end).trim();
  return html;
}

export function validateRemoteHtml(html: string) {
  const errors: string[] = [];
  if (html.length < 1_200) errors.push("HTML 内容过短，无法作为完整官网。");
  if (html.length > 500_000) errors.push("HTML 内容过长，超过安全上限。");
  if (!/^\s*<!doctype\s+html/i.test(html)) errors.push("缺少 <!doctype html>。");
  if (!/<html\b/i.test(html) || !/<\/html\s*>\s*$/i.test(html)) errors.push("HTML 根节点不完整。");
  if (!/<head\b/i.test(html) || !/<\/head\s*>/i.test(html)) errors.push("head 节点不完整。");
  if (!/<body\b/i.test(html) || !/<\/body\s*>/i.test(html)) errors.push("body 节点不完整。");
  if (!/<style\b/i.test(html)) errors.push("缺少内联 style。");
  if (/```/.test(html)) errors.push("返回内容包含 Markdown 代码围栏。");

  const forbidden: Array<[RegExp, string]> = [
    [/<(?:iframe|frame|object|embed)\b/i, "禁止嵌入 iframe/object/embed。"],
    [/<form\b/i, "MVP 官网禁止生成表单。"],
    [/<script\b[^>]*\bsrc\s*=/i, "禁止引用外部脚本。"],
    [/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i, "禁止引用外部样式表。"],
    [/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, "禁止页面自动跳转。"],
    [/javascript\s*:/i, "禁止 javascript: URL。"],
    [/\bfetch\s*\(/i, "禁止生成页面主动发起 fetch 请求。"],
    [/\bXMLHttpRequest\b/i, "禁止 XMLHttpRequest。"],
    [/\bWebSocket\b/i, "禁止 WebSocket。"],
    [/\bsendBeacon\s*\(/i, "禁止 sendBeacon。"],
    [/\beval\s*\(/i, "禁止 eval。"],
    [/\bnew\s+Function\s*\(/i, "禁止动态 Function。"]
  ];
  for (const [pattern, message] of forbidden) {
    if (pattern.test(html)) errors.push(message);
  }
  return errors;
}

function publicImageUrl(sourceUrl: string) {
  if (/^https?:\/\//i.test(sourceUrl) || /^data:image\//i.test(sourceUrl)) return sourceUrl;
  if (!sourceUrl.startsWith("/") || sourceUrl.startsWith("//")) return null;
  const ossUrl = rootRelativeUrlToAliyunOssUrl(sourceUrl);
  if (ossUrl) return ossUrl;
  const publicBase = process.env.PUBLIC_ASSET_BASE_URL?.trim() || process.env.PUBLIC_SITE_BASE_URL?.trim();
  if (!publicBase || !/^https?:\/\//i.test(publicBase)) return null;
  return `${publicBase.replace(/\/+$/, "")}${sourceUrl}`;
}

function parseDataImage(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+)(;base64)?,([\s\S]*)$/i);
  if (!match) return null;
  const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return { mimeType: match[1].toLowerCase(), bytes: buffer.length, buffer };
}

function bufferDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function isRemoteVisionMimeType(mimeType: string) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType.toLowerCase());
}

export function isStructurallyValidImage(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") {
    return buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && buffer.includes(Buffer.from("IEND"));
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 16 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mimeType === "image/gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return buffer.length >= 14 && (header === "GIF87a" || header === "GIF89a") && buffer[buffer.length - 1] === 0x3b;
  }
  return false;
}

async function inlineRemoteImage(sourceUrl: string, maximumBytes: number): Promise<Omit<RemoteImageInput, "sourceUrl" | "label"> | null> {
  if (/^data:image\//i.test(sourceUrl)) {
    const parsed = parseDataImage(sourceUrl);
    return parsed && isRemoteVisionMimeType(parsed.mimeType) && parsed.bytes <= maximumBytes && isStructurallyValidImage(parsed.buffer, parsed.mimeType)
      ? { providerUrl: sourceUrl, mimeType: parsed.mimeType, bytes: parsed.bytes }
      : null;
  }

  const resolvedUrl = publicImageUrl(sourceUrl);
  if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl)) return null;
  let downloaded = await downloadAliyunOssObject(resolvedUrl);
  if (!downloaded) {
    const response = await fetch(resolvedUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!response?.ok) return null;
    const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || "";
    if (!mimeType.startsWith("image/")) return null;
    downloaded = { buffer: Buffer.from(await response.arrayBuffer()), mimeType };
  }
  const mimeType = downloaded.mimeType.split(";", 1)[0].trim().toLowerCase();
  if (!isRemoteVisionMimeType(mimeType) || downloaded.buffer.length > maximumBytes || !isStructurallyValidImage(downloaded.buffer, mimeType)) return null;
  return {
    providerUrl: bufferDataUrl(downloaded.buffer, mimeType),
    mimeType,
    bytes: downloaded.buffer.length
  };
}

async function remoteImageInputs(
  job: SiteJobDto,
  style: StyleConceptDto,
  contentAssets: ContentAsset[],
  maximum: number,
  maximumBytes: number
) {
  const styleReferences = uploadedStyleReferences(job);
  const designUrls = job.preferUploadedStyleReference && styleReferences.length ? styleReferences.map((asset) => asset.url) : [style.imageUrl];
  const candidates = [
    ...designUrls.map((url) => ({ url, label: "Design reference image. Analyze visual structure only; never display this image in the website." })),
    ...contentAssets.map((asset) => ({ url: asset.url, label: `Allowed website content image: ${asset.originalName || asset.role}.` }))
  ];
  const seen = new Set<string>();
  const inputs: RemoteImageInput[] = [];
  for (const item of candidates) {
    if (inputs.length >= maximum || seen.has(item.url)) continue;
    seen.add(item.url);
    const inlined = await inlineRemoteImage(item.url, maximumBytes);
    if (inlined) inputs.push({ sourceUrl: item.url, label: item.label, ...inlined });
  }
  return inputs;
}

async function callRemoteHtmlApi(config: RemoteHtmlConfig, prompt: string, images: RemoteImageInput[], siteJobId: string) {
  const messageContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  for (const image of images) {
    messageContent.push({ type: "text", text: image.label });
    messageContent.push({ type: "image_url", image_url: { url: image.providerUrl } });
  }

  const body: Record<string, unknown> = {
    model: config.model,
    stream: true,
    max_tokens: config.maxOutputTokens,
    messages: [
      {
        role: "system",
        content:
          "You are a senior frontend engineer. Follow the complete user specification. Return only one production-ready, self-contained HTML document."
      },
      { role: "user", content: messageContent }
    ]
  };
  if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 800);
      throw new Error(`远程官网生成接口 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
    }
    if (!response.body) throw new Error("远程官网生成接口没有返回流式响应体。");

    const parser = new ChatCompletionSseParser();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    const result = parser.finish();
    const html = extractRemoteHtml(result.content);
    const errors = validateRemoteHtml(html);
    if (errors.length) throw new Error(`远程模型返回的 HTML 未通过安全与完整性校验：${errors.join("；")}`);

    await recordModelUsage({
      provider: "remote-openai-compatible",
      operation: "site_remote_html_generation",
      model: result.model || config.model,
      endpoint: config.url,
      siteJobId,
      status: "success",
      promptCharacters: prompt.length,
      responseCharacters: html.length,
      durationMs: elapsedMs(startedAt),
      metadata: { stream: true, eventCount: result.eventCount, imageInputCount: images.length, timeoutMs: config.timeoutMs },
      ...result.usage
    });
    return { html, model: result.model || config.model, eventCount: result.eventCount, durationMs: elapsedMs(startedAt) };
  } catch (error) {
    const normalized = error instanceof Error && error.name === "AbortError" ? new Error(`远程官网生成超过 ${Math.round(config.timeoutMs / 1000)} 秒，已停止。`) : error;
    await recordModelUsage({
      provider: "remote-openai-compatible",
      operation: "site_remote_html_generation",
      model: config.model,
      endpoint: config.url,
      siteJobId,
      status: "error",
      promptCharacters: prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata: { stream: true, imageInputCount: images.length, timeoutMs: config.timeoutMs },
      error: normalized
    });
    throw normalized;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateRemoteHtmlWebsitePreview(
  job: SiteJobDto,
  style: StyleConceptDto,
  options: GenerateSitePreviewOptions = {}
): Promise<RemoteHtmlSitePreviewResult> {
  const config = remoteHtmlConfig();
  const runName = `${safeName(job.id)}-${Date.now()}`;
  const runDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "generated", "remote-html-runs", runName);
  const siteDir = path.join(runDir, "site");
  await mkdir(siteDir, { recursive: true });
  await writeFile(path.join(runDir, "remote-progress.log"), `[${new Date().toISOString()}] run created\n`, "utf8");

  const contentAssets = await resolveContentAssets(job, style);
  await writeFile(path.join(runDir, "content-assets.json"), JSON.stringify(contentAssets, null, 2), "utf8");
  const brief = buildBrief(job, style, contentAssets, options);
  await writeFile(path.join(runDir, "site-brief.json"), JSON.stringify(brief, null, 2), "utf8");
  const prompt = buildPrompt(brief, "raw_html");
  await writeFile(path.join(runDir, "prompt.md"), prompt, "utf8");
  const images = await remoteImageInputs(job, style, contentAssets, config.maxImageInputs, config.maxImageBytes);
  await writeFile(
    path.join(runDir, "remote-image-inputs.json"),
    JSON.stringify(
      images.map((image) => ({ sourceUrl: image.sourceUrl, label: image.label, mimeType: image.mimeType, bytes: image.bytes, transport: "data_url" })),
      null,
      2
    ),
    "utf8"
  );
  await appendFile(path.join(runDir, "remote-progress.log"), `[${new Date().toISOString()}] calling ${config.model}; images=${images.length}; timeoutMs=${config.timeoutMs}\n`, "utf8");

  const generated = await callRemoteHtmlApi(config, prompt, images, job.id);
  await writeFile(path.join(siteDir, "index.html"), generated.html, "utf8");
  await writeFile(
    path.join(runDir, "remote-result.json"),
    JSON.stringify({ model: generated.model, eventCount: generated.eventCount, durationMs: generated.durationMs, htmlCharacters: generated.html.length }, null, 2),
    "utf8"
  );
  await appendFile(path.join(runDir, "remote-progress.log"), `[${new Date().toISOString()}] index.html generated; publishing\n`, "utf8");
  const previewUrl = await publishSiteDirectory(siteDir, runName, contentAssets);
  await appendFile(path.join(runDir, "remote-progress.log"), `[${new Date().toISOString()}] published: ${previewUrl}\n`, "utf8");

  return {
    previewUrl,
    screenshotUrl: job.preferUploadedStyleReference ? uploadedStyleReferences(job)[0]?.url || style.imageUrl : style.imageUrl,
    generator: "remote_html",
    runDir,
    message: `${generated.model} 流式生成完成，共 ${generated.eventCount} 个事件。`
  };
}
