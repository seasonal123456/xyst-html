import { ALLOWED_IMAGE_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function sanitizeTextForFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function getExtensionFromMimeType(mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType] ?? "";
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return `${file.name} 格式不支持，仅允许 jpg、jpeg、png、webp。`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `${file.name} 超过 10MB。`;
  }

  if (!getExtensionFromMimeType(file.type)) {
    return `${file.name} 无法识别安全图片扩展名。`;
  }

  return null;
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex < 0) {
    throw new Error("无效的 data URL。");
  }

  return Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
}

export function base64ToBuffer(value: string): Buffer {
  const maybeDataUrl = value.trim();
  if (maybeDataUrl.startsWith("data:")) {
    return dataUrlToBuffer(maybeDataUrl);
  }

  return Buffer.from(maybeDataUrl, "base64");
}
