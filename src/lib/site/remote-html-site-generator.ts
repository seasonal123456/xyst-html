import path from "path";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { pathToFileURL } from "url";
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
import { runSiteQualityCheck, type SiteQualityCheckResult } from "@/lib/site/site-quality-checker";
import { downloadAliyunOssObject, rootRelativeUrlToAliyunOssUrl } from "@/lib/storage/aliyun-oss-storage";

export type RemoteHtmlSitePreviewResult = {
  previewUrl: string;
  screenshotUrl?: string;
  generator: "remote_html";
  runDir: string;
  message?: string;
};

export type PreparedRemoteHtmlExperimentResult = {
  outputDir: string;
  indexPath: string;
  model: string;
  reasoningEffort?: string;
  qualityMode: "codex_equivalent";
  durationMs: number;
  htmlCharacters: number;
  initialQualityCheck: SiteQualityCheckResult;
  finalQualityCheck: SiteQualityCheckResult;
  deterministicIssues: string[];
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
  qualityMode: "single_pass" | "codex_equivalent";
  planningMaxTokens: number;
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
  finishReason?: string;
  error?: string;
};

type ChatStreamChoice = {
  delta?: { content?: string | Array<{ type?: string; text?: string }> };
  message?: { content?: string };
  finish_reason?: string | null;
};

type ChatStreamEvent = {
  model?: string;
  choices?: ChatStreamChoice[];
  usage?: unknown;
  error?: { message?: string; code?: string; type?: string } | string;
  message?: string;
};

type QualityRepairContext = {
  html: string;
  issues: string[];
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

  const qualityMode = process.env.REMOTE_SITE_QUALITY_MODE?.trim().toLowerCase() === "codex_equivalent" ? "codex_equivalent" : "single_pass";
  return {
    url: buildApiUrl(baseUrl, process.env.REMOTE_SITE_API_ENDPOINT?.trim() || "/v1/chat/completions"),
    apiKey,
    model: process.env.REMOTE_SITE_MODEL?.trim() || "gpt-5.6-sol",
    timeoutMs: positiveInteger(process.env.REMOTE_SITE_TIMEOUT_MS, 900_000, 1_800_000),
    maxOutputTokens: positiveInteger(process.env.REMOTE_SITE_MAX_OUTPUT_TOKENS, qualityMode === "codex_equivalent" ? 48_000 : 24_000, 128_000),
    reasoningEffort: process.env.REMOTE_SITE_REASONING_EFFORT?.trim() || (qualityMode === "codex_equivalent" ? "high" : undefined),
    maxImageInputs: positiveInteger(process.env.REMOTE_SITE_MAX_IMAGE_INPUTS, 12, 40),
    maxImageBytes: positiveInteger(process.env.REMOTE_SITE_MAX_IMAGE_BYTES, 8_000_000, 20_000_000),
    qualityMode,
    planningMaxTokens: positiveInteger(process.env.REMOTE_SITE_PLANNING_MAX_TOKENS, 8_000, 24_000)
  };
}

export function remoteWebsiteSystemPrompt(qualityMode: RemoteHtmlConfig["qualityMode"]) {
  if (qualityMode === "codex_equivalent") {
    return [
      "You are a Codex-grade senior frontend designer and engineer producing a real customer website.",
      "Follow the complete specification and the approved design blueprint with equal care across the hero and every lower section.",
      "Return only one complete, production-ready, self-contained HTML document.",
      "Do not optimize for brevity. Use sufficient HTML, CSS, responsive behavior, visual layering, and lightweight interaction to meet every quality gate.",
      "Preserve approved business facts and required images, avoid generic template output, and always finish with closing body and html tags."
    ].join(" ");
  }
  return "You are a senior frontend engineer. Follow the complete user specification. Return only one production-ready, self-contained HTML document. Always finish with closing body and html tags.";
}

export function remoteDesignPlanSystemPrompt() {
  return [
    "You are the design director for a customer-facing official website.",
    "Study the complete brief and attached visual references before planning.",
    "Produce a concrete implementation blueprint for another senior frontend engineer.",
    "Cover the hero composition, every lower section, exact image placement, visual motifs, transitions, responsive behavior, typography, interaction, and factual constraints.",
    "Do not write HTML. Do not omit approved sections. Return a compact but specific JSON object only."
  ].join(" ");
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
      const providerError = typeof event.error === "string" ? event.error : event.error?.message || event.message;
      if (providerError) {
        this.state.error = providerError;
        return;
      }
      if (!this.state.model && event.model) this.state.model = event.model;
      const choice = event.choices?.[0];
      const piece = contentText(choice);
      if (piece) this.state.content += piece;
      if (choice?.finish_reason) this.state.finishReason = choice.finish_reason;
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

export function codexEquivalentHtmlIssues(html: string, requiredImageUrls: string[] = []) {
  const issues: string[] = [];
  const count = (pattern: RegExp) => Array.from(html.matchAll(pattern)).length;
  const sectionCount = count(/<section\b/gi);
  const headingCount = count(/<h2\b/gi);
  if (html.length < 30_000) issues.push(`HTML 仅 ${html.length} 字符，低于 Codex 同等质量模式的 30000 字符完整度基线。`);
  if (sectionCount < 6) issues.push(`页面只有 ${sectionCount} 个 section，至少需要 6 个完整板块。`);
  if (headingCount < 5) issues.push(`页面只有 ${headingCount} 个二级标题，较难覆盖完整官网内容。`);
  if (!/@media\b/i.test(html)) issues.push("缺少明确的响应式媒体查询。");
  if (!/:hover\b/i.test(html) || !/:focus-visible\b/i.test(html)) issues.push("按钮、导航或内容元素缺少完整 hover/focus-visible 状态。");
  if (!/prefers-reduced-motion/i.test(html)) issues.push("缺少 prefers-reduced-motion 动画降级。");
  if (!/<script\b/i.test(html) || !/(pointermove|mousemove|IntersectionObserver|scroll)/i.test(html)) {
    issues.push("缺少轻量、渐进增强的页面交互或滚动呈现细节。");
  }
  const craftedVisualCount = count(/(?:clip-path|mask(?:-image)?\s*:|linear-gradient\(|radial-gradient\(|conic-gradient\()/gi);
  if (craftedVisualCount < 6) issues.push(`视觉层次表达只有 ${craftedVisualCount} 处，曲线、遮罩或渐变衔接不足。`);
  for (const url of requiredImageUrls) {
    if (!html.includes(url)) issues.push(`缺少规定内容图片：${url}`);
  }
  return issues;
}

export function shouldRetryIncompleteRemoteHtml(errors: string[]) {
  const incompleteMessages = ["HTML 内容过短", "缺少 <!doctype html>", "HTML 根节点不完整", "head 节点不完整", "body 节点不完整", "缺少内联 style"];
  return errors.length > 0 && errors.every((error) => incompleteMessages.some((message) => error.includes(message)));
}

function combinedUsage(usages: Array<ParsedModelUsage | undefined>): ParsedModelUsage {
  const sum = (key: keyof ParsedModelUsage) => {
    const values = usages.map((usage) => usage?.[key]).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
  };
  return {
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    reasoningTokens: sum("reasoningTokens"),
    rawUsageJson: JSON.stringify(usages.map((usage) => usage?.rawUsageJson || null))
  };
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

async function callRemoteHtmlApi(
  config: RemoteHtmlConfig,
  prompt: string,
  images: RemoteImageInput[],
  siteJobId: string,
  diagnosticsDir: string,
  qualityRepair?: QualityRepairContext
) {
  const contentWithImages = (text: string) => {
    const content: Array<Record<string, unknown>> = [{ type: "text", text }];
    for (const image of images) {
      content.push({ type: "text", text: image.label });
      content.push({ type: "image_url", image_url: { url: image.providerUrl } });
    }
    return content;
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  const attempts: StreamState[] = [];
  let designPlan = "";
  const request = async (messages: Array<Record<string, unknown>>, maxTokens = config.maxOutputTokens, label = "generation") => {
    const body: Record<string, unknown> = {
      model: config.model,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: maxTokens,
      messages
    };
    if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;

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
    if (result.error) throw new Error(`远程官网生成接口流式错误：${result.error}`);
    if (!result.content.trim()) throw new Error("远程官网生成接口返回空流，未生成任何内容。");
    attempts.push(result);
    await writeFile(path.join(diagnosticsDir, `remote-response-attempt-${attempts.length}-${label}.txt`), result.content, "utf8");
    return result;
  };

  try {
    if (config.qualityMode === "codex_equivalent" && !qualityRepair) {
      const planning = await request(
        [
          { role: "system", content: remoteDesignPlanSystemPrompt() },
          {
            role: "user",
            content: contentWithImages(
              `${prompt}\n\nCreate the mandatory design implementation blueprint now. The blueprint must preserve every approved content section and assign every allowed content image a deliberate role.`
            )
          }
        ],
        config.planningMaxTokens,
        "design-plan"
      );
      designPlan = planning.content.trim();
      if (designPlan.length < 200) throw new Error("远程模型返回的设计规划过短，已停止生成低质量官网。");
      await writeFile(path.join(diagnosticsDir, "remote-design-plan.txt"), designPlan, "utf8");
    }

    const generationSpecification = qualityRepair
      ? `${prompt}\n\nYou are performing the mandatory final Codex-equivalent review and repair pass.\n\nCurrent complete HTML:\n${qualityRepair.html}\n\nDetected desktop/mobile and structural issues:\n${qualityRepair.issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n") || "No deterministic errors were detected. Still inspect the attached screenshots for generic composition, weak section hierarchy, poor visual balance, image cropping, text crowding, and mobile problems."}\n\nReturn a complete revised HTML document. Preserve all correct approved copy and required images, but visibly improve any weak or generic design. Do not return a patch or explanation.`
      : designPlan
        ? `${prompt}\n\nMandatory approved design blueprint:\n${designPlan}\n\nImplement this blueprint completely. It is not optional. Return only the final HTML document.`
        : prompt;
    let result = await request([
      {
        role: "system",
        content: qualityRepair
          ? "You are the final Codex-grade frontend reviewer and repair engineer. Inspect the current HTML and attached desktop/mobile screenshots, fix every reported or visible issue, preserve business facts and required images, and return only one fully revised production-ready self-contained HTML document. Do not optimize for brevity."
          : remoteWebsiteSystemPrompt(config.qualityMode)
      },
      { role: "user", content: contentWithImages(generationSpecification) }
    ], config.maxOutputTokens, qualityRepair ? "quality-repair" : "final-html");
    let html = extractRemoteHtml(result.content);
    let errors = validateRemoteHtml(html);

    if (shouldRetryIncompleteRemoteHtml(errors)) {
      result = await request([
        {
          role: "system",
          content:
            "Repair a truncated website response. Return only one complete, production-quality, self-contained HTML document. Preserve the approved content, design richness, responsive behavior, and all required customer images. Use inline CSS and always close head, body, and html. Do not use Markdown fences, forms, frames, external scripts/styles, or network calls."
        },
        {
          role: "user",
          content: `Original website specification and approved blueprint:\n${generationSpecification}\n\nTruncated response to repair:\n${result.content}`
        }
      ], config.maxOutputTokens, "truncation-repair");
      html = extractRemoteHtml(result.content);
      errors = validateRemoteHtml(html);
    }

    if (errors.length) throw new Error(`远程模型返回的 HTML 未通过安全与完整性校验：${errors.join("；")}`);

    const usage = combinedUsage(attempts.map((attempt) => attempt.usage));

    await recordModelUsage({
      provider: "remote-openai-compatible",
      operation: "site_remote_html_generation",
      model: result.model || config.model,
      endpoint: config.url,
      siteJobId,
      status: "success",
      requestCount: attempts.length,
      promptCharacters: prompt.length,
      responseCharacters: html.length,
      durationMs: elapsedMs(startedAt),
      metadata: {
        stream: true,
        attempts: attempts.length,
        eventCounts: attempts.map((attempt) => attempt.eventCount),
        finishReasons: attempts.map((attempt) => attempt.finishReason || null),
        responseCharacters: attempts.map((attempt) => attempt.content.length),
        imageInputCount: images.length,
        timeoutMs: config.timeoutMs,
        qualityMode: config.qualityMode,
        stage: qualityRepair ? "quality_repair" : "initial_generation",
        designPlanCharacters: designPlan.length,
        reasoningEffort: config.reasoningEffort || null,
        maxOutputTokens: config.maxOutputTokens
      },
      ...usage
    });
    return {
      html,
      model: result.model || config.model,
      eventCount: attempts.reduce((total, attempt) => total + attempt.eventCount, 0),
      attempts: attempts.length,
      finishReasons: attempts.map((attempt) => attempt.finishReason || null),
      durationMs: elapsedMs(startedAt)
    };
  } catch (error) {
    const normalized = error instanceof Error && error.name === "AbortError" ? new Error(`远程官网生成超过 ${Math.round(config.timeoutMs / 1000)} 秒，已停止。`) : error;
    await recordModelUsage({
      provider: "remote-openai-compatible",
      operation: "site_remote_html_generation",
      model: config.model,
      endpoint: config.url,
      siteJobId,
      status: "error",
      requestCount: Math.max(1, attempts.length),
      promptCharacters: prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata: {
        stream: true,
        attempts: attempts.length,
        eventCounts: attempts.map((attempt) => attempt.eventCount),
        finishReasons: attempts.map((attempt) => attempt.finishReason || null),
        responseCharacters: attempts.map((attempt) => attempt.content.length),
        imageInputCount: images.length,
        timeoutMs: config.timeoutMs,
        qualityMode: config.qualityMode,
        stage: qualityRepair ? "quality_repair" : "initial_generation",
        designPlanCharacters: designPlan.length,
        reasoningEffort: config.reasoningEffort || null,
        maxOutputTokens: config.maxOutputTokens
      },
      ...combinedUsage(attempts.map((attempt) => attempt.usage)),
      error: normalized
    });
    throw normalized;
  } finally {
    clearTimeout(timer);
  }
}

async function screenshotImageInputs(paths: string[], maximumBytes: number): Promise<RemoteImageInput[]> {
  const inputs: RemoteImageInput[] = [];
  for (let index = 0; index < paths.length; index += 1) {
    const screenshotPath = paths[index];
    const buffer = await readFile(screenshotPath).catch(() => null);
    if (!buffer || buffer.length > maximumBytes || !isStructurallyValidImage(buffer, "image/png")) continue;
    inputs.push({
      sourceUrl: screenshotPath,
      providerUrl: bufferDataUrl(buffer, "image/png"),
      label: `${index === 0 ? "Desktop" : "Mobile"} screenshot of the first generated website. Inspect it for visual and responsive defects before revising.`,
      mimeType: "image/png",
      bytes: buffer.length
    });
  }
  return inputs;
}

function imageMimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

export async function runPreparedRemoteHtmlExperiment(input: {
  prompt: string;
  siteJobId: string;
  outputDir: string;
  imageFiles: Array<{ path: string; label: string }>;
  requiredImageUrls?: string[];
  model?: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
}): Promise<PreparedRemoteHtmlExperimentResult> {
  const baseConfig = remoteHtmlConfig();
  const config: RemoteHtmlConfig = {
    ...baseConfig,
    qualityMode: "codex_equivalent",
    model: input.model?.trim() || "gpt-5.6-sol",
    reasoningEffort: input.reasoningEffort?.trim() || "high",
    maxOutputTokens: input.maxOutputTokens || Math.max(48_000, baseConfig.maxOutputTokens)
  };
  const outputDir = path.resolve(input.outputDir);
  const siteDir = path.join(outputDir, "site");
  const indexPath = path.join(siteDir, "index.html");
  await mkdir(siteDir, { recursive: true });
  const images: RemoteImageInput[] = [];
  for (const imageFile of input.imageFiles.slice(0, config.maxImageInputs)) {
    const buffer = await readFile(imageFile.path);
    const mimeType = imageMimeTypeFromPath(imageFile.path);
    if (buffer.length > config.maxImageBytes) throw new Error(`实验图片超过大小限制：${imageFile.path}`);
    if (!isStructurallyValidImage(buffer, mimeType)) throw new Error(`实验图片结构无效：${imageFile.path}`);
    images.push({
      sourceUrl: imageFile.path,
      providerUrl: bufferDataUrl(buffer, mimeType),
      label: imageFile.label,
      mimeType,
      bytes: buffer.length
    });
  }
  await writeFile(
    path.join(outputDir, "experiment-config.json"),
    JSON.stringify(
      {
        siteJobId: input.siteJobId,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        qualityMode: config.qualityMode,
        maxOutputTokens: config.maxOutputTokens,
        planningMaxTokens: config.planningMaxTokens,
        imageCount: images.length,
        requiredImageCount: input.requiredImageUrls?.length || 0
      },
      null,
      2
    ),
    "utf8"
  );

  const startedAt = Date.now();
  let generated = await callRemoteHtmlApi(config, input.prompt, images, input.siteJobId, outputDir);
  await writeFile(path.join(outputDir, "initial-index.html"), generated.html, "utf8");
  await writeFile(indexPath, generated.html, "utf8");
  const initialQualityCheck = await runSiteQualityCheck({ url: pathToFileURL(indexPath).toString(), jobId: `${input.siteJobId}-experiment-initial`, force: true });
  await writeFile(path.join(outputDir, "initial-quality-check.json"), JSON.stringify(initialQualityCheck, null, 2), "utf8");
  const initialIssues = [
    ...codexEquivalentHtmlIssues(generated.html, input.requiredImageUrls || []),
    ...initialQualityCheck.issues.map(
      (issue) => `${issue.viewport} ${issue.severity} ${issue.code}: ${issue.message}${issue.detail ? ` (${issue.detail})` : ""}`
    )
  ];
  const screenshots = await screenshotImageInputs(initialQualityCheck.screenshots, config.maxImageBytes);
  generated = await callRemoteHtmlApi(
    config,
    input.prompt,
      screenshots.slice(0, config.maxImageInputs),
    input.siteJobId,
    outputDir,
    { html: generated.html, issues: initialIssues }
  );
  await writeFile(indexPath, generated.html, "utf8");
  const finalQualityCheck = await runSiteQualityCheck({ url: pathToFileURL(indexPath).toString(), jobId: `${input.siteJobId}-experiment-final`, force: true });
  await writeFile(path.join(outputDir, "final-quality-check.json"), JSON.stringify(finalQualityCheck, null, 2), "utf8");
  const deterministicIssues = codexEquivalentHtmlIssues(generated.html, input.requiredImageUrls || []);
  await writeFile(path.join(outputDir, "final-deterministic-issues.json"), JSON.stringify(deterministicIssues, null, 2), "utf8");
  const result: PreparedRemoteHtmlExperimentResult = {
    outputDir,
    indexPath,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    qualityMode: "codex_equivalent",
    durationMs: elapsedMs(startedAt),
    htmlCharacters: generated.html.length,
    initialQualityCheck,
    finalQualityCheck,
    deterministicIssues
  };
  await writeFile(path.join(outputDir, "experiment-result.json"), JSON.stringify(result, null, 2), "utf8");
  return result;
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

  let generated = await callRemoteHtmlApi(config, prompt, images, job.id, runDir);
  let initialQualityCheck: SiteQualityCheckResult | undefined;
  let finalQualityCheck: SiteQualityCheckResult | undefined;
  const requiredImageUrls = contentAssets.filter((asset) => asset.mimeType.startsWith("image/")).map((asset) => asset.url);
  const indexPath = path.join(siteDir, "index.html");
  await writeFile(indexPath, generated.html, "utf8");

  if (config.qualityMode === "codex_equivalent") {
    initialQualityCheck = await runSiteQualityCheck({ url: pathToFileURL(indexPath).toString(), jobId: `${job.id}-initial`, force: true });
    await writeFile(path.join(runDir, "initial-quality-check.json"), JSON.stringify(initialQualityCheck, null, 2), "utf8");
    const deterministicIssues = codexEquivalentHtmlIssues(generated.html, requiredImageUrls);
    const browserIssues = initialQualityCheck.issues.map(
      (issue) => `${issue.viewport} ${issue.severity} ${issue.code}: ${issue.message}${issue.detail ? ` (${issue.detail})` : ""}`
    );
    const screenshotInputs = await screenshotImageInputs(initialQualityCheck.screenshots, config.maxImageBytes);
    generated = await callRemoteHtmlApi(
      config,
      prompt,
      screenshotInputs.slice(0, config.maxImageInputs),
      job.id,
      runDir,
      { html: generated.html, issues: [...deterministicIssues, ...browserIssues] }
    );
    await writeFile(indexPath, generated.html, "utf8");
    finalQualityCheck = await runSiteQualityCheck({ url: pathToFileURL(indexPath).toString(), jobId: `${job.id}-final`, force: true });
    await writeFile(path.join(runDir, "final-quality-check.json"), JSON.stringify(finalQualityCheck, null, 2), "utf8");
    const finalDeterministicIssues = codexEquivalentHtmlIssues(generated.html, requiredImageUrls);
    await writeFile(path.join(runDir, "final-deterministic-issues.json"), JSON.stringify(finalDeterministicIssues, null, 2), "utf8");
    if (finalQualityCheck.status === "failed" || finalDeterministicIssues.length) {
      const details = [...finalDeterministicIssues, ...finalQualityCheck.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message)];
      throw new Error(`Codex 同等质量模式最终检查未通过：${details.slice(0, 8).join("；")}`);
    }
  }
  await writeFile(
    path.join(runDir, "remote-result.json"),
    JSON.stringify(
      {
        model: generated.model,
        attempts: generated.attempts,
        finishReasons: generated.finishReasons,
        eventCount: generated.eventCount,
        durationMs: generated.durationMs,
        htmlCharacters: generated.html.length,
        qualityMode: config.qualityMode,
        initialQualityCheck: initialQualityCheck
          ? { status: initialQualityCheck.status, issueCount: initialQualityCheck.issueCount, reportPath: initialQualityCheck.reportPath }
          : null,
        finalQualityCheck: finalQualityCheck
          ? { status: finalQualityCheck.status, issueCount: finalQualityCheck.issueCount, reportPath: finalQualityCheck.reportPath }
          : null
      },
      null,
      2
    ),
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
    message: `${generated.model} 流式生成完成，共 ${generated.eventCount} 个事件、${generated.attempts} 次请求。`
  };
}
