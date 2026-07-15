import { saveFileBuffer } from "@/lib/storage/storage-provider";
import type { CopyModule, SiteAssetDto, SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

type Palette = {
  page: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
  dark: boolean;
};

type PreviewResult = {
  previewUrl: string;
  screenshotUrl?: string;
};

type GenerateWebsitePreviewOptions = {
  revisionInstruction?: string;
};

const defaultPalette: Palette = {
  page: "#f6f8fb",
  surface: "#ffffff",
  text: "#111827",
  muted: "#64748b",
  primary: "#0f766e",
  accent: "#f97316",
  dark: false
};

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pickPalette(style?: StyleConceptDto): Palette {
  const text = `${style?.styleName || ""} ${style?.styleDescription || ""} ${style?.schemeType || ""} ${style?.layoutStyle || ""}`;
  if (style?.colorTendency === "高饱和配色" && style.schemeType === "转化增长型整站方案") {
    return { page: "#eef6ff", surface: "#ffffff", text: "#0f172a", muted: "#475569", primary: "#1d4ed8", accent: "#f97316", dark: false };
  }
  if (style?.colorTendency === "高饱和配色") {
    return { page: "#f0f9ff", surface: "#ffffff", text: "#0f172a", muted: "#475569", primary: "#0ea5e9", accent: "#f43f5e", dark: false };
  }
  if (style?.colorTendency === "低饱和配色" && style.schemeType === "品牌叙事型整站方案") {
    return { page: "#f7f7f4", surface: "#ffffff", text: "#1f2937", muted: "#6b7280", primary: "#475569", accent: "#a16207", dark: false };
  }
  if (text.includes("产业") || text.includes("招商")) {
    return { page: "#07111f", surface: "#101c2e", text: "#f8fafc", muted: "#cbd5e1", primary: "#d6a847", accent: "#2f6fed", dark: true };
  }
  if (text.includes("制造") || text.includes("工厂") || text.includes("工业")) {
    return { page: "#f3f6f8", surface: "#ffffff", text: "#111827", muted: "#64748b", primary: "#0f766e", accent: "#f97316", dark: false };
  }
  if (text.includes("科技") || text.includes("增长")) {
    return { page: "#eef6ff", surface: "#ffffff", text: "#0f172a", muted: "#475569", primary: "#1d4ed8", accent: "#06b6d4", dark: false };
  }
  if (text.includes("微信") || text.includes("获客")) {
    return { page: "#fff7ed", surface: "#ffffff", text: "#111827", muted: "#6b7280", primary: "#ef4444", accent: "#16a34a", dark: false };
  }
  if (text.includes("咨询")) {
    return { page: "#f8fafc", surface: "#ffffff", text: "#111827", muted: "#64748b", primary: "#334155", accent: "#b7791f", dark: false };
  }
  return defaultPalette;
}

function getImageAssets(assets: SiteAssetDto[]) {
  return assets.filter((asset) => asset.mimeType.startsWith("image/") && asset.assetRole !== "style_reference" && asset.assetRole !== "qr_code");
}

function getStyleReferenceAssets(assets: SiteAssetDto[]) {
  return assets.filter((asset) => asset.mimeType.startsWith("image/") && asset.assetRole === "style_reference");
}

function getQrCodeAssets(assets: SiteAssetDto[]) {
  return assets.filter((asset) => asset.mimeType.startsWith("image/") && asset.assetRole === "qr_code");
}

function businessName(job: SiteJobDto) {
  if (job.customerName?.trim()) return job.customerName.trim();
  const firstSentence = job.businessDescription.split(/[，。,.\n]/)[0]?.trim();
  return firstSentence || "我的官网";
}

function buildHeadline(job: SiteJobDto, style?: StyleConceptDto) {
  const heroTitle = getCopyModule(job, "hero_title")?.content;
  if (heroTitle) return heroTitle;
  const business = job.businessDescription.trim();
  if (business.length <= 32) return `让${business}被更多客户看见`;
  if (style?.styleName.includes("招商")) return "让优质项目被真正有需求的客户看见";
  if (style?.styleName.includes("制造")) return "把产品实力、工厂能力和交付价值讲清楚";
  if (style?.styleName.includes("科技")) return "用一个清晰官网承接客户咨询与增长线索";
  return "把你的业务整理成一个客户看得懂的官网";
}

function buildIntro(job: SiteJobDto, revisionInstruction?: string) {
  const heroSubtitle = getCopyModule(job, "hero_subtitle")?.content;
  if (heroSubtitle) return heroSubtitle;
  if (revisionInstruction?.trim()) {
    return `已根据客户最新修改意见调整本版官网：${revisionInstruction.trim()}。本版继续围绕业务价值、资料展示和咨询转化进行组织。`;
  }
  const contact = job.customerContact ? `，客户可以通过 ${job.customerContact} 快速联系` : "";
  return `基于你上传的资料和业务描述，系统已整理出一个可访问的官网初稿${contact}。这个版本优先呈现业务价值、图片素材和咨询入口，后续可继续精修文案、图片和区块顺序。`;
}

function getCopyModules(job: SiteJobDto): CopyModule[] {
  const finalCopy = job.copyVersions.find((version) => version.id === job.finalCopyVersionId || version.isFinal) || job.copyVersions[0];
  return finalCopy?.contentJson.slice().sort((a, b) => a.order - b.order) || [];
}

function getCopyModule(job: SiteJobDto, moduleId: string) {
  return getCopyModules(job).find((module) => module.moduleId === moduleId);
}

function imageTag(asset: SiteAssetDto | undefined, alt: string, className = "") {
  if (!asset) {
    return `<div class="image-placeholder ${className}"><span>官网视觉位</span></div>`;
  }
  return `<img class="${className}" src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}" />`;
}

function featureItems(job: SiteJobDto) {
  const modules = ["business", "services", "advantages"]
    .map((id) => getCopyModule(job, id))
    .filter((module): module is CopyModule => Boolean(module));
  if (modules.length) {
    return modules.map((module) => [module.moduleName, module.content] as [string, string]);
  }
  const purpose = job.websitePurpose === "AI 帮我判断" ? "官网展示与咨询转化" : job.websitePurpose;
  return [
    ["清晰定位", `围绕“${purpose}”组织首页结构，让访客第一眼知道你能提供什么。`],
    ["资料转化", "把有限图片、项目资料和业务描述整理成可展示、可传播的网站内容。"],
    ["快速咨询", "在首屏、内容区和页底保留明确联系入口，方便客户继续沟通。"]
  ];
}

function renderCopySections(job: SiteJobDto) {
  const skip = new Set(["hero_title", "hero_subtitle", "hero_cta", "business", "services", "advantages", "contact", "footer"]);
  const modules = getCopyModules(job).filter((module) => module.content && !skip.has(module.moduleId));
  if (!modules.length) return "";

  return modules
    .map(
      (module, index) => `<section class="band">
      <div class="shell ${index % 2 ? "split reverse" : "split"}">
        <div class="copy-panel">
          <div class="eyebrow">${escapeHtml(module.moduleId)}</div>
          <h2>${escapeHtml(module.moduleName)}</h2>
          <p>${escapeHtml(module.content).replace(/\n/g, "<br />")}</p>
        </div>
        <div class="section-card">
          <b>${String(index + 1).padStart(2, "0")}</b>
          <p>${escapeHtml(module.moduleName)}</p>
        </div>
      </div>
    </section>`
    )
    .join("\n");
}

function renderGallery(images: SiteAssetDto[], name: string) {
  const cards = Array.from({ length: 4 }, (_, index) => {
    const asset = images[index % Math.max(images.length, 1)];
    return `<article class="gallery-card">
      ${imageTag(asset, `${name}展示图 ${index + 1}`)}
      <div>
        <b>${index === 0 ? "核心形象" : index === 1 ? "项目素材" : index === 2 ? "业务场景" : "更多资料"}</b>
        <p>${index === 0 ? "用客户上传图片建立真实感。" : "保留后续替换和精修空间。"}</p>
      </div>
    </article>`;
  }).join("");
  return `<div class="gallery-grid">${cards}</div>`;
}

function isAbstractBusiness(job: SiteJobDto) {
  const text = `${job.businessDescription} ${job.websitePurpose}`.toLowerCase();
  const keywords = ["咨询", "法律", "律师", "服务", "投放", "广告", "招商", "ai", "顾问", "培训", "方案", "运营", "软件", "科技"];
  return getImageAssets(job.assets).length < 2 || keywords.some((keyword) => text.includes(keyword));
}

function flatIllustration(title: string, variant: 1 | 2) {
  const label = escapeHtml(title).slice(0, 18);
  if (variant === 2) {
    return `<svg class="flat-illustration" viewBox="0 0 520 360" role="img" aria-label="${label}">
      <defs>
        <linearGradient id="flowB" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="var(--primary)" stop-opacity=".92" />
          <stop offset="1" stop-color="var(--accent)" stop-opacity=".78" />
        </linearGradient>
      </defs>
      <path d="M58 262 C104 164 182 127 273 154 C349 176 381 102 460 77 L460 292 L58 292 Z" fill="url(#flowB)" opacity=".18" />
      <rect x="92" y="78" width="156" height="202" rx="28" fill="var(--surface)" stroke="var(--line)" />
      <rect x="272" y="116" width="156" height="164" rx="28" fill="var(--surface)" stroke="var(--line)" />
      <circle cx="164" cy="140" r="34" fill="var(--primary)" opacity=".9" />
      <path d="M132 202 H218 M132 228 H194" stroke="var(--text)" stroke-width="14" stroke-linecap="round" opacity=".72" />
      <path d="M310 174 H390 M310 206 H374 M310 238 H352" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" opacity=".78" />
      <path d="M236 178 C256 158 278 158 298 178" fill="none" stroke="var(--primary)" stroke-width="12" stroke-linecap="round" />
      <circle cx="438" cy="96" r="22" fill="var(--accent)" opacity=".82" />
    </svg>`;
  }

  return `<svg class="flat-illustration" viewBox="0 0 520 360" role="img" aria-label="${label}">
    <defs>
      <linearGradient id="flowA" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="var(--primary)" stop-opacity=".9" />
        <stop offset="1" stop-color="var(--accent)" stop-opacity=".78" />
      </linearGradient>
    </defs>
    <path d="M74 252 C119 96 238 70 326 126 C383 163 417 147 462 111 L462 294 L74 294 Z" fill="url(#flowA)" opacity=".18" />
    <rect x="86" y="92" width="248" height="166" rx="30" fill="var(--surface)" stroke="var(--line)" />
    <rect x="124" y="132" width="116" height="16" rx="8" fill="var(--primary)" opacity=".86" />
    <rect x="124" y="170" width="174" height="14" rx="7" fill="var(--text)" opacity=".35" />
    <rect x="124" y="202" width="138" height="14" rx="7" fill="var(--text)" opacity=".22" />
    <circle cx="382" cy="116" r="50" fill="var(--accent)" opacity=".86" />
    <path d="M359 118 L377 136 L410 94" fill="none" stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="326" y="188" width="112" height="84" rx="24" fill="var(--primary)" opacity=".16" stroke="var(--primary)" />
  </svg>`;
}

function renderVisualFlow(job: SiteJobDto, name: string) {
  if (!isAbstractBusiness(job)) return "";
  return `<section class="band visual-flow">
    <div class="shell visual-flow-grid">
      <div class="copy-panel floating-copy">
        <div class="eyebrow">Personalized Visual System</div>
        <h2>用更贴合业务的视觉语言承接抽象服务</h2>
        <p>当客户资料偏文字、服务偏抽象时，页面会补充延续官网风格的扁平插画，用来表达专业服务、流程判断、信息传达和咨询转化，而不是只堆叠文字卡片。</p>
      </div>
      <div class="illustration-stack">
        ${flatIllustration(name, 1)}
        ${flatIllustration(job.websitePurpose, 2)}
      </div>
    </div>
  </section>`;
}

export async function generateWebsitePreview(
  job: SiteJobDto,
  style: StyleConceptDto,
  options: GenerateWebsitePreviewOptions = {}
): Promise<PreviewResult> {
  const palette = pickPalette(style);
  const images = getImageAssets(job.assets);
  const qrCodes = getQrCodeAssets(job.assets);
  const styleReferences = getStyleReferenceAssets(job.assets);
  const name = businessName(job);
  const headline = buildHeadline(job, style);
  const intro = buildIntro(job, options.revisionInstruction);
  const features = featureItems(job);
  const heroCta = getCopyModule(job, "hero_cta")?.content || "获取方案";
  const contactModule = getCopyModule(job, "contact")?.content;
  const footerModule = getCopyModule(job, "footer")?.content;
  const firstImage = images[0];
  const secondImage = images[1] || images[0];
  const designScreenshotUrl = job.preferUploadedStyleReference ? styleReferences[0]?.url || style.imageUrl : style.imageUrl;
  const contact = job.customerContact || "请补充电话 / 微信";
  const qrCode = qrCodes[0];
  const filename = `site-${job.id}.html`;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(name)} - 官网初稿</title>
  <style>
    :root {
      --page: ${palette.page};
      --surface: ${palette.surface};
      --text: ${palette.text};
      --muted: ${palette.muted};
      --primary: ${palette.primary};
      --accent: ${palette.accent};
      --line: ${palette.dark ? "rgba(255,255,255,.14)" : "rgba(15,23,42,.12)"};
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--page); color: var(--text); font-family: "Microsoft YaHei", Arial, sans-serif; }
    a { color: inherit; text-decoration: none; }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
    .nav { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px 0; }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 900; letter-spacing: 0; }
    .brand-mark { width: 38px; height: 38px; border-radius: 12px; background: var(--primary); box-shadow: 0 12px 34px color-mix(in srgb, var(--primary) 36%, transparent); }
    .nav-links { display: flex; gap: 22px; color: var(--muted); font-size: 14px; font-weight: 800; }
    .pill { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; border-radius: 999px; padding: 0 18px; background: var(--primary); color: ${palette.dark ? "#07111f" : "#fff"}; font-weight: 900; transition: transform .22s ease, box-shadow .22s ease, background .22s ease; }
    .pill:hover, .pill:focus-visible { transform: translateY(-2px); box-shadow: 0 14px 34px color-mix(in srgb, var(--primary) 28%, transparent); outline: none; }
    .nav a { transition: color .2s ease, transform .2s ease; }
    .nav a:hover, .nav a:focus-visible { color: var(--primary); transform: translateY(-1px); outline: none; }
    .hero { display: grid; grid-template-columns: minmax(0, .95fr) minmax(360px, 1.05fr); gap: 44px; align-items: center; min-height: calc(100vh - 92px); padding: 28px 0 56px; }
    .eyebrow { color: var(--primary); font-size: 14px; font-weight: 900; text-transform: uppercase; }
    h1 { margin: 18px 0 0; max-width: 780px; font-size: clamp(42px, 6vw, 76px); line-height: .98; letter-spacing: 0; }
    .hero-title { text-wrap: balance; word-break: keep-all; overflow-wrap: normal; }
    .lead { margin: 24px 0 0; max-width: 680px; color: var(--muted); font-size: 18px; line-height: 1.85; font-weight: 700; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px; }
    .ghost { border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 68%, transparent); color: var(--text); }
    .hero-visual { position: relative; min-height: 540px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--surface); box-shadow: 0 28px 80px rgba(15,23,42,.22); transition: transform .28s ease, box-shadow .28s ease; }
    .hero-visual:hover { transform: translateY(-4px) rotate(.35deg); box-shadow: 0 34px 96px rgba(15,23,42,.28); }
    .hero-visual::before { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 28%, transparent), transparent 45%), linear-gradient(315deg, color-mix(in srgb, var(--accent) 24%, transparent), transparent 45%); z-index: 1; }
    .hero-visual::after { content: ""; position: absolute; right: -80px; bottom: -110px; width: 260px; height: 260px; border-radius: 50%; background: var(--accent); opacity: .22; z-index: 1; }
    .hero-visual img, .image-placeholder { min-height: 540px; }
    .hero-visual img { clip-path: polygon(0 0, 100% 0, 100% 88%, 74% 100%, 0 92%); transition: transform .5s ease, filter .5s ease; }
    .hero-visual:hover img { transform: scale(1.035); filter: saturate(1.05); }
    .image-placeholder { display: grid; place-items: center; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, var(--surface)), color-mix(in srgb, var(--accent) 22%, var(--surface))); color: var(--text); font-size: 24px; font-weight: 900; }
    .visual-card { position: absolute; left: 28px; right: 28px; bottom: 28px; z-index: 2; border: 1px solid var(--line); border-radius: 8px; padding: 22px; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(14px); }
    .visual-card b { display: block; font-size: 22px; }
    .visual-card p { margin: 8px 0 0; color: var(--muted); line-height: 1.65; font-weight: 700; }
    section.band { position: relative; padding: 88px 0; border-top: 1px solid var(--line); overflow: hidden; }
    section.band::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 120px; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, transparent), transparent); clip-path: polygon(0 0, 100% 0, 100% 48%, 0 100%); pointer-events: none; }
    section.band:nth-of-type(even)::after { content: ""; position: absolute; right: -140px; top: 74px; width: 300px; height: 300px; border-radius: 44% 56% 48% 52%; background: color-mix(in srgb, var(--accent) 16%, transparent); pointer-events: none; }
    .section-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    h2 { margin: 0; font-size: clamp(28px, 4vw, 48px); line-height: 1.08; }
    .section-head p { max-width: 520px; margin: 0; color: var(--muted); line-height: 1.7; font-weight: 700; }
    .feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .feature { position: relative; border: 1px solid var(--line); border-radius: 8px; padding: 24px; background: color-mix(in srgb, var(--surface) 82%, transparent); box-shadow: 0 18px 50px rgba(15,23,42,.08); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
    .feature:nth-child(2) { transform: translateY(26px); }
    .feature:nth-child(3) { transform: translateY(-10px); }
    .feature:hover { box-shadow: 0 24px 70px rgba(15,23,42,.14); border-color: color-mix(in srgb, var(--primary) 38%, var(--line)); }
    .feature:nth-child(1):hover { transform: translateY(-6px); }
    .feature:nth-child(2):hover { transform: translateY(18px); }
    .feature:nth-child(3):hover { transform: translateY(-18px); }
    .feature span { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: var(--accent); color: #fff; font-weight: 900; }
    .feature b { display: block; margin-top: 24px; font-size: 22px; }
    .feature p, .gallery-card p { color: var(--muted); line-height: 1.7; font-weight: 700; }
    .gallery-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .gallery-card { overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--surface) 86%, transparent); box-shadow: 0 20px 54px rgba(15,23,42,.09); transition: transform .25s ease, box-shadow .25s ease; }
    .gallery-card:nth-child(2), .gallery-card:nth-child(4) { transform: translateY(34px); }
    .gallery-card img, .gallery-card .image-placeholder { height: 230px; min-height: 230px; }
    .gallery-card img { clip-path: polygon(0 0, 100% 0, 100% 82%, 0 100%); transition: transform .45s ease; }
    .gallery-card:hover { box-shadow: 0 26px 78px rgba(15,23,42,.16); }
    .gallery-card:nth-child(1):hover, .gallery-card:nth-child(3):hover { transform: translateY(-8px); }
    .gallery-card:nth-child(2):hover, .gallery-card:nth-child(4):hover { transform: translateY(24px); }
    .gallery-card:hover img { transform: scale(1.045); }
    .gallery-card div { padding: 18px; }
    .gallery-card b { font-size: 18px; }
    .split { display: grid; grid-template-columns: .92fr 1.08fr; gap: 28px; align-items: stretch; }
    .split.reverse { grid-template-columns: 1.08fr .92fr; }
    .copy-panel { border: 1px solid var(--line); border-radius: 8px; padding: 30px; background: color-mix(in srgb, var(--surface) 86%, transparent); transition: transform .24s ease, box-shadow .24s ease; }
    .copy-panel:hover { transform: translateY(-4px); box-shadow: 0 18px 56px rgba(15,23,42,.10); }
    .copy-panel p { color: var(--muted); font-size: 17px; line-height: 1.85; font-weight: 700; }
    .section-card { display: grid; place-items: center; min-height: 320px; border-radius: 8px; border: 1px solid var(--line); background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, var(--surface)), color-mix(in srgb, var(--accent) 12%, var(--surface))); text-align: center; transition: transform .25s ease, filter .25s ease; }
    .section-card:hover { transform: translateY(-5px) rotate(-.4deg); filter: saturate(1.08); }
    .section-card b { font-size: 76px; color: var(--primary); }
    .section-card p { margin: 0; color: var(--muted); font-weight: 900; }
    .side-image { min-height: 420px; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); transform: rotate(1.2deg); box-shadow: 0 28px 80px rgba(15,23,42,.16); transition: transform .28s ease, box-shadow .28s ease; }
    .side-image:hover { transform: rotate(0deg) translateY(-4px); box-shadow: 0 34px 90px rgba(15,23,42,.22); }
    .side-image img { clip-path: polygon(8% 0, 100% 0, 92% 100%, 0 90%); }
    .visual-flow { margin-top: -28px; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent), color-mix(in srgb, var(--accent) 8%, transparent)); }
    .visual-flow-grid { display: grid; grid-template-columns: .9fr 1.1fr; gap: 30px; align-items: center; }
    .floating-copy { transform: translateY(-18px); box-shadow: 0 24px 70px rgba(15,23,42,.10); }
    .illustration-stack { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: center; }
    .flat-illustration { width: 100%; min-height: 260px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--surface) 88%, transparent); box-shadow: 0 24px 70px rgba(15,23,42,.12); transition: transform .3s ease, box-shadow .3s ease; }
    .flat-illustration:hover { transform: translateY(-6px); box-shadow: 0 30px 84px rgba(15,23,42,.16); }
    .flat-illustration:nth-child(2) { transform: translateY(44px); }
    .cta { padding: 56px 0 78px; }
    .cta-inner { border-radius: 8px; padding: 42px; background: var(--text); color: ${palette.dark ? "#07111f" : "#fff"}; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; }
    .cta h2 { color: inherit; }
    .cta p { color: ${palette.dark ? "rgba(7,17,31,.72)" : "rgba(255,255,255,.74)"}; font-weight: 800; line-height: 1.7; }
    .cta .pill { background: var(--primary); color: ${palette.dark ? "#07111f" : "#fff"}; }
    .qr-card { display: grid; gap: 10px; justify-items: center; min-width: 150px; border-radius: 8px; background: ${palette.dark ? "rgba(7,17,31,.12)" : "rgba(255,255,255,.12)"}; padding: 14px; font-size: 12px; font-weight: 900; text-align: center; }
    .qr-card img { width: 118px; height: 118px; border-radius: 8px; object-fit: contain; background: #fff; padding: 6px; }
    @media (max-width: 900px) {
      .hero, .split, .cta-inner { grid-template-columns: 1fr; }
      .hero { min-height: auto; }
      .nav-links { display: none; }
      h1 { font-size: clamp(36px, 11vw, 58px); line-height: 1.06; max-width: 100%; }
      .pill { white-space: normal; text-align: center; }
      .hero-visual, .hero-visual img, .image-placeholder { min-height: 380px; }
      .feature-grid, .gallery-grid { grid-template-columns: 1fr; }
      .feature:nth-child(2), .feature:nth-child(3), .gallery-card:nth-child(2), .gallery-card:nth-child(4), .side-image, .floating-copy, .flat-illustration:nth-child(2) { transform: none; }
      .visual-card { position: static; margin: 14px; }
      .visual-flow-grid, .illustration-stack { grid-template-columns: 1fr; }
      .section-head { display: block; }
      .section-head p { margin-top: 14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; scroll-behavior: auto !important; }
      .hero-visual:hover, .hero-visual:hover img, .feature:hover, .gallery-card:hover, .gallery-card:hover img, .copy-panel:hover, .section-card:hover, .side-image:hover, .flat-illustration:hover, .pill:hover { transform: none !important; }
    }
  </style>
</head>
<body>
  <header class="shell nav">
    <a class="brand" href="#"><span class="brand-mark"></span><span>${escapeHtml(name)}</span></a>
    <nav class="nav-links"><a href="#service">服务</a><a href="#assets">展示</a><a href="#contact">联系</a></nav>
    <a class="pill" href="#contact">立即咨询</a>
  </header>

  <main>
    <section class="shell hero">
      <div>
        <div class="eyebrow">${escapeHtml(style.styleName)} / 官网初稿</div>
        <h1 class="hero-title" data-headline-guard>${escapeHtml(headline)}</h1>
        <p class="lead">${escapeHtml(intro)}</p>
        <div class="hero-actions">
          <a class="pill" href="#contact">${escapeHtml(heroCta)}</a>
          <a class="pill ghost" href="#assets">查看资料展示</a>
        </div>
      </div>
      <div class="hero-visual">
        ${imageTag(firstImage, `${name}官网首图`)}
        <div class="visual-card">
          <b>从模拟图生成的真实官网</b>
          <p>${escapeHtml(job.preferUploadedStyleReference && styleReferences.length ? `本版以客户上传的 ${styleReferences.length} 张参考官网截图作为设计依据。` : style.styleDescription)}</p>
        </div>
      </div>
    </section>

    <section id="service" class="band">
      <div class="shell">
        <div class="section-head">
          <h2>把有限资料整理成客户看得懂的官网</h2>
          <p>系统优先呈现业务定位、核心资料和联系入口，让访客快速判断是否值得进一步咨询。</p>
        </div>
        <div class="feature-grid">
          ${features.map(([title, body], index) => `<article class="feature"><span>0${index + 1}</span><b>${escapeHtml(title)}</b><p>${escapeHtml(body)}</p></article>`).join("")}
        </div>
      </div>
    </section>

    <section id="assets" class="band">
      <div class="shell">
        <div class="section-head">
          <h2>资料展示</h2>
          <p>优先使用客户上传图片，没有足够图片时保留高级视觉占位，保证网站完整可看。</p>
        </div>
        ${renderGallery(images, name)}
      </div>
    </section>

    ${renderVisualFlow(job, name)}

    <section class="band">
      <div class="shell split">
        <div class="copy-panel">
          <div class="eyebrow">Business Understanding</div>
          <h2>业务理解</h2>
          <p>${escapeHtml(job.businessDescription)}</p>
          <p>网站用途：${escapeHtml(job.websitePurpose)}。当前版本适合作为第一版官网初稿，用于客户预览、内部确认和后续精修。</p>
        </div>
        <div class="side-image">${imageTag(secondImage, `${name}业务展示`)}</div>
      </div>
    </section>

    ${renderCopySections(job)}

    <section id="contact" class="shell cta">
      <div class="cta-inner">
        <div>
          <h2>准备让客户看到你的官网了吗？</h2>
          <p>${escapeHtml(contactModule || footerModule || "当前预览已经可以分享查看。后续可以继续替换图片、调整文案、补充案例和项目参数。")}</p>
        </div>
        ${
          qrCode
            ? `<div class="qr-card"><img src="${escapeHtml(qrCode.url)}" alt="微信 / 联系二维码" /><span>扫码联系</span></div>`
            : `<a class="pill" href="tel:${escapeHtml(contact)}">${escapeHtml(contact)}</a>`
        }
      </div>
    </section>
  </main>
</body>
</html>`;

  const stored = await saveFileBuffer({
    type: "generated",
    filename: `site-previews/${filename}`,
    buffer: Buffer.from(html, "utf8"),
    mimeType: "text/html; charset=utf-8",
    originalName: filename
  });
  return { previewUrl: stored.url, screenshotUrl: designScreenshotUrl };
}
