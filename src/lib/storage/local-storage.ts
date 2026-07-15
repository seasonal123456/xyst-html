import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { base64ToBuffer, getExtensionFromMimeType, sanitizeTextForFilename, validateImageFile } from "@/lib/file-utils";
import type { SaveFileBufferInput, SaveGeneratedImageInput, SavedUploadedFile, PublicFileType, StoredFile, StorageProvider } from "@/lib/storage/storage-types";

const projectRoot = /*turbopackIgnore: true*/ process.cwd();

function getPublicSubdir(type: PublicFileType): string {
  const envValue = type === "uploads" ? process.env.UPLOAD_DIR : process.env.GENERATED_DIR;
  const fallback = type;
  const normalized = (envValue || fallback).replace(/\\/g, "/").replace(/^public\//, "").replace(/^\/+/, "");
  return normalized || fallback;
}

function getPublicDir(type: PublicFileType): string {
  return path.join(projectRoot, "public", getPublicSubdir(type));
}

async function ensurePublicDir(type: PublicFileType): Promise<string> {
  const dir = getPublicDir(type);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function getPublicFileUrl(type: PublicFileType, filename: string): string {
  return `/${getPublicSubdir(type)}/${filename}`;
}

export async function saveFileBuffer(input: SaveFileBufferInput): Promise<StoredFile> {
  const publicDir = await ensurePublicDir(input.type);
  const filePath = path.join(publicDir, input.filename);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.buffer);
  return {
    originalName: input.originalName,
    storedName: input.filename,
    mimeType: input.mimeType,
    size: input.buffer.length,
    url: getPublicFileUrl(input.type, input.filename),
    storageType: "local"
  };
}

export async function saveUploadedFile(file: File): Promise<SavedUploadedFile> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const ext = getExtensionFromMimeType(file.type);
  const originalBaseName = path.parse(file.name).name;
  const safeBaseName = sanitizeTextForFilename(originalBaseName) || "asset";
  const storedName = `upload-${Date.now()}-${crypto.randomUUID()}-${safeBaseName}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const stored = await saveFileBuffer({
    type: "uploads",
    filename: storedName,
    buffer,
    mimeType: file.type,
    originalName: file.name,
  });

  return {
    originalName: stored.originalName || file.name,
    storedName: stored.storedName,
    size: stored.size || file.size,
    mimeType: stored.mimeType || file.type,
    url: stored.url,
    storageType: stored.storageType
  };
}

export async function saveGeneratedImage(input: SaveGeneratedImageInput): Promise<StoredFile> {
  const storedName = input.filename || `generated-${sanitizeTextForFilename(input.jobId)}-${Date.now()}.png`;
  let buffer: Buffer | null = null;

  if (input.imageBuffer) {
    buffer = input.imageBuffer;
  } else if (input.imageBase64) {
    buffer = base64ToBuffer(input.imageBase64);
  } else if (input.sourceImageUrl) {
    const response = await fetch(input.sourceImageUrl);
    if (!response.ok) {
      throw new Error(`下载真实接口返回图片失败：${response.status}`);
    }
    buffer = Buffer.from(await response.arrayBuffer());
  }

  if (!buffer) {
    throw new Error("出图服务没有返回可保存的图片。");
  }

  return saveFileBuffer({
    type: "generated",
    filename: storedName,
    buffer,
    mimeType: "image/png",
  });
}

export const localStorageProvider: StorageProvider = {
  saveUploadedFile,
  saveGeneratedImage,
  saveFileBuffer,
  getPublicUrl: getPublicFileUrl
};
