import type { StoredUploadedFile } from "@/types";

export type StorageType = "local" | "aliyun-oss";

export type StoredFile = {
  originalName?: string;
  storedName: string;
  mimeType?: string;
  size?: number;
  url: string;
  storageType: StorageType;
};

export type SavedUploadedFile = StoredUploadedFile & {
  storageType: StorageType;
};

export type PublicFileType = "uploads" | "generated";

export type SaveFileBufferInput = {
  type: PublicFileType;
  filename: string;
  buffer: Buffer;
  mimeType?: string;
  originalName?: string;
};

export type SaveGeneratedImageInput = {
  jobId: string;
  filename?: string;
  imageBuffer?: Buffer;
  imageBase64?: string;
  sourceImageUrl?: string;
};

export type StorageProvider = {
  saveUploadedFile(file: File): Promise<SavedUploadedFile>;
  saveGeneratedImage(input: SaveGeneratedImageInput): Promise<StoredFile>;
  saveFileBuffer(input: SaveFileBufferInput): Promise<StoredFile>;
  getPublicUrl(type: PublicFileType, filename: string): string;
};
