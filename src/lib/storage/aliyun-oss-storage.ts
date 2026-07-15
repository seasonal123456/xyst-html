import { createHmac } from "crypto";
import path from "path";
import { getExtensionFromMimeType, sanitizeTextForFilename, validateImageFile } from "@/lib/file-utils";
import type {
  PublicFileType,
  SaveFileBufferInput,
  SaveGeneratedImageInput,
  SavedUploadedFile,
  StorageProvider,
  StoredFile
} from "@/lib/storage/storage-types";

type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket?: string;
  uploadBucket: string;
  generatedBucket: string;
  region?: string;
  endpoint?: string;
  prefix: string;
  uploadPublicBaseUrl?: string;
  generatedPublicBaseUrl?: string;
  endpointHost: string;
};

function cleanSegment(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function getOssConfig(): OssConfig {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const uploadBucket = process.env.ALIYUN_OSS_UPLOAD_BUCKET?.trim() || bucket;
  const generatedBucket = process.env.ALIYUN_OSS_GENERATED_BUCKET?.trim() || bucket;
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT?.trim();
  const prefix = cleanSegment(process.env.ALIYUN_OSS_PREFIX?.trim() || "ai-website-workbench");

  if (!accessKeyId || !accessKeySecret || !uploadBucket || !generatedBucket || (!region && !endpoint)) {
    throw new Error("阿里云 OSS 配置不完整。");
  }

  const endpointHost = (endpoint || `${region}.aliyuncs.com`).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const uploadPublicBaseUrl =
    process.env.ALIYUN_OSS_UPLOAD_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  const generatedPublicBaseUrl =
    process.env.ALIYUN_OSS_GENERATED_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.replace(/\/+$/, "");

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    uploadBucket,
    generatedBucket,
    region,
    endpoint,
    prefix,
    uploadPublicBaseUrl,
    generatedPublicBaseUrl,
    endpointHost
  };
}

function objectKey(config: OssConfig, type: PublicFileType, filename: string): string {
  const typePrefix = type === "uploads" ? process.env.ALIYUN_OSS_UPLOAD_PREFIX : process.env.ALIYUN_OSS_GENERATED_PREFIX;
  return [config.prefix, cleanSegment(typePrefix || type), cleanSegment(filename)].filter(Boolean).join("/");
}

function bucketForType(config: OssConfig, type: PublicFileType): string {
  return type === "uploads" ? config.uploadBucket : config.generatedBucket;
}

function publicBaseUrlForType(config: OssConfig, type: PublicFileType): string {
  const bucket = bucketForType(config, type);
  const configuredBaseUrl = type === "uploads" ? config.uploadPublicBaseUrl : config.generatedPublicBaseUrl;
  return configuredBaseUrl || `https://${bucket}.${config.endpointHost}`;
}

function authorization(config: OssConfig, bucket: string, method: string, key: string, contentType: string, date: string) {
  const canonicalizedResource = `/${bucket}/${key}`;
  const stringToSign = [method, "", contentType, date, canonicalizedResource].join("\n");
  const signature = createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
  return `OSS ${config.accessKeyId}:${signature}`;
}

export function getPublicUrl(type: PublicFileType, filename: string): string {
  const config = getOssConfig();
  return `${publicBaseUrlForType(config, type)}/${encodeObjectKey(objectKey(config, type, filename))}`;
}

export function rootRelativeUrlToAliyunOssUrl(urlPath: string): string | null {
  const cleaned = urlPath.split(/[?#]/)[0].replace(/^\/+/, "");
  try {
    if (cleaned.startsWith("generated/")) {
      return getPublicUrl("generated", cleaned.slice("generated/".length));
    }
    if (cleaned.startsWith("uploads/")) {
      return getPublicUrl("uploads", cleaned.slice("uploads/".length));
    }
  } catch {
    return null;
  }
  return null;
}

function bucketFromUrl(config: OssConfig, fileUrl: URL): string | null {
  const host = fileUrl.host.toLowerCase();
  const endpointHost = config.endpointHost.toLowerCase();
  const candidates = [config.uploadBucket, config.generatedBucket, config.bucket].filter(Boolean) as string[];

  for (const bucket of candidates) {
    if (host === `${bucket}.${endpointHost}`.toLowerCase()) {
      return bucket;
    }
  }

  const baseUrls: Array<[string | undefined, string]> = [
    [config.uploadPublicBaseUrl, config.uploadBucket],
    [config.generatedPublicBaseUrl, config.generatedBucket]
  ];

  for (const [baseUrl, bucket] of baseUrls) {
    if (!baseUrl) continue;
    try {
      if (new URL(baseUrl).host.toLowerCase() === host) {
        return bucket;
      }
    } catch {
      // Ignore invalid optional base URL.
    }
  }

  return null;
}

export async function downloadAliyunOssObject(fileUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return null;
  }

  const config = getOssConfig();
  const bucket = bucketFromUrl(config, parsed);
  if (!bucket) return null;

  const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!key) return null;

  const date = new Date().toUTCString();
  const requestUrl = `https://${bucket}.${config.endpointHost}/${encodeObjectKey(key)}`;
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: authorization(config, bucket, "GET", key, "", date),
      Date: date
    }
  });

  if (!response.ok) return null;

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "application/octet-stream"
  };
}

export async function saveFileBuffer(input: SaveFileBufferInput): Promise<StoredFile> {
  const config = getOssConfig();
  const key = objectKey(config, input.type, input.filename);
  const bucket = bucketForType(config, input.type);
  const contentType = input.mimeType || "application/octet-stream";
  const date = new Date().toUTCString();
  const url = `https://${bucket}.${config.endpointHost}/${encodeObjectKey(key)}`;
  const body = new Blob([new Uint8Array(input.buffer)]);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authorization(config, bucket, "PUT", key, contentType, date),
      Date: date,
      "Content-Type": contentType,
      "Cache-Control": input.type === "generated" ? "public, max-age=31536000, immutable" : "private, max-age=0"
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OSS 上传失败：${response.status} ${detail}`.slice(0, 800));
  }

  return {
    originalName: input.originalName,
    storedName: input.filename,
    mimeType: input.mimeType,
    size: input.buffer.length,
    url: `${publicBaseUrlForType(config, input.type)}/${encodeObjectKey(key)}`,
    storageType: "aliyun-oss"
  };
}

export async function saveUploadedFileToAliyunOss(file: File): Promise<SavedUploadedFile> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const ext = getExtensionFromMimeType(file.type);
  const originalBaseName = path.parse(file.name).name;
  const safeBaseName = sanitizeTextForFilename(originalBaseName) || "asset";
  const storedName = `upload-${Date.now()}-${crypto.randomUUID()}-${safeBaseName}.${ext}`;
  const stored = await saveFileBuffer({
    type: "uploads",
    filename: storedName,
    buffer: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    originalName: file.name
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

export async function saveGeneratedImageToAliyunOss(input: SaveGeneratedImageInput): Promise<StoredFile> {
  const storedName = input.filename || `generated-${sanitizeTextForFilename(input.jobId)}-${Date.now()}.png`;
  let buffer: Buffer | null = null;

  if (input.imageBuffer) {
    buffer = input.imageBuffer;
  } else if (input.imageBase64) {
    buffer = Buffer.from(input.imageBase64, "base64");
  } else if (input.sourceImageUrl) {
    const response = await fetch(input.sourceImageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败：${response.status}`);
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
    mimeType: "image/png"
  });
}

export const aliyunOssStorageProvider: StorageProvider = {
  saveUploadedFile: saveUploadedFileToAliyunOss,
  saveGeneratedImage: saveGeneratedImageToAliyunOss,
  saveFileBuffer,
  getPublicUrl
};
