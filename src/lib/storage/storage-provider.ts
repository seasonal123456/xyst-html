import { aliyunOssStorageProvider } from "@/lib/storage/aliyun-oss-storage";
import { localStorageProvider } from "@/lib/storage/local-storage";
import type { SaveFileBufferInput, SaveGeneratedImageInput, SavedUploadedFile, StorageProvider, StoredFile } from "@/lib/storage/storage-types";

function shouldUseAliyunOss(): boolean {
  return process.env.STORAGE_PROVIDER?.trim() === "aliyun-oss";
}

async function withFallback<T>(operation: (provider: StorageProvider) => Promise<T>): Promise<T> {
  if (!shouldUseAliyunOss()) {
    return operation(localStorageProvider);
  }

  try {
    return await operation(aliyunOssStorageProvider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OSS 存储失败，已回退本地存储。";
    console.warn(message);
    return operation(localStorageProvider);
  }
}

export async function saveUploadedFile(file: File): Promise<SavedUploadedFile> {
  return withFallback((provider) => provider.saveUploadedFile(file));
}

export async function saveGeneratedImage(input: SaveGeneratedImageInput): Promise<StoredFile> {
  return withFallback((provider) => provider.saveGeneratedImage(input));
}

export async function saveFileBuffer(input: SaveFileBufferInput): Promise<StoredFile> {
  return withFallback((provider) => provider.saveFileBuffer(input));
}

export function getStorageModeLabel(storageType?: string): string {
  if (storageType === "aliyun-oss") {
    return "aliyun-oss";
  }

  if (shouldUseAliyunOss()) {
    return "aliyun-oss 配置异常，已回退 local";
  }

  return "local";
}
