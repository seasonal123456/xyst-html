import path from "path";
import { sanitizeTextForFilename } from "@/lib/file-utils";
import type { SiteAssetDto } from "@/lib/site/site-types";
import { saveFileBuffer } from "@/lib/storage/storage-provider";

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const documentMimeTypes = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
];
const archiveMimeTypes = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/octet-stream"
];
const allowedBusinessExtensions = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "txt",
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "rar",
  "7z"
];
const allowedStyleReferenceExtensions = ["jpg", "jpeg", "png", "webp"];
const allowedQrCodeExtensions = ["jpg", "jpeg", "png", "webp"];
const maxImageSize = 10 * 1024 * 1024;
const maxDocumentSize = 30 * 1024 * 1024;
const maxArchiveSize = 200 * 1024 * 1024;

export type SiteAssetRole = "business_asset" | "style_reference" | "qr_code";

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getSiteUploadLimits() {
  return {
    maxBusinessFiles: numberFromEnv("SITE_UPLOAD_MAX_FILES", 60),
    maxStyleReferenceFiles: numberFromEnv("SITE_STYLE_REFERENCE_MAX_FILES", 8),
    maxQrCodeFiles: numberFromEnv("SITE_QR_CODE_MAX_FILES", 1),
    maxTotalBytes: numberFromEnv("SITE_UPLOAD_MAX_TOTAL_MB", 200) * 1024 * 1024
  };
}

export function validateSiteAssetBatch(files: File[], styleReferenceFiles: File[], qrCodeFiles: File[] = []): string | null {
  const limits = getSiteUploadLimits();
  const totalBytes = [...files, ...styleReferenceFiles, ...qrCodeFiles].reduce((sum, file) => sum + file.size, 0);

  if (files.length > limits.maxBusinessFiles) {
    return `最多上传 ${limits.maxBusinessFiles} 个业务素材。`;
  }

  if (styleReferenceFiles.length > limits.maxStyleReferenceFiles) {
    return `最多上传 ${limits.maxStyleReferenceFiles} 个参考风格图。`;
  }

  if (qrCodeFiles.length > limits.maxQrCodeFiles) {
    return `二维码最多上传 ${limits.maxQrCodeFiles} 张。`;
  }

  if (totalBytes > limits.maxTotalBytes) {
    return `上传文件总大小不能超过 ${Math.round(limits.maxTotalBytes / 1024 / 1024)}MB。`;
  }

  return null;
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "text/csv") return "csv";
  if (mimeType === "application/msword") return "doc";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mimeType === "application/vnd.ms-excel") return "xls";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (mimeType === "application/vnd.ms-powerpoint") return "ppt";
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") return "zip";
  if (mimeType === "application/x-7z-compressed") return "7z";
  if (mimeType === "application/vnd.rar" || mimeType === "application/x-rar-compressed") return "rar";
  return "";
}

function extensionFromFile(file: File) {
  const filenameExt = path.extname(file.name).replace(/^\./, "").toLowerCase();
  return filenameExt || extensionFromMime(file.type);
}

function isArchiveExtension(ext: string) {
  return ["zip", "rar", "7z"].includes(ext);
}

function isDocumentExtension(ext: string) {
  return ["pdf", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);
}

export function validateSiteAssetFile(file: File, role: SiteAssetRole = "business_asset"): string | null {
  const ext = extensionFromFile(file);

  if (role === "qr_code") {
    if (!imageMimeTypes.includes(file.type) && !allowedQrCodeExtensions.includes(ext)) {
      return `${file.name} 二维码格式不支持，仅允许 jpg、jpeg、png、webp。`;
    }
    if (file.size > maxImageSize) return `${file.name} 超过 10MB。`;
    return null;
  }

  if (role === "style_reference") {
    if (!imageMimeTypes.includes(file.type) && !allowedStyleReferenceExtensions.includes(ext)) {
      return `${file.name} 格式不支持，参考官网风格图仅允许 jpg、jpeg、png、webp。`;
    }
    if (file.size > maxImageSize) return `${file.name} 超过 10MB。`;
    return null;
  }

  const allowedByMime = [...imageMimeTypes, ...documentMimeTypes, ...archiveMimeTypes].includes(file.type);
  const allowedByExt = allowedBusinessExtensions.includes(ext);
  if (!allowedByMime && !allowedByExt) {
    return `${file.name} 格式不支持，仅允许图片、PDF、Office 文档、TXT/CSV、zip、rar、7z。`;
  }

  if (imageMimeTypes.includes(file.type) || ["jpg", "jpeg", "png", "webp"].includes(ext)) {
    if (file.size > maxImageSize) return `${file.name} 超过 10MB。`;
    return null;
  }

  if (isArchiveExtension(ext)) {
    if (file.size > maxArchiveSize) return `${file.name} 超过 200MB。`;
    return null;
  }

  if (isDocumentExtension(ext)) {
    if (file.size > maxDocumentSize) return `${file.name} 超过 30MB。`;
    return null;
  }

  return null;
}

export async function saveSiteAssetFile(
  file: File,
  role: SiteAssetRole = "business_asset"
): Promise<Omit<SiteAssetDto, "id" | "createdAt">> {
  const validation = validateSiteAssetFile(file, role);
  if (validation) throw new Error(validation);

  const ext = extensionFromFile(file);
  const base = sanitizeTextForFilename(path.parse(file.name).name) || "site-asset";
  const storedName = `site-${Date.now()}-${crypto.randomUUID()}-${base}.${ext}`;
  const stored = await saveFileBuffer({
    type: "uploads",
    filename: storedName,
    buffer: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    originalName: file.name
  });

  return {
    originalName: file.name,
    storedName: stored.storedName,
    mimeType: file.type,
    size: file.size,
    url: stored.url,
    storageType: stored.storageType,
    assetRole: role
  };
}
