import { spawn } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { access, appendFile, mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { elapsedMs, extractUsageFromResponse, recordModelUsage } from "@/lib/model-usage";
import { buildDesignPresetPrompt, getDefaultWebsiteDesignPreset } from "@/lib/site/design-ui-library";
import { buildEnhancedDeploymentPlan } from "@/lib/site/enhanced-deployment-plan";
import { buildLayoutTextBudgetPrompt, layoutTextBudgetJson } from "@/lib/site/layout-text-budget";
import { downloadAliyunOssObject, rootRelativeUrlToAliyunOssUrl } from "@/lib/storage/aliyun-oss-storage";
import { saveFileBuffer, saveGeneratedImage } from "@/lib/storage/storage-provider";
import { getSiteImageBudget } from "@/lib/site/site-image-budget";
import type { CopyModule, SiteAssetDto, SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";
import { styleConditionSummary } from "@/lib/site/style-design-conditions";

export type CodexSitePreviewResult = {
  previewUrl: string;
  screenshotUrl?: string;
  generator: "codex";
  runDir: string;
  message?: string;
};

type CodexRunOptions = {
  timeoutMs: number;
  model?: string;
  siteJobId?: string;
};

export type GenerateSitePreviewOptions = {
  revisionInstruction?: string;
};

export type ContentAsset = {
  originalName: string;
  mimeType: string;
  url: string;
  role: string;
};

type SiteImageApiResponse = {
  data?: Array<{
    b64_json?: string;
    base64?: string;
    url?: string;
  }>;
  imageBase64?: string;
  image_base64?: string;
  imageUrl?: string;
  image_url?: string;
  url?: string;
};

type SiteImageConfig = {
  baseUrl: string;
  endpoint: string;
  apiKey: string;
  model: string;
  size: string;
  quality: string;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "site";
}

function safeAssetName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "asset";
}

function resolveCodexFromPath() {
  const pathValue = process.env.PATH || process.env.Path || "";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, `codex${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findBundledCodexCli() {
  if (process.platform !== "win32") return null;
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  if (!homeDir) return null;

  const extensionsRoot = path.join(homeDir, ".vscode", "extensions");
  try {
    return (
      readdirSync(extensionsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^openai\.chatgpt-.*-win32-x64$/.test(entry.name))
        .map((entry) => path.join(extensionsRoot, entry.name, "bin", "windows-x86_64", "codex.exe"))
        .filter((candidate) => existsSync(candidate))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] || null
    );
  } catch {
    return null;
  }
}

function resolveCodexCliPath() {
  const configured = process.env.CODEX_CLI_PATH?.trim();
  if (configured) return configured;
  return resolveCodexFromPath() || findBundledCodexCli() || "codex";
}

function buildOpenAiImageUrl(baseUrl: string, endpoint: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const requestPath = endpoint.replace(/^\/+/, "");
  if (base.endsWith("/v1") && requestPath.startsWith("v1/")) {
    return `${base}/${requestPath.slice(3)}`;
  }
  return `${base}/${requestPath}`;
}

function getSiteImageConfig(): SiteImageConfig | null {
  const apiKey = process.env.SITE_IMAGE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    baseUrl: process.env.SITE_IMAGE_API_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com",
    endpoint: process.env.SITE_IMAGE_API_ENDPOINT?.trim() || process.env.OPENAI_IMAGE_ENDPOINT?.trim() || "/v1/images/generations",
    apiKey,
    model: process.env.SITE_IMAGE_MODEL?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2",
    size: process.env.SITE_IMAGE_SIZE?.trim() || "1024x1024",
    quality: process.env.SITE_IMAGE_QUALITY?.trim() || ""
  };
}

function requireContentImagesWhenNoUploads() {
  return process.env.SITE_REQUIRE_CONTENT_IMAGES_WHEN_NO_UPLOADS?.trim().toLowerCase() !== "false";
}

function minimumGeneratedContentImagesWhenNoUploads() {
  const configured = Number(process.env.SITE_MIN_CONTENT_IMAGES_WHEN_NO_UPLOADS || 1);
  if (!Number.isFinite(configured) || configured <= 0) return 1;
  return Math.min(3, Math.floor(configured));
}

function buildSiteImagePrompt(job: SiteJobDto, style: StyleConceptDto, slot: "hero" | "scene" | "detail") {
  const slotInstruction =
    slot === "hero"
      ? "官网首屏可用的横向主视觉，突出业务主体、真实质感和品牌氛围，留出文字叠加空间。"
      : slot === "scene"
        ? "官网中部内容板块可用的场景图，展示客户使用场景、服务场景或产品应用场景。"
        : "官网下方内容板块可用的细节图或扁平品牌插画，适合放在优势、流程、联系 CTA 附近。";

  return [
    "生成一张可用于真实企业官网的原创配图，不要生成整站网页截图，不要带导航栏、网页卡片、按钮或大量文字。",
    slotInstruction,
    "画面必须像官网内容素材，而不是网站设计稿。不得包含任何已有风格参考图的界面截图、网页排版、假浏览器窗口、假仪表盘、假 App UI、假按钮、假标签、乱码文字、卡片套卡片或截图拼贴。",
    "如果客户行业不是软件、SaaS、数据平台或数字产品，不得生成 dashboard/mockup/interface 风格配图；优先生成真实行业场景、空间、人物、产品、作品或服务过程。",
    "英雄图可用性标准：一眼能看懂行业，主体足够大，画面有空间感，可铺满首屏或半屏，留有干净文字区或可加遮罩，质感像真实品牌官网照片，不像模板素材拼图。",
    "禁止灰白、低对比、雾蒙蒙、主体过小、行业弱相关的通用素材；宁可生成更真实的行业场景，也不要生成看似高级但廉价的 UI 展板。",
    "图片风格应延续已选官网方向的色彩气质、光影、质感和高级感，但画面内容要服务客户业务本身。",
    "避免生成商标、二维码、可读小字、虚假证书、夸张数据、真实品牌名或侵权元素。",
    `客户业务：${job.businessDescription}`,
    `网站用途：${job.websitePurpose}`,
    `已选风格：${style.styleName}；${style.emotionalDescription || style.styleDescription}`,
    `内部视觉条件：\n${styleConditionSummary(style)}`
  ].join("\n");
}

export function isSiteImageSafetyRejection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /safety(?:_|\s|-)?violations?|safety system|content[_\s-]?policy|moderation|request was rejected.*safety|sexual/i.test(message);
}

function safeRetryColorDirection(style: StyleConceptDto) {
  const source = [style.styleName, style.styleDescription, style.emotionalDescription, style.colorTendency].filter(Boolean).join(" ");
  const colors = ["黑", "白", "灰", "红", "橙", "黄", "绿", "青", "蓝", "紫", "金", "银"]
    .filter((color) => source.includes(color))
    .slice(0, 3);
  return colors.length ? `配色以${colors.join("、")}为主，保持现代、高对比和清晰商业质感。` : "使用中性、高对比、现代的商业品牌配色。";
}

export function buildSafetyRetrySiteImagePrompt(style: StyleConceptDto, slot: "hero" | "scene" | "detail") {
  const slotInstruction =
    slot === "hero"
      ? "横向官网首屏品牌主视觉，主体集中在一侧，并留出宽敞、干净的文字叠加区域。"
      : slot === "scene"
        ? "官网中部可用的品牌陈列场景，展示包装、材质样片、工作台、货架或零售空间细节。"
        : "官网下方可用的产品材质细节、包装局部、工具陈列或抽象品牌纹理。";

  return [
    "生成一张完全非敏感、适合公开企业官网的原创商业配图。",
    slotInstruction,
    "画面只展示不透明产品包装、平铺商品、材质纹理、印刷样片、工作室工具、货架陈列、桌面静物或抽象品牌图形。",
    "画面必须是无人商业静物，不出现人物、穿戴展示、生活方式模特或情境表演。",
    "只按本提示生成，不引用其他业务描述，不生成可读文字、商标、二维码、证书或真实品牌名。",
    "不要生成网页截图、浏览器窗口、导航栏、卡片、按钮、App UI、仪表盘或设计稿拼贴。",
    "画面要像真实品牌摄影或高级商品静物，清晰、高对比、主体明确，可直接用于响应式官网。",
    safeRetryColorDirection(style)
  ].join("\n");
}

async function requestSiteImage(
  config: SiteImageConfig,
  prompt: string,
  context: { siteJobId: string; slot: "hero" | "scene" | "detail"; index: number; promptMode?: "business" | "safety_retry" }
): Promise<SiteImageApiResponse> {
  const body: Record<string, string | number> = {
    model: config.model,
    prompt,
    n: 1,
    size: config.size
  };
  if (config.quality) body.quality = config.quality;

  const endpoint = buildOpenAiImageUrl(config.baseUrl, config.endpoint);
  const startedAt = Date.now();
  const metadata = {
    size: config.size,
    quality: config.quality || undefined,
    slot: context.slot,
    index: context.index,
    promptMode: context.promptMode || "business"
  };
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    await recordModelUsage({
      provider: "openai",
      operation: "site_content_image",
      model: config.model,
      endpoint,
      siteJobId: context.siteJobId,
      status: "error",
      imageCount: 1,
      promptCharacters: prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata,
      error
    });
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    await recordModelUsage({
      provider: "openai",
      operation: "site_content_image",
      model: config.model,
      endpoint,
      siteJobId: context.siteJobId,
      status: "error",
      imageCount: 1,
      promptCharacters: prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata,
      error: `HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`
    });
    throw new Error(`官网内容配图生成失败：HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }

  const json = (await response.json()) as SiteImageApiResponse;
  await recordModelUsage({
    provider: "openai",
    operation: "site_content_image",
    model: config.model,
    endpoint,
    siteJobId: context.siteJobId,
    imageCount: 1,
    promptCharacters: prompt.length,
    responseCharacters: JSON.stringify(json).length,
    durationMs: elapsedMs(startedAt),
    metadata,
    ...extractUsageFromResponse(json)
  });

  return json;
}

async function saveGeneratedSiteImage(jobId: string, index: number, image: SiteImageApiResponse): Promise<ContentAsset> {
  const item = image.data?.[0];
  const imageBase64 = item?.b64_json || item?.base64 || image.imageBase64 || image.image_base64;
  const imageUrl = item?.url || image.imageUrl || image.image_url || image.url;
  const filename = `site-content-${jobId}-${Date.now()}-${index + 1}.png`;
  const stored = await saveGeneratedImage({ jobId, filename, imageBase64, sourceImageUrl: imageUrl });

  return {
    originalName: `AI 生成官网内容配图 ${index + 1}`,
    mimeType: stored.mimeType || "image/png",
    url: stored.url,
    role: "generated_site_visual"
  };
}

async function generateFallbackContentAssets(job: SiteJobDto, style: StyleConceptDto): Promise<ContentAsset[]> {
  const budget = await getSiteImageBudget(job.id);
  if (budget.remaining <= 0) return [];

  const config = getSiteImageConfig();
  if (!config) return [];

  const allSlots: Array<"hero" | "scene" | "detail"> = ["hero", "scene", "detail"];
  const slots = allSlots.slice(0, Math.min(3, budget.remaining));
  const assets: ContentAsset[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    const latestBudget = await getSiteImageBudget(job.id);
    if (latestBudget.remaining <= 0) break;

    try {
      const result = await requestSiteImage(config, buildSiteImagePrompt(job, style, slots[index]), {
        siteJobId: job.id,
        slot: slots[index],
        index,
        promptMode: "business"
      });
      assets.push(await saveGeneratedSiteImage(job.id, index, result));
    } catch (error) {
      if (isSiteImageSafetyRejection(error)) {
        const retryBudget = await getSiteImageBudget(job.id);
        if (retryBudget.remaining <= 0) {
          throw new Error("官网内容配图触发了图片服务的内容安全审核，且当前图片额度不足以执行安全提示词重试。请调整敏感业务表述或上传合规产品图片后重试。");
        }

        try {
          const retryResult = await requestSiteImage(config, buildSafetyRetrySiteImagePrompt(style, slots[index]), {
            siteJobId: job.id,
            slot: slots[index],
            index,
            promptMode: "safety_retry"
          });
          assets.push(await saveGeneratedSiteImage(job.id, index, retryResult));
          continue;
        } catch (retryError) {
          console.warn(
            `[site-content-image] safety retry failed for ${job.id}: ${
              retryError instanceof Error ? retryError.message : String(retryError)
            }`
          );
          throw new Error(
            "官网内容配图未通过图片服务的内容安全审核。系统已自动改用不含人物、身体或暗示性场景的商品静物方案重试，仍未成功。请调整敏感业务表述或上传合规产品图片后重新生成。"
          );
        }
      }

      console.warn(
        `[site-content-image] skipped generated content image for ${job.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      break;
    }
  }
  return assets;
}

export async function resolveContentAssets(job: SiteJobDto, style: StyleConceptDto): Promise<ContentAsset[]> {
  const uploadedImages = job.assets
    .filter((asset) => asset.mimeType.startsWith("image/") && asset.assetRole !== "style_reference" && asset.assetRole !== "qr_code")
    .map((asset) => ({
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      url: asset.url,
      role: asset.assetRole || "business_asset"
    }));

  if (uploadedImages.length > 0) return uploadedImages;
  const generatedImages = await generateFallbackContentAssets(job, style);
  const minimumImages = minimumGeneratedContentImagesWhenNoUploads();
  if (requireContentImagesWhenNoUploads() && generatedImages.length < minimumImages) {
    throw new Error(
      `客户未上传业务图片，且官网内容配图只生成了 ${generatedImages.length}/${minimumImages} 张。为避免交付无图官网，已停止生成。请检查图片模型密钥/额度后重新生成，或让客户上传门店、产品、作品、团队、空间等真实图片。`
    );
  }
  return generatedImages;
}

function getCopyModules(job: SiteJobDto): CopyModule[] {
  const finalCopy = job.copyVersions.find((version) => version.id === job.finalCopyVersionId || version.isFinal) || job.copyVersions[0];
  return finalCopy?.contentJson.slice().sort((a, b) => a.order - b.order) || [];
}

function publicUrlToFilePath(url: string | null | undefined) {
  if (!url?.startsWith("/")) return null;
  const cleaned = url.split("?")[0].replace(/^\/+/, "");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", cleaned);
}

function isSkippableUrl(url: string) {
  const trimmed = url.trim();
  return (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:")
  );
}

function isLikelyAssetUrl(url: string) {
  const withoutQuery = url.split(/[?#]/)[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg|ico|avif|css|js|woff2?|ttf|otf|mp4|webm|pdf)$/i.test(withoutQuery);
}

function extractAssetUrls(html: string) {
  const urls = new Set<string>();
  const attributePattern = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;
  const srcsetPattern = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
  const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(html))) {
    urls.add(match[1].trim());
  }

  while ((match = srcsetPattern.exec(html))) {
    for (const candidate of match[1].split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) urls.add(url);
    }
  }

  while ((match = cssUrlPattern.exec(html))) {
    urls.add(match[1].trim());
  }

  return Array.from(urls).filter((url) => !isSkippableUrl(url) && (url.startsWith("/") || /^https?:\/\//i.test(url) || isLikelyAssetUrl(url)));
}

function replaceAllLiteral(input: string, search: string, replacement: string) {
  return input.split(search).join(replacement);
}

function injectChineseHeadlineGuard(html: string) {
  if (html.includes("xinying-headline-guard")) return html;

  const guard = `
<style id="xinying-headline-guard">
  :where(h1, .hero h1, .hero-title, .headline, .page-title, [data-headline-guard]) {
    text-wrap: balance;
    word-break: keep-all;
    overflow-wrap: normal;
  }
  :where(h1, h2, h3, h4, p, a, button, label, small, strong, b, span) {
    max-width: 100%;
  }
  :where(.card, .feature, .feature-card, .service-card, .stat-card, .info-card, .contact-card, .form-card, .panel, .banner, [class*="card"], [class*="panel"]) {
    min-width: 0;
  }
  :where(.card, .feature, .feature-card, .service-card, .stat-card, .info-card, .contact-card, .form-card, .panel, .banner, [class*="card"], [class*="panel"]) :where(h2, h3, h4, p, b, strong) {
    overflow-wrap: anywhere;
  }
  :where(button, .button, .btn, .pill, .chip, .tag, [class*="button"], [class*="btn"], [class*="pill"], [class*="chip"], [class*="tag"]) {
    max-width: 100%;
    white-space: normal;
    text-wrap: balance;
    line-height: 1.25;
  }
  :where([class*="float"], [class*="floating"], [class*="sticky"], [class*="dock"], [class*="contact-bar"], [class*="contactBar"]) {
    max-width: min(100%, 100vw);
  }
  :where(h1, .hero-title, .headline, .page-title) > .headline-line {
    display: block;
  }
  @media (max-width: 640px) {
    :where(h1, .hero h1, .hero-title, .headline, .page-title, [data-headline-guard]) {
      max-width: 100%;
    }
    :where([class*="float"], [class*="floating"], [class*="dock"], [class*="contact-bar"], [class*="contactBar"], [data-mobile-flow]) {
      position: static !important;
      transform: none !important;
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      inset: auto !important;
    }
  }
</style>
<script id="xinying-headline-guard-script">
(() => {
  const cjkPattern = /[\\u3400-\\u9fff]/g;
  const countCjk = (value) => (value.match(cjkPattern) || []).length;
  const candidates = () => Array.from(document.querySelectorAll("h1, .hero-title, .headline, .page-title, [data-headline-guard]"));
  const textFitCandidates = () => Array.from(document.querySelectorAll([
    "h1", "h2", "h3", "h4",
    "button", ".button", ".btn", ".pill", ".chip", ".tag",
    "[class*='button']", "[class*='btn']", "[class*='pill']", "[class*='chip']", "[class*='tag']",
    ".card h2", ".card h3", ".card h4", ".card p",
    "[class*='card'] h2", "[class*='card'] h3", "[class*='card'] h4", "[class*='card'] p",
    "[class*='panel'] h2", "[class*='panel'] h3", "[class*='panel'] h4", "[class*='panel'] p"
  ].join(",")));

  function fitSingleLine(el) {
    const originalSize = Number.parseFloat(getComputedStyle(el).fontSize || "0");
    if (!originalSize || el.dataset.headlineGuardFitted === "1") return;
    el.dataset.headlineGuardFitted = "1";
    el.style.whiteSpace = "nowrap";
    el.style.wordBreak = "keep-all";
    el.style.overflowWrap = "normal";

    const minSize = window.innerWidth <= 640 ? 24 : 32;
    let size = originalSize;
    while (el.scrollWidth > el.clientWidth && size > minSize) {
      size -= 1;
      el.style.fontSize = size + "px";
    }

    if (el.scrollWidth > el.clientWidth) {
      el.style.whiteSpace = "";
      el.style.textWrap = "balance";
      el.style.fontSize = Math.max(minSize, size - 1) + "px";
    }
  }

  function applyHeadlineGuard() {
    for (const el of candidates()) {
      const text = (el.innerText || el.textContent || "").replace(/\\s+/g, "");
      const cjkCount = countCjk(text);
      if (!cjkCount) continue;
      el.style.textWrap = "balance";
      el.style.wordBreak = "keep-all";
      el.style.overflowWrap = "normal";
      if (cjkCount >= 5 && cjkCount <= 12) fitSingleLine(el);
    }
  }

  function fitOverflowText(el) {
    const style = getComputedStyle(el);
    const originalSize = Number.parseFloat(style.fontSize || "0");
    if (!originalSize || el.dataset.textFitDone === "1") return;
    el.dataset.textFitDone = "1";
    el.style.minWidth = "0";
    el.style.maxWidth = "100%";
    if (style.whiteSpace === "nowrap") el.style.whiteSpace = "normal";
    if (style.overflow === "hidden") el.style.overflow = "visible";
    el.style.overflowWrap = "anywhere";

    const minSize = window.innerWidth <= 640 ? 13 : 14;
    let size = originalSize;
    while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) && size > minSize) {
      size -= 1;
      el.style.fontSize = size + "px";
      if (el.scrollHeight > el.clientHeight + 2) {
        const parent = el.parentElement;
        if (parent) {
          const parentStyle = getComputedStyle(parent);
          if (parentStyle.overflow === "hidden") parent.style.overflow = "visible";
          if (parentStyle.height !== "auto") parent.style.minHeight = parent.getBoundingClientRect().height + "px";
        }
      }
    }
  }

  function applyTextFitGuard() {
    for (const el of textFitCandidates()) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) fitOverflowText(el);
    }
  }

  const run = () => requestAnimationFrame(() => {
    applyHeadlineGuard();
    applyTextFitGuard();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
  window.addEventListener("resize", () => {
    for (const el of candidates()) delete el.dataset.headlineGuardFitted;
    for (const el of textFitCandidates()) delete el.dataset.textFitDone;
    run();
  }, { passive: true });
})();
</script>`;

  if (html.includes("</head>")) return html.replace("</head>", `${guard}\n</head>`);
  return `${guard}\n${html}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isImageContentAsset(asset: ContentAsset) {
  return asset.mimeType.startsWith("image/");
}

function htmlContainsAssetUrl(html: string, url: string) {
  return html.includes(url) || html.includes(escapeHtml(url));
}

function injectBeforeClosingTag(html: string, tagName: "head" | "main" | "body", content: string) {
  const pattern = new RegExp(`</${tagName}>`, "i");
  if (!pattern.test(html)) return null;
  return html.replace(pattern, `${content}\n</${tagName}>`);
}

function buildCompleteImageGallerySection(missingAssets: ContentAsset[]) {
  const items = missingAssets
    .map(
      (asset, index) => `
        <figure class="ai-complete-image-card">
          <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.originalName || `客户上传图片 ${index + 1}`)}" loading="lazy" decoding="async" />
        </figure>`
    )
    .join("");

  return `
    <section class="ai-complete-image-gallery" aria-label="完整图片资料">
      <div class="ai-complete-image-gallery__inner">
        <div class="ai-complete-image-gallery__head">
          <p>Uploaded Gallery</p>
          <h2>完整图片资料</h2>
        </div>
        <div class="ai-complete-image-gallery__grid">
          ${items}
        </div>
      </div>
    </section>`;
}

function ensureAllContentImagesUsed(html: string, contentAssets: ContentAsset[]) {
  const requiredImages = contentAssets.filter(isImageContentAsset);
  const missingAssets = requiredImages.filter((asset) => !htmlContainsAssetUrl(html, asset.url));
  if (!missingAssets.length) return { html, missingAssets };

  const styles = `
    <style>
      .ai-complete-image-gallery {
        position: relative;
        padding: clamp(56px, 8vw, 110px) 0;
        background: linear-gradient(135deg, rgba(8, 22, 37, .06), rgba(255, 255, 255, .78));
        overflow: hidden;
      }
      .ai-complete-image-gallery::before {
        content: "";
        position: absolute;
        inset: 0 auto auto 0;
        width: 42%;
        height: 100%;
        background: linear-gradient(135deg, rgba(14, 165, 233, .12), transparent);
        clip-path: polygon(0 0, 100% 0, 72% 100%, 0 100%);
        pointer-events: none;
      }
      .ai-complete-image-gallery__inner {
        position: relative;
        width: min(1180px, calc(100% - 40px));
        margin: 0 auto;
      }
      .ai-complete-image-gallery__head {
        display: grid;
        gap: 8px;
        margin-bottom: 28px;
      }
      .ai-complete-image-gallery__head p {
        margin: 0;
        color: #0f766e;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      .ai-complete-image-gallery__head h2 {
        margin: 0;
        color: #06111f;
        font-size: clamp(28px, 4vw, 48px);
        line-height: 1.08;
      }
      .ai-complete-image-gallery__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
      }
      .ai-complete-image-card {
        margin: 0;
        min-height: 220px;
        border-radius: 8px;
        overflow: hidden;
        background: rgba(255, 255, 255, .78);
        box-shadow: 0 18px 48px rgba(15, 23, 42, .12);
      }
      .ai-complete-image-card img {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 220px;
        object-fit: cover;
      }
      @media (max-width: 640px) {
        .ai-complete-image-gallery__grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .ai-complete-image-card,
        .ai-complete-image-card img {
          min-height: 160px;
        }
      }
    </style>`;
  const section = buildCompleteImageGallerySection(missingAssets);
  let nextHtml = injectBeforeClosingTag(html, "head", styles) || `${styles}\n${html}`;
  nextHtml =
    injectBeforeClosingTag(nextHtml, "main", section) ||
    injectBeforeClosingTag(nextHtml, "body", section) ||
    `${nextHtml}\n${section}`;
  return { html: nextHtml, missingAssets };
}

function assetFilename(index: number, sourceUrl: string, mimeType: string) {
  const pathname = (() => {
    try {
      return decodeURIComponent(new URL(sourceUrl, "https://local.invalid").pathname);
    } catch {
      return sourceUrl.split(/[?#]/)[0];
    }
  })();
  const base = safeAssetName(path.basename(pathname, path.extname(pathname)) || `asset-${index}`);
  const ext = path.extname(pathname).toLowerCase() || extensionFromMimeType(mimeType) || ".bin";
  return `${String(index).padStart(3, "0")}-${base}${ext}`;
}

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/svg+xml") return ".svg";
  if (normalized === "text/css") return ".css";
  if (normalized === "application/javascript" || normalized === "text/javascript") return ".js";
  if (normalized === "font/woff2") return ".woff2";
  if (normalized === "font/woff") return ".woff";
  return "";
}

async function assetBufferFromUrl(sourceUrl: string, siteDir: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (sourceUrl.startsWith("/") && !sourceUrl.startsWith("//")) {
    const localPath = publicUrlToFilePath(sourceUrl);
    if (!localPath) return null;
    try {
      return { buffer: await readFile(localPath), mimeType: mimeTypeFromPath(localPath) };
    } catch {
      const ossUrl = rootRelativeUrlToAliyunOssUrl(sourceUrl);
      if (!ossUrl) return null;
      return fetchRemoteAsset(ossUrl);
    }
  }

  if (/^https?:\/\//i.test(sourceUrl)) {
    return fetchRemoteAsset(sourceUrl);
  }

  if (isLikelyAssetUrl(sourceUrl)) {
    const relativePath = sourceUrl.split(/[?#]/)[0].replace(/^\.?\//, "");
    const localPath = path.join(siteDir, decodeURIComponent(relativePath));
    try {
      return { buffer: await readFile(localPath), mimeType: mimeTypeFromPath(localPath) };
    } catch {
      return null;
    }
  }

  return null;
}

async function fetchRemoteAsset(sourceUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const response = await fetch(sourceUrl);
    if (response.ok) {
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type") || "application/octet-stream"
      };
    }
  } catch {
    // Try OSS authenticated download below.
  }

  try {
    return await downloadAliyunOssObject(sourceUrl);
  } catch {
    return null;
  }
}

function imageExtensionFromMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  return "";
}

function isCodexAttachableImage(mimeType: string) {
  return Boolean(imageExtensionFromMimeType(mimeType));
}

function dataImageBuffer(sourceUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = sourceUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  if (!isCodexAttachableImage(mimeType)) return null;
  return { buffer: Buffer.from(match[2], "base64"), mimeType };
}

async function localizeReferenceImage(sourceUrl: string, index: number, runDir: string): Promise<string | null> {
  const referenceDir = path.join(runDir, "reference-images");

  if (sourceUrl.startsWith("/") && !sourceUrl.startsWith("//")) {
    const filePath = publicUrlToFilePath(sourceUrl);
    if (filePath) {
      try {
        await access(filePath);
        if (isCodexAttachableImage(mimeTypeFromPath(filePath))) return filePath;
      } catch {
        // Continue to OSS URL conversion below.
      }
    }
  }

  const dataImage = dataImageBuffer(sourceUrl);
  const remoteUrl = sourceUrl.startsWith("/") && !sourceUrl.startsWith("//") ? rootRelativeUrlToAliyunOssUrl(sourceUrl) : sourceUrl;
  const downloaded = dataImage || (/^https?:\/\//i.test(remoteUrl || "") ? await fetchRemoteAsset(remoteUrl!) : null);
  if (!downloaded || !isCodexAttachableImage(downloaded.mimeType)) return null;

  await mkdir(referenceDir, { recursive: true });
  const ext = imageExtensionFromMimeType(downloaded.mimeType);
  const filename = `${String(index).padStart(2, "0")}-${safeAssetName(path.basename(sourceUrl.split(/[?#]/)[0]) || "reference")}${ext}`;
  const localPath = path.join(referenceDir, filename);
  await writeFile(localPath, downloaded.buffer);
  return localPath;
}

export function uploadedStyleReferences(job: SiteJobDto) {
  return job.assets.filter((asset) => asset.mimeType.startsWith("image/") && asset.assetRole === "style_reference");
}

function uploadedQrCodes(job: SiteJobDto) {
  return job.assets.filter((asset) => asset.mimeType.startsWith("image/") && asset.assetRole === "qr_code");
}

function getMaxAttachedImages() {
  const configured = Number(process.env.SITE_CODEX_MAX_ATTACHED_IMAGES || 40);
  if (!Number.isFinite(configured) || configured <= 0) return 40;
  return Math.floor(configured);
}

async function existingImagePaths(job: SiteJobDto, style: StyleConceptDto, contentAssets: ContentAsset[], runDir: string) {
  const styleReferences = uploadedStyleReferences(job);
  const designReferenceUrls =
    job.preferUploadedStyleReference && styleReferences.length
      ? styleReferences.map((asset) => asset.url)
      : [style.imageUrl];
  const candidates = [...designReferenceUrls, ...contentAssets.map((asset) => asset.url)];
  const unique = Array.from(new Set(candidates)).slice(0, getMaxAttachedImages());
  const existing: string[] = [];
  for (let index = 0; index < unique.length; index += 1) {
    const filePath = await localizeReferenceImage(unique[index], index + 1, runDir);
    if (filePath) existing.push(filePath);
  }
  return existing;
}

export function buildBrief(
  job: SiteJobDto,
  style: StyleConceptDto,
  contentAssets: ContentAsset[],
  options: GenerateSitePreviewOptions = {}
) {
  const finalCopyModules = getCopyModules(job);
  const finalCopyDraft = finalCopyModules.map((module) => `${module.moduleName}\n${module.content}`).join("\n\n");
  const designPreset = getDefaultWebsiteDesignPreset();
  const styleReferences = uploadedStyleReferences(job);
  const qrCodes = uploadedQrCodes(job);
  const designReferenceMode = job.preferUploadedStyleReference && styleReferences.length ? "uploaded_style_reference" : "generated_style_concept";
  const enhancedDeploymentPlan = buildEnhancedDeploymentPlan(job, style);
  const layoutTextBudget = layoutTextBudgetJson();
  return {
    jobId: job.id,
    customerName: job.customerName,
    customerContact: job.customerContact,
    businessDescription: job.businessDescription,
    websitePurpose: job.websitePurpose,
    selectedStyle: {
      styleName: style.styleName,
      styleDescription: style.styleDescription,
      suitableFor: style.suitableFor,
      schemeType: style.schemeType,
      layoutStyle: style.layoutStyle,
      colorTendency: style.colorTendency,
      visualTechniques: style.visualTechniques,
      emotionalDescription: style.emotionalDescription,
      designConditionSummary: styleConditionSummary(style),
      mode: style.mode,
      usageRule:
        designReferenceMode === "uploaded_style_reference"
          ? "The generated style concept image is not attached and must not be used as a design basis. Use uploadedStyleReferences as the primary design basis."
          : "Style reference only. Do not use this image as a website image, background, screenshot, preview panel, product image, or content asset."
    },
    designReference: {
      mode: designReferenceMode,
      preferUploadedStyleReference: job.preferUploadedStyleReference,
      rule:
        designReferenceMode === "uploaded_style_reference"
          ? "Use the customer's uploaded website screenshots as the primary design basis. Do not use the generated website concept image as visual basis."
          : "Use the selected generated website concept image as the primary design basis."
    },
    designBlueprintPolicy: {
      priority:
        "Selected design reference image is the first source of truth for final website structure, section rhythm, lines, image slots, whitespace, CTA positions, and first-screen composition.",
      replacementRule:
        "Closely imitate the selected preview/reference composition, then replace placeholder content with customer-uploaded images and approved Chinese copy.",
      industryRole:
        "Industry type only corrects business facts and required content. It must not override the selected preview/reference structure or force a generic industry template."
    },
    enhancedDeploymentPlan,
    layoutTextBudget,
    uploadedStyleReferences: styleReferences.map((asset) => ({
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      url: asset.url,
      role: asset.assetRole || "style_reference"
    })),
    contactQrCodes: qrCodes.map((asset) => ({
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      url: asset.url,
      role: "qr_code",
      usageRule: "Use only in the contact section, WeChat/contact card, or final CTA area. Never use as hero image, background, gallery image, project image, decoration, or visual texture."
    })),
    favoriteStyles: job.styleConcepts
      .filter((item) => item.isFavorite)
      .map((item) => ({
        styleName: item.styleName,
        styleDescription: item.styleDescription,
        suitableFor: item.suitableFor,
        schemeType: item.schemeType,
        layoutStyle: item.layoutStyle,
        colorTendency: item.colorTendency,
        visualTechniques: item.visualTechniques,
        emotionalDescription: item.emotionalDescription,
        designConditionSummary: styleConditionSummary(item),
        mode: item.mode
      })),
    imagePolicy: {
      styleReferenceIsAttachedOnly: true,
      styleReferenceMayBeUsedInHtml: false,
      allowedImageUrls: [...contentAssets.map((asset) => asset.url), ...qrCodes.map((asset) => asset.url)],
      contactQrCodeUrls: qrCodes.map((asset) => asset.url),
      requiredImageUrls: contentAssets.filter(isImageContentAsset).map((asset) => asset.url),
      requiredImageCount: contentAssets.filter(isImageContentAsset).length,
      everyUploadedBusinessImageMustAppear: contentAssets.some((asset) => asset.role !== "generated_site_visual"),
      noUploadedBusinessImages: !job.assets.some((asset) => asset.mimeType.startsWith("image/") && asset.assetRole !== "style_reference" && asset.assetRole !== "qr_code"),
      qrCodeUsageRule:
        "QR code URLs are allowed only for direct-contact conversion UI. They must not count as business photos and must not appear in hero, background, gallery, project/case images, decorative masks, or texture layers."
    },
    designPreset: {
      id: designPreset.id,
      name: designPreset.name,
      description: designPreset.description,
      colorTokens: designPreset.colorTokens,
      layoutRules: designPreset.layoutRules,
      sectionPatterns: designPreset.sectionPatterns,
      interactionRules: designPreset.interactionRules
    },
    revision: {
      isRevision: Boolean(options.revisionInstruction?.trim()),
      instruction: options.revisionInstruction?.trim() || "",
      previousPreviewUrl: job.previewUrl || "",
      previousScreenshotUrl: job.screenshotUrl || "",
      previousRevisions: job.revisions
        .slice()
        .sort((a, b) => a.versionNumber - b.versionNumber)
        .map((revision) => ({
          versionNumber: revision.versionNumber,
          instruction: revision.revisionInstruction,
          status: revision.status,
          previewUrl: revision.previewUrl,
          createdAt: revision.createdAt
        }))
    },
    assets: contentAssets,
    finalCopyDraft,
    finalCopyModules: finalCopyModules.map((module) => ({
      moduleId: module.moduleId,
      moduleName: module.moduleName,
      content: module.content,
      lockedRanges: module.lockedRanges,
      manualEdited: module.manualEdited
    }))
  };
}

export function buildPrompt(brief: unknown, outputMode: "workspace" | "raw_html" = "workspace") {
  const designPresetPrompt = buildDesignPresetPrompt();
  const layoutTextBudgetPrompt = buildLayoutTextBudgetPrompt();
  const outputInstruction =
    outputMode === "raw_html"
      ? `Return exactly one complete HTML document starting with <!doctype html> and ending with </html>.
Do not use Markdown fences, explanations, summaries, filenames, or any text before/after the HTML document.
Use enough HTML, CSS, and lightweight interaction code to meet the full visual-quality specification. Do not shorten or flatten the design merely to reduce output size. Always reserve enough output budget to finish the complete document and closing </body></html>.`
      : `Create a polished, production-looking website preview in the folder named site.`;
  const fileInstruction =
    outputMode === "raw_html"
      ? `- Return the contents of index.html directly. Put CSS in a <style> tag and any tiny interaction in a <script> tag.`
      : `- Create only site/index.html. Put CSS in a <style> tag and any tiny interaction in a <script> tag.
- Do not create files outside the site folder.`;
  const expectedOutput =
    outputMode === "raw_html"
      ? `Expected output: one raw, complete index.html document and nothing else.`
      : `Expected output:
site/
  index.html

After writing site/index.html, briefly summarize what was created.`;
  return `You are generating the final customer website for an AI website workbench.

${outputInstruction}

Hard requirements:
${fileInstruction}
- Do not inspect the repository, install packages, run npm, call external APIs, or use external CDN assets.
- Use UTF-8 and preserve all customer-approved Chinese copy from the brief below. You may arrange, section, and lightly title content, but do not invent qualifications, awards, data, cases, addresses, or promises the customer did not provide.
- Design reference policy:
  1. If Brief JSON designReference.mode is "uploaded_style_reference", the customer's uploaded website screenshots are the primary design basis. The generated website concept image is not attached and must not be inferred as visual source.
  2. If Brief JSON designReference.mode is "generated_style_concept", the selected generated concept image is the primary design basis.
  3. Design references are for visual analysis only: composition, spacing, color, curves, typography mood, imagery treatment, and interaction tone.
  4. Never place any design reference screenshot or generated concept image into the website as visible content.
- Image use policy is strict:
  1. Attached design reference image(s) are for visual analysis only.
  2. Never place design reference image(s) into the website. Do not use them as <img>, CSS background, screenshot mockup, preview thumbnail, card image, product image, poster, srcset, or any visible website content.
  3. Use only imagePolicy.allowedImageUrls and assets[] as real website image sources. These are the customer's uploaded business images or AI-generated content images made for this website.
  4. If imagePolicy.requiredImageUrls contains customer/uploaded business images, every required image URL must appear at least once in the final HTML. For many photos, create a polished gallery/case/photo section rather than omitting images.
  5. If assets[] contains multiple images, distribute them across hero, case/project/photo gallery, feature, and lower sections. Do not repeatedly use the same image everywhere. Prefer each image no more than 2 times.
  6. If assets[] contains AI-generated content images, treat them as normal website content photos/illustrations and blend them into the selected style.
  7. If Brief JSON contains contactQrCodes or imagePolicy.contactQrCodeUrls, those QR code images are direct-contact assets only. Use them only in a contact section, WeChat/contact card, or final CTA area. Never use a QR code as hero image, background, gallery image, project/case image, decorative image, texture, mask, or visual placeholder.
- Do not leave broken or decorative-only image references. Every <img>, CSS background url(...), poster, or srcset URL must point to an allowed image URL from imagePolicy.allowedImageUrls or to an inline SVG/data asset you create yourself. Never reference invented filenames, missing local files, or the style reference image.
- If you reference a brief image URL such as /generated/... or /uploads/..., use it consistently and make sure the image has a meaningful alt or is purely decorative with empty alt. The publishing system will localize these real image URLs into the final preview package.
- Use the attached design reference image(s) only as visual direction for layout, spacing, color, and first-screen impact.
- Treat the attached design reference image(s) as the primary visual source of truth for design language, stronger than textual style labels, but never copy them into the page as content. Closely transfer their overall composition logic, section rhythm, color relationships, curve/gradient language, button/corner treatment, imagery treatment, and density into original HTML/CSS.
- Structure priority is strict: selected design reference image / uploaded reference screenshot > customer uploaded materials > approved copy > industry type > generic website conventions. The industry type may correct content, but must not force a generic industry template when the selected preview has a stronger layout.
- The final site may highly imitate the selected preview/reference image's structure, lines, section order, image slots, whitespace, and CTA placement. Replace its placeholder-looking content with customer photos, generated content images, and approved Chinese copy.
- Brief JSON selectedStyle may include internal random design conditions: schemeType, layoutStyle, colorTendency, visualTechniques, and emotionalDescription. Treat these as control variables for the generated website. They should shape section order, grid rhythm, color saturation, transitions, CTA placement, image masks, and hover details. Do not print these internal labels visibly on the website.
- Full-width immersive hero rule: when the business has a real space, storefront, product, venue, project, factory, classroom, artwork, food, hotel, clinic, or other visible scene, and a suitable image exists or can be generated, prefer a full-width immersive landscape hero instead of a small right-side image card. The hero should use one generous background/dominant image across the first screen, with left/left-center text, gradient/mask readability, 0-3 small non-dashboard floating badges, and an optional bottom information strip. Do not use this layout if no suitable visual exists.
- Full-width hero must not become a UI board: no fake browser, dashboard, app panel, screenshot collage, or card-on-card main visual for non-software businesses.
- Mobile floating-layer degradation rule: desktop floating badges, data cards, and contact bars may be used for visual depth, but on mobile they must become normal document-flow modules. In mobile CSS, set risky floating/absolute/fixed contact/stat layers to position: static or otherwise reserve enough space; never let them cover headings, images, buttons, contact text, or the next section.
- Text capacity rule: design slots must control copy length. Do not put long Chinese sentences into small cards, chips, buttons, stat labels, or floating layers. If a text cannot fit the visual slot, shorten it, split it into title + body, or move it to a normal paragraph.
${layoutTextBudgetPrompt}
- Use this internal website design UI library as a baseline for craft quality. Adapt it to the customer's business; do not make every industry look like the same SaaS product:
${designPresetPrompt}
- If Brief JSON revision.isRevision is true, this is a customer-requested revised version. Treat revision.instruction as a hard priority while preserving the approved business facts, selected style, and useful structure from the previous version. Fix the requested issues visibly. Do not merely add a small note about the revision.
- When revising, use previousPreviewUrl only as context that a previous version existed. Do not reference it as an external dependency in the generated HTML.
- If selectedStyle.mode is "fallback" or "mock", mention the limitation in the internal summary and still create the best possible site from the text brief. If selectedStyle.mode is "real", the final HTML/CSS must visibly approach the attached style image rather than a generic template.
- The website must feel like a complete official website, not a wireframe: strong hero, navigation, content sections, image areas, contact CTA, footer, responsive mobile layout.
- MVP direct-contact rule: do not create forms, input fields, appointment widgets, signup flows, login/member/admin/customer-portal UI, lead-capture handlers, placeholder submit actions, or Netlify Functions/Supabase integration notes. If the copy mentions consultation, appointment, signup, quote, or getting a plan, convert the action into direct phone/WeChat contact. Build a polished contact section, contact person card, phone/WeChat CTA buttons, optional QR/WeChat card if provided, and mobile-friendly sticky contact CTA.
- Hero immersion rule: when it is visually appropriate and there is a suitable AI-generated content image or customer-uploaded business image, make the hero feel like it has one full, generous image presence as the background or dominant visual field. Use overlays, gradients, masks, and careful contrast so text remains readable; do not reduce all imagery to small cards if a broad image treatment would make the first viewport more immersive.
- Hero visual priority rule:
  1. First priority: use customer-uploaded real photos of storefronts, works, teams, products, spaces, classes, venues, projects, or service processes when they are suitable.
  2. Second priority: use AI-generated content images only if they look like realistic, immersive, industry-specific brand photography or polished editorial visuals.
  3. Third priority: if no image is truly suitable, use a clean text-led hero with a local works/case/gallery strip below. It is better to be clean than to force a cheap visual.
- Hero image quality rule: the hero visual must look like a real brand website image, not a temporary UI board. It must be industry-obvious, subject-forward, spatial, immersive, and usable as a full or half-screen background/visual field. Unless the customer is specifically a software/SaaS/digital-product business, do not use fake browser windows, dashboards, app screens, data panels, card stacks, screenshot-in-screenshot compositions, or mockup UI as the main visual. For local services, education, training, manufacturing, retail, restaurants, venues, portfolios, and offline businesses, use authentic business scenes, products, spaces, works, people, or process images instead.
- Hero visual forbidden list: no fake admin interface, fake browser chrome, fake SaaS panel, fake app UI, small image inside another card, card-on-card collage, screenshot embedded in another screenshot, gray/low-contrast/misty subjectless picture, weakly related generic stock scene, AI gibberish text, fake buttons, or fake UI labels in the image/visual field.
- Chinese headline typography rule: large Chinese headings must have intentional semantic line breaks. Do not rely on automatic wrapping for hero/contact headlines. Use inline spans or <br> only at natural phrase boundaries, and avoid leaving 1-2 Chinese characters alone on the last line. If a headline would wrap awkwardly, shorten it or reduce font size/container width before finalizing. Bad example: "从一次尝试开始，慢慢走进绘 / 画". Better: "从一次尝试开始 / 慢慢走进绘画".
- Hero headline implementation rule: give the main hero headline a clear selector such as class="hero-title" or data-headline-guard. For 5-12 Chinese characters, keep the headline on one line whenever possible. For longer headlines, split it into balanced semantic lines with <span class="headline-line">...</span> or <br>, for example 8/8, 6/7, or 7/7 characters, never 7/1 or 10/2. Add CSS such as text-wrap: balance; word-break: keep-all; overflow-wrap: normal; and responsive font-size/container adjustments so desktop, tablet, and mobile do not create orphan Chinese characters.
- Before finalizing HTML, mentally test the hero headline at desktop and mobile widths. If any line would contain only 1-2 Chinese characters, revise the wording, line break, font size, max-width, or layout.
- Text completeness implementation rule: for every visible text container, avoid fixed heights that can clip text. Use min-height instead of height for cards with text, avoid overflow:hidden on text wrappers, and add min-width:0 to grid/flex children that contain text. Buttons and chips must allow a readable fallback on mobile or be shortened.
- Metric and info card copy rule: do not display backend-like field/value pairs such as "课程方向 5", "咨询报名 刘先生", or "年度作品展 2次" unless the wording is meaningful to a visitor. Convert them into natural phrases with context, for example "5 类课程方向", "每年 2 次作品展", "刘先生为你介绍适合的课程". If the brief does not provide a credible number, do not invent one; use benefit-oriented copy instead of a stat card.
- Do not only design the hero. The lower sections must also be carefully designed: services, advantages, process, projects/cases, FAQ or contact CTA should each have a distinct visual treatment.
- Strong personalization is mandatory. The section rhythm, visual metaphors, composition, icons/illustrations, and CTA style must match the customer's actual industry and copy. A lawyer, industrial park, factory, consultant, ad agency, and local service business must not share the same generic website structure.
- Avoid stacking generic rectangular cards from top to bottom. Use tasteful organic transitions between sections: overlapping image cutouts, offset grids, gradient bands, diagonal or curved section boundaries, floating panels, masks, timeline elements, asymmetric composition, and visual motifs that continue across sections.
- At least 2 lower-page sections must use non-plain-rectangle composition, such as clipped/cutout imagery, overlapping layers, diagonal/wave separators, staggered cards, or gradient transitions that blend one section into the next.
- The page must visibly carry over the richness of the selected style reference. A clean but flat rectangular page is not acceptable. Before finishing, ensure the page has a designed sense of depth, flow, and handcrafted composition.
- Mandatory visual craft checklist:
  1. At least 3 section transitions must use curved, diagonal, wave, ellipse, mask, or gradient blending treatments, not straight white-to-white cuts.
  2. At least 3 image or visual areas must use cutout-style layering, clip-path/mask, offset frames, overlapping captions, or rotated/staggered panels.
  3. At least 2 content groups must intentionally break the basic card grid with staggered vertical offsets, asymmetric columns, timeline curves, orbit layouts, flowing bands, or cross-section floating panels.
  4. Use layered gradients, translucent surfaces, subtle shadows, and continuing visual motifs so adjacent sections feel connected rather than isolated.
  5. If the selected style reference has distinctive curves, colors, image framing, or button shapes, translate those traits into the final HTML/CSS.
- Mandatory interaction checklist:
  1. Add polished hover/focus-visible states for primary buttons, secondary buttons, navigation links, content cards, image panels, and process/feature items.
  2. Hover states must be visible and tasteful: transform translate/scale, shadow change, image zoom, gradient shift, underline reveal, border glow, or icon movement.
  3. Use CSS transitions with sensible durations. Avoid jumpy movement, layout shifts, or text overlap.
  4. Add at least one lightweight mouse-driven effect when appropriate, such as a hero visual tilt, spotlight, floating accent shift, or parallax layer. Keep it progressive and safe; the page must still work without JavaScript.
  5. Respect prefers-reduced-motion by disabling or reducing non-essential animation.
- If the business is abstract, service-based, or lacks enough real photos, create 1 to 2 inline flat-style SVG illustrations that extend the selected website style. The illustrations should be simple, polished, on-brand, and relevant to the business concept. Do not use external image services or CDN assets.
- Use customer photos when they exist, and do not omit uploaded business photos. Combine them with masks, cutout-style framing, offset captions, or layered backgrounds so the final website does not look like a plain gallery.
- Do not add payment, login/member/admin UI, appointment widgets, lead-capture forms, fake input fields, or backend-ready form comments. Keep conversion lightweight and real: phone calls, WeChat, contact person, address, and direct-contact CTA only. Never present fake business data as if it were real.
- Avoid dark blurred stock-like visuals unless the selected style clearly asks for it.
- Ensure mobile layout is clean: no overlapping text, no horizontal scroll, clear CTA.
- Before finishing, perform a strict visual QA pass on the final HTML/CSS:
  1. Every image URL used by <img>, srcset, poster, or CSS background must load and must be visible in the intended section.
  2. Hero text must not cover product images, CTA buttons, badges, navigation, or important visual content.
  3. Large Chinese headlines must have deliberate, readable line breaks at phrase boundaries; no single-character or two-character orphan line is allowed. Short hero titles of 5-12 Chinese characters should usually stay on one line, with font size adjusted instead of allowing one trailing character to fall to the next line.
  4. Data/info cards must read like customer-facing marketing copy, not raw admin fields or database labels.
  5. No visible text may be clipped, hidden behind overlays, or squeezed into a container too small for it.
  6. Check desktop and mobile mentally before finalizing: no horizontal scroll, no broken image placeholders, no awkward one-character/one-word line breaks.
  7. Desktop floating layers must not cover important content. Mobile floating layers must degrade into normal stacked modules.
  8. Long Chinese copy must obey Brief JSON layoutTextBudget. If a title/card/button is too long, rewrite it shorter before finalizing.
- Build the complete customer-facing experience. Visual richness, section completeness, responsive behavior, and careful interaction details are required; brevity is not a quality goal.
- Quality gate before final answer: inspect your own HTML/CSS mentally. If it lacks obvious curved/diagonal/gradient transitions, layered cutout composition, and hover dynamics, revise site/index.html before summarizing.

${expectedOutput}

Brief JSON:
${JSON.stringify(brief, null, 2)}`;
}

function mimeTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function collectFiles(dir: string, root = dir): Promise<Array<{ filePath: string; relativePath: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ filePath: string; relativePath: string }> = [];

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(filePath, root)));
      continue;
    }
    if (entry.isFile()) {
      files.push({
        filePath,
        relativePath: path.relative(root, filePath).replace(/\\/g, "/")
      });
    }
  }

  return files;
}

export async function publishSiteDirectory(siteDir: string, runName: string, contentAssets: ContentAsset[]): Promise<string> {
  const siteStat = await stat(siteDir);
  if (!siteStat.isDirectory()) {
    throw new Error("Codex site output is not a directory.");
  }

  const files = await collectFiles(siteDir);
  if (!files.some((file) => file.relativePath === "index.html")) {
    throw new Error("Codex site output missing index.html.");
  }

  let indexUrl = "";
  const indexFile = files.find((file) => file.relativePath === "index.html");
  let rewrittenIndex: Buffer | null = null;
  const extraAssets: Array<{ relativePath: string; data: Buffer; mimeType: string }> = [];

  if (indexFile) {
    let html = (await readFile(indexFile.filePath)).toString("utf8");
    const completedImages = ensureAllContentImagesUsed(html, contentAssets);
    html = completedImages.html;
    if (completedImages.missingAssets.length) {
      await writeFile(
        path.join(path.dirname(siteDir), "auto-injected-missing-images.json"),
        JSON.stringify(completedImages.missingAssets, null, 2),
        "utf8"
      );
    }
    const seen = new Map<string, string>();
    let assetIndex = 1;

    for (const sourceUrl of extractAssetUrls(html)) {
      if (seen.has(sourceUrl)) {
        html = replaceAllLiteral(html, sourceUrl, seen.get(sourceUrl)!);
        continue;
      }

      const asset = await assetBufferFromUrl(sourceUrl, siteDir);
      if (!asset) continue;

      const relativePath = `assets/${assetFilename(assetIndex, sourceUrl, asset.mimeType)}`;
      assetIndex += 1;
      extraAssets.push({ relativePath, data: asset.buffer, mimeType: asset.mimeType });
      seen.set(sourceUrl, relativePath);
      html = replaceAllLiteral(html, sourceUrl, relativePath);
    }

    html = injectChineseHeadlineGuard(html);
    rewrittenIndex = Buffer.from(html, "utf8");
  }

  for (const file of files) {
    const stored = await saveFileBuffer({
      type: "generated",
      filename: `codex-sites/${runName}/${file.relativePath}`,
      buffer: file.relativePath === "index.html" && rewrittenIndex ? rewrittenIndex : await readFile(file.filePath),
      mimeType: mimeTypeFromPath(file.filePath)
    });
    if (file.relativePath === "index.html") {
      indexUrl = stored.url;
    }
  }

  for (const asset of extraAssets) {
    await saveFileBuffer({
      type: "generated",
      filename: `codex-sites/${runName}/${asset.relativePath}`,
      buffer: asset.data,
      mimeType: asset.mimeType
    });
  }

  return indexUrl;
}

function runCodex(prompt: string, workDir: string, imagePaths: string[], options: CodexRunOptions) {
  return new Promise<void>((resolve, reject) => {
    const codexPath = resolveCodexCliPath();
    const lastMessagePath = path.join(workDir, "codex-last-message.txt");
    const progressPath = path.join(workDir, "codex-progress.log");
    const stdoutPath = path.join(workDir, "codex-stdout.log");
    const stderrPath = path.join(workDir, "codex-stderr.log");
    const startedAt = Date.now();
    const model = options.model || process.env.OPENAI_TEXT_MODEL?.trim() || "codex-default";
    const reasoningEffort = process.env.CODEX_SITE_REASONING_EFFORT?.trim() || "xhigh";
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;

    const finish = async (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      await recordModelUsage({
        provider: "codex-cli",
        operation: "site_codex_generation",
        model,
        endpoint: codexPath,
        siteJobId: options.siteJobId,
        status: error ? "error" : "success",
        imageCount: imagePaths.length,
        promptCharacters: prompt.length,
        responseCharacters: stdout.length + stderr.length,
        durationMs: elapsedMs(startedAt),
        metadata: {
          workDir,
          imagePathCount: imagePaths.length,
          timeoutMs: options.timeoutMs,
          reasoningEffort
        },
        error
      });
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const args = [
      "exec",
      "-C",
      workDir,
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-rules",
      "-s",
      "workspace-write",
      "--output-last-message",
      lastMessagePath
    ];

    if (options.model) {
      args.push("-m", options.model);
    }
    args.push("-c", `model_reasoning_effort="${reasoningEffort}"`);

    for (const imagePath of imagePaths) {
      args.push("-i", imagePath);
    }

    args.push("-");
    void appendFile(progressPath, `[${new Date().toISOString()}] starting codex ${model}; images=${imagePaths.length}; timeoutMs=${options.timeoutMs}\n`, "utf8");

    if (path.isAbsolute(codexPath) && !existsSync(codexPath)) {
      void appendFile(progressPath, `[${new Date().toISOString()}] codex cli missing: ${codexPath}\n`, "utf8");
      void finish(new Error(`Codex CLI not found: ${codexPath}. Set CODEX_CLI_PATH to the full codex.exe path and restart the worker.`));
      return;
    }

    if (process.platform === "win32" && codexPath === "codex") {
      void appendFile(progressPath, `[${new Date().toISOString()}] codex cli missing from PATH\n`, "utf8");
      void finish(new Error("Codex CLI not found in worker PATH. Set CODEX_CLI_PATH to the full codex.exe path and restart the worker."));
      return;
    }

    const child = spawn(codexPath, args, {
      cwd: workDir,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32" && !path.isAbsolute(codexPath)
    });

    timer = setTimeout(() => {
      child.kill();
      void appendFile(progressPath, `[${new Date().toISOString()}] timeout; killing codex process\n`, "utf8");
      void finish(new Error(`Codex generation timed out after ${Math.round(options.timeoutMs / 1000)}s`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      void appendFile(stdoutPath, chunk).catch(() => undefined);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      void appendFile(stderrPath, chunk).catch(() => undefined);
    });
    child.on("error", (error) => {
      void appendFile(progressPath, `[${new Date().toISOString()}] spawn error: ${error.message}\n`, "utf8");
      void finish(error);
    });
    child.on("close", async (code) => {
      await appendFile(progressPath, `[${new Date().toISOString()}] codex closed with code ${code}\n`, "utf8").catch(() => undefined);
      await writeFile(stdoutPath, stdout, "utf8").catch(() => undefined);
      await writeFile(stderrPath, stderr, "utf8").catch(() => undefined);
      if (code === 0) {
        void finish();
        return;
      }
      void finish(new Error(`Codex exited with code ${code}. ${stderr || stdout}`.slice(0, 1200)));
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function hasGeneratedIndex(siteDir: string) {
  try {
    await access(path.join(siteDir, "index.html"));
    return true;
  } catch {
    return false;
  }
}

export async function generateCodexWebsitePreview(
  job: SiteJobDto,
  style: StyleConceptDto,
  options: GenerateSitePreviewOptions = {}
): Promise<CodexSitePreviewResult> {
  const runName = `${safeName(job.id)}-${Date.now()}`;
  const runDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "generated", "codex-runs", runName);
  const siteDir = path.join(runDir, "site");
  const timeoutMs = Number(process.env.CODEX_SITE_TIMEOUT_MS || 600000);
  const model = process.env.CODEX_SITE_MODEL?.trim() || undefined;

  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "codex-progress.log"), `[${new Date().toISOString()}] run created\n`, "utf8");
  const contentAssets = await resolveContentAssets(job, style);
  await appendFile(path.join(runDir, "codex-progress.log"), `[${new Date().toISOString()}] content assets resolved: ${contentAssets.length}\n`, "utf8");
  await writeFile(path.join(runDir, "content-assets.json"), JSON.stringify(contentAssets, null, 2), "utf8");

  const brief = buildBrief(job, style, contentAssets, options);
  await writeFile(path.join(runDir, "site-brief.json"), JSON.stringify(brief, null, 2), "utf8");
  const prompt = buildPrompt(brief);
  await writeFile(path.join(runDir, "prompt.md"), prompt, "utf8");

  const imagePaths = await existingImagePaths(job, style, contentAssets, runDir);
  await appendFile(path.join(runDir, "codex-progress.log"), `[${new Date().toISOString()}] visual references prepared: ${imagePaths.length}\n`, "utf8");
  await writeFile(path.join(runDir, "visual-reference-paths.json"), JSON.stringify(imagePaths, null, 2), "utf8");
  try {
    await runCodex(prompt, runDir, imagePaths, { timeoutMs, model, siteJobId: job.id });
  } catch (error) {
    if (!(await hasGeneratedIndex(siteDir))) {
      throw error;
    }

    await writeFile(
      path.join(runDir, "codex-recovered-after-error.txt"),
      error instanceof Error ? error.message : "Codex ended with an error after site/index.html was generated.",
      "utf8"
    );
  }

  await access(path.join(siteDir, "index.html"));
  await appendFile(path.join(runDir, "codex-progress.log"), `[${new Date().toISOString()}] index.html generated; publishing\n`, "utf8");
  const previewUrl = await publishSiteDirectory(siteDir, runName, contentAssets);
  await appendFile(path.join(runDir, "codex-progress.log"), `[${new Date().toISOString()}] published: ${previewUrl}\n`, "utf8");

  let message: string | undefined;
  try {
    message = await readFile(path.join(runDir, "codex-last-message.txt"), "utf8");
  } catch {
    message = undefined;
  }

  return {
    previewUrl,
    screenshotUrl: job.preferUploadedStyleReference ? uploadedStyleReferences(job)[0]?.url || style.imageUrl : style.imageUrl,
    generator: "codex",
    runDir,
    message
  };
}
