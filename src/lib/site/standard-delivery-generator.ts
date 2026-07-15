import path from "path";
import { readFile, readdir, stat } from "fs/promises";
import { downloadAliyunOssObject, rootRelativeUrlToAliyunOssUrl } from "@/lib/storage/aliyun-oss-storage";
import { saveFileBuffer } from "@/lib/storage/storage-provider";
import { createStoredZip } from "@/lib/zip-store";
import type { CopyVersionDto, DeliveryIntegrityReportDto, SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";
import { buildEnhancedDeploymentPlan } from "@/lib/site/enhanced-deployment-plan";
import { styleConditionSummary } from "@/lib/site/style-design-conditions";

type DeliveryPackageResult = {
  siteZipUrl: string;
  deliveryNote: string;
  integrityReport: DeliveryIntegrityReportDto;
};

export type WebsiteZipEntry = {
  name: string;
  data: Buffer;
};

export type PortableAsset = {
  sourceUrl: string;
  packagePath: string;
  mimeType: string;
  size: number;
};

type AssetCandidate = {
  sourceUrl: string;
  required: boolean;
  reason: string;
};

type ArchivedSourceAsset = {
  sourceUrl: string;
  packagePath: string;
  mimeType: string;
  size: number;
  role: string;
  originalName: string;
};

export type MissingPortableAsset = {
  sourceUrl: string;
  reason: string;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "site";
}

function safeAssetName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "asset";
}

function publicUrlToPath(url: string | null | undefined): string | null {
  if (!url?.startsWith("/")) return null;
  const cleaned = url.split("?")[0].replace(/^\/+/, "");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", cleaned);
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
  if (ext === ".avif") return "image/avif";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function isSkippableUrl(url: string) {
  const trimmed = url.trim();
  return (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:")
  );
}

function isLikelyAssetUrl(url: string) {
  const withoutQuery = url.split(/[?#]/)[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg|ico|avif|css|js|woff2?|ttf|otf|mp4|webm|pdf|txt)$/i.test(withoutQuery);
}

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
    "text/css": ".css",
    "application/javascript": ".js",
    "text/javascript": ".js",
    "font/woff": ".woff",
    "font/woff2": ".woff2",
    "application/pdf": ".pdf"
  };
  return map[normalized] || "";
}

function extensionFromUrl(url: string, mimeType: string) {
  const pathname = (() => {
    try {
      return new URL(url, "https://local.invalid").pathname;
    } catch {
      return url.split(/[?#]/)[0];
    }
  })();
  const ext = path.extname(pathname).toLowerCase();
  return ext || extensionFromMimeType(mimeType) || ".bin";
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
  const ext = extensionFromUrl(sourceUrl, mimeType);
  return `${String(index).padStart(3, "0")}-${base}${ext}`;
}

function extractAssetCandidates(html: string): AssetCandidate[] {
  const candidates = new Map<string, AssetCandidate>();
  const attributePattern = /\b(src|href|poster|data-src|data-original|data-lazy-src|data-bg|data-background|data-image)\s*=\s*["']([^"']+)["']/gi;
  const srcsetPattern = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
  const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match: RegExpExecArray | null;

  function add(sourceUrl: string, required: boolean, reason: string) {
    const trimmed = sourceUrl.trim();
    if (isSkippableUrl(trimmed)) return;
    const existing = candidates.get(trimmed);
    if (!existing || (required && !existing.required)) {
      candidates.set(trimmed, { sourceUrl: trimmed, required, reason });
    }
  }

  while ((match = attributePattern.exec(html))) {
    const attribute = match[1].toLowerCase();
    const sourceUrl = match[2].trim();
    add(sourceUrl, attribute !== "href" || isLikelyAssetUrl(sourceUrl), attribute);
  }

  while ((match = srcsetPattern.exec(html))) {
    const candidates = match[1].split(",");
    for (const candidate of candidates) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) add(url, true, "srcset");
    }
  }

  while ((match = cssUrlPattern.exec(html))) {
    add(match[1].trim(), true, "css-url");
  }

  return Array.from(candidates.values());
}

function replaceAllLiteral(input: string, search: string, replacement: string) {
  return input.split(search).join(replacement);
}

async function bufferFromUrl(sourceUrl: string, previewUrl: string, localRoot?: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const dataImage = bufferFromDataImage(sourceUrl);
  if (dataImage) return dataImage;

  if (sourceUrl.startsWith("/") && !sourceUrl.startsWith("//")) {
    const localPath = publicUrlToPath(sourceUrl);
    if (!localPath) return null;
    try {
      return { buffer: await readFile(localPath), mimeType: mimeTypeFromPath(localPath) };
    } catch {
      const ossUrl = rootRelativeUrlToAliyunOssUrl(sourceUrl);
      if (ossUrl) return fetchRemoteAsset(ossUrl);
      if (/^https?:\/\//i.test(previewUrl)) {
        return fetchRemoteAsset(new URL(sourceUrl, previewUrl).toString());
      }
      return null;
    }
  }

  if (/^https?:\/\//i.test(sourceUrl)) {
    return fetchRemoteAsset(sourceUrl);
  }

  if (localRoot) {
    const relativePath = sourceUrl.split(/[?#]/)[0].replace(/^\.?\//, "");
    const localPath = path.join(localRoot, decodeURIComponent(relativePath));
    try {
      return { buffer: await readFile(localPath), mimeType: mimeTypeFromPath(localPath) };
    } catch {
      // Fall back to preview-relative download below.
    }
  }

  if (/^https?:\/\//i.test(previewUrl)) {
    const absoluteUrl = new URL(sourceUrl, previewUrl).toString();
    return fetchRemoteAsset(absoluteUrl);
  }

  return null;
}

function bufferFromDataImage(sourceUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = sourceUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  try {
    return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] };
  } catch {
    return null;
  }
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

async function makeWebsitePortable(
  html: Buffer,
  previewUrl: string,
  existingEntries: WebsiteZipEntry[],
  localRoot?: string
): Promise<{ entries: WebsiteZipEntry[]; portableAssets: PortableAsset[]; missingAssets: MissingPortableAsset[] }> {
  let htmlText = html.toString("utf8");
  const entries = existingEntries.filter((entry) => entry.name !== "website/index.html");
  const assets: PortableAsset[] = [];
  const missingAssets: MissingPortableAsset[] = [];
  const seen = new Map<string, string>();
  let assetIndex = 1;

  for (const candidate of extractAssetCandidates(htmlText)) {
    const { sourceUrl } = candidate;
    if (seen.has(sourceUrl)) {
      htmlText = replaceAllLiteral(htmlText, sourceUrl, seen.get(sourceUrl)!);
      continue;
    }

    const downloaded = await bufferFromUrl(sourceUrl, previewUrl, localRoot);
    if (!downloaded) {
      if (candidate.required) {
        missingAssets.push({ sourceUrl, reason: candidate.reason });
      }
      continue;
    }

    const filename = assetFilename(assetIndex, sourceUrl, downloaded.mimeType);
    assetIndex += 1;
    const packagePath = `assets/${filename}`;
    const zipPath = `website/${packagePath}`;
    entries.push({ name: zipPath, data: downloaded.buffer });
    seen.set(sourceUrl, packagePath);
    htmlText = replaceAllLiteral(htmlText, sourceUrl, packagePath);
    assets.push({
      sourceUrl,
      packagePath: `website/${packagePath}`,
      mimeType: downloaded.mimeType,
      size: downloaded.buffer.length
    });
  }

  return {
    entries: [{ name: "website/index.html", data: Buffer.from(htmlText, "utf8") }, ...entries],
    portableAssets: assets,
    missingAssets
  };
}

function finalCopyText(version?: CopyVersionDto): string {
  if (!version) return "";
  const modules = version.contentJson.slice().sort((a, b) => a.order - b.order);
  const fullCopy = modules.find((module) => module.moduleId === "full_copy");
  if (fullCopy) return fullCopy.content.trim();
  return modules.map((module) => `【${module.moduleName}】\n${module.content}`).join("\n\n").trim();
}

async function collectFileEntries(sourcePath: string, targetRoot: string): Promise<WebsiteZipEntry[]> {
  const fileStat = await stat(sourcePath);

  if (fileStat.isFile()) {
    return [{ name: `${targetRoot}/index${path.extname(sourcePath) || ".html"}`, data: await readFile(sourcePath) }];
  }

  const entries: WebsiteZipEntry[] = [];
  const children = await readdir(sourcePath, { withFileTypes: true });
  for (const child of children) {
    const childPath = path.join(sourcePath, child.name);
    const childTarget = `${targetRoot}/${child.name}`;
    if (child.isDirectory()) {
      entries.push(...(await collectFileEntries(childPath, childTarget)));
    } else if (child.isFile()) {
      entries.push({ name: childTarget.replace(/\\/g, "/"), data: await readFile(childPath) });
    }
  }
  return entries;
}

export async function websiteEntriesFromPreviewUrl(previewUrl: string): Promise<{
  entries: WebsiteZipEntry[];
  portableAssets: PortableAsset[];
  missingAssets: MissingPortableAsset[];
}> {
  const previewPath = publicUrlToPath(previewUrl);
  if (previewPath) {
    const websiteSource = previewPath.endsWith(".html") ? previewPath : path.join(previewPath, "index.html");
    const websiteRoot = previewPath.endsWith(".html") ? websiteSource : path.dirname(websiteSource);
    const entries = await collectFileEntries(websiteRoot, "website");
    const indexEntry = entries.find((entry) => entry.name === "website/index.html");
    if (!indexEntry) {
      throw new Error("官网预览缺少 index.html，无法打包。");
    }
    return makeWebsitePortable(indexEntry.data, previewUrl, entries, path.dirname(websiteSource));
  }

  if (/^https?:\/\//i.test(previewUrl)) {
    const response = await fetch(previewUrl);
    if (!response.ok) {
      throw new Error(`下载远程官网预览失败：${response.status}`);
    }
    return makeWebsitePortable(Buffer.from(await response.arrayBuffer()), previewUrl, []);
  }

  throw new Error("当前官网预览地址无法打包，请先重新生成官网初稿。");
}

function selectedStyle(job: SiteJobDto): StyleConceptDto | undefined {
  return job.styleConcepts.find((style) => style.id === job.selectedMainStyleId || style.isMainStyle) || job.styleConcepts[0];
}

async function archiveSourceAssets(job: SiteJobDto, style: StyleConceptDto | undefined): Promise<{
  entries: WebsiteZipEntry[];
  archivedAssets: ArchivedSourceAsset[];
  missingAssets: MissingPortableAsset[];
}> {
  const candidates = [
    ...job.assets.map((asset) => ({
      sourceUrl: asset.url,
      role: asset.assetRole || "business_asset",
      originalName: asset.originalName || "uploaded-asset",
      mimeType: asset.mimeType
    })),
    ...job.styleConcepts.map((item) => ({
      sourceUrl: item.imageUrl,
      role: item.id === style?.id || item.isMainStyle ? "selected_style_concept" : "style_concept",
      originalName: `${item.styleName || "style-concept"}.png`,
      mimeType: "image/png"
    }))
  ].filter((item) => item.sourceUrl && !isSkippableUrl(item.sourceUrl));

  const entries: WebsiteZipEntry[] = [];
  const archivedAssets: ArchivedSourceAsset[] = [];
  const missingAssets: MissingPortableAsset[] = [];
  const seen = new Set<string>();
  let index = 1;

  for (const item of candidates) {
    if (seen.has(item.sourceUrl)) continue;
    seen.add(item.sourceUrl);

    const downloaded = await bufferFromUrl(item.sourceUrl, job.previewUrl || "");
    if (!downloaded) {
      missingAssets.push({ sourceUrl: item.sourceUrl, reason: item.role });
      continue;
    }

    const folder = item.role === "qr_code" ? "qr-codes" : item.role.includes("style") ? "style-references" : "uploaded-assets";
    const originalBase = path.basename(item.originalName || "asset", path.extname(item.originalName || ""));
    const filename = `${String(index).padStart(3, "0")}-${safeAssetName(originalBase)}${extensionFromUrl(item.sourceUrl, downloaded.mimeType)}`;
    const packagePath = `source-assets/${folder}/${filename}`;
    index += 1;

    entries.push({ name: packagePath, data: downloaded.buffer });
    archivedAssets.push({
      sourceUrl: item.sourceUrl,
      packagePath,
      mimeType: downloaded.mimeType || item.mimeType,
      size: downloaded.buffer.length,
      role: item.role,
      originalName: item.originalName
    });
  }

  return { entries, archivedAssets, missingAssets };
}

function buildDeliveryNote(job: SiteJobDto) {
  const style = selectedStyle(job);
  const enhancedPlan = buildEnhancedDeploymentPlan(job, style);
  return [
    "标准交付包已生成。",
    "",
    "交付内容：",
    "1. website/：官网静态文件，包含 index.html 与 assets/ 本地素材，可直接双击打开。",
    "2. final-copy.txt：客户确认后的最终官网文案。",
    "3. style-summary.txt：选定视觉风格与设计方向说明。",
    "4. assets-manifest.json：本次使用和参考的素材清单。",
    "5. delivery-note.txt：交付说明。",
    "",
    `官网预览地址：${job.previewUrl || "未生成"}`,
    "",
    "增强部署说明：",
    enhancedPlan,
    "",
    "说明：当前 MVP 交付包默认采用电话/微信/联系人直连咨询，不包含表单、预约、会员、登录、客户专区或客资后台。若后续明确进入增强部署阶段，再单独接入 Netlify Functions / Supabase 表、RLS、通知和后台查看入口。"
  ].join("\n");
}

export async function generateStandardDeliveryPackage(job: SiteJobDto): Promise<DeliveryPackageResult> {
  if (!job.previewUrl) {
    throw new Error("请先生成官网初稿，再生成标准交付包。");
  }

  const finalCopy = job.copyVersions.find((version) => version.id === job.finalCopyVersionId || version.isFinal) || job.copyVersions[0];
  const style = selectedStyle(job);
  const deliveryNote = buildDeliveryNote(job);
  const websitePackage = await websiteEntriesFromPreviewUrl(job.previewUrl);
  const sourceArchive = await archiveSourceAssets(job, style);
  if (websitePackage.missingAssets.length) {
    const examples = websitePackage.missingAssets
      .slice(0, 5)
      .map((asset) => `${asset.reason}: ${asset.sourceUrl}`)
      .join("；");
    throw new Error(`交付包图片/资源下载不完整，已停止生成残缺交付包。请先重新生成官网或检查资源权限。缺失资源：${examples}`);
  }

  const integrityReport: DeliveryIntegrityReportDto = {
    jobId: job.id,
    generatedAt: new Date().toISOString(),
    websiteAssetCount: websitePackage.portableAssets.length,
    archivedSourceAssetCount: sourceArchive.archivedAssets.length,
    missingWebsiteAssets: websitePackage.missingAssets,
    missingArchivedSourceAssets: sourceArchive.missingAssets,
    rule:
      "website/ contains the runnable localized site. source-assets/ archives uploaded business images, QR codes, and generated style references for review and future rebuilding."
  };

  const entries: WebsiteZipEntry[] = [
    ...websitePackage.entries,
    ...sourceArchive.entries,
    { name: "final-copy.txt", data: Buffer.from(finalCopyText(finalCopy), "utf8") },
    {
      name: "style-summary.txt",
      data: Buffer.from(
        [
          `风格名称：${style?.styleName || "未选择"}`,
          `用户可见描述：${style?.emotionalDescription || style?.styleDescription || "-"}`,
          `最终设计依据：${job.preferUploadedStyleReference ? "客户上传的参考官网截图" : "客户选中的生成官网参考图"}`,
          `适用说明：${style?.suitableFor || "-"}`,
          "",
          "内部视觉条件：",
          styleConditionSummary(style),
          "",
          style?.styleDescription || "",
          "",
          `风格参考图：${style?.imageUrl || "-"}`
        ].join("\n"),
        "utf8"
      )
    },
    {
      name: "assets-manifest.json",
      data: Buffer.from(
        JSON.stringify(
          {
            jobId: job.id,
            customerName: job.customerName,
            customerContact: job.customerContact,
            previewUrl: job.previewUrl,
            preferUploadedStyleReference: job.preferUploadedStyleReference,
            generatedAt: new Date().toISOString(),
            enhancedDeploymentPlan: buildEnhancedDeploymentPlan(job, style),
            packagedWebsiteAssets: websitePackage.portableAssets,
            archivedSourceAssets: sourceArchive.archivedAssets,
            missingArchivedSourceAssets: sourceArchive.missingAssets,
            assets: job.assets.map((asset) => ({
              originalName: asset.originalName,
              mimeType: asset.mimeType,
              size: asset.size,
              url: asset.url,
              role: asset.assetRole || "business_asset"
            })),
            styleConcepts: job.styleConcepts.map((item) => ({
              styleName: item.styleName,
              emotionalDescription: item.emotionalDescription,
              schemeType: item.schemeType,
              layoutStyle: item.layoutStyle,
              colorTendency: item.colorTendency,
              visualTechniques: item.visualTechniques,
              imageUrl: item.imageUrl,
              isMainStyle: item.isMainStyle,
              isFavorite: item.isFavorite
            }))
          },
          null,
          2
        ),
        "utf8"
      )
    },
    {
      name: "delivery-integrity-report.json",
      data: Buffer.from(JSON.stringify(integrityReport, null, 2), "utf8")
    },
    { name: "delivery-note.txt", data: Buffer.from(deliveryNote, "utf8") }
  ];

  const packageName = `standard-delivery-${safeName(job.id)}-${Date.now()}.zip`;
  const stored = await saveFileBuffer({
    type: "generated",
    filename: `delivery-packages/${packageName}`,
    buffer: createStoredZip(entries),
    mimeType: "application/zip",
    originalName: packageName
  });

  return {
    siteZipUrl: stored.url,
    deliveryNote,
    integrityReport
  };
}
