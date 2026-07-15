import type { GenerateJobInput, JobMode, StoredUploadedFile } from "@/types";

export type ImageProviderInput = {
  jobId?: string;
  prompt: string;
  input: GenerateJobInput;
  uploadedFiles: StoredUploadedFile[];
};

export type ImageProviderResult = {
  mode: JobMode;
  imageBuffer?: Buffer;
  imageBase64?: string;
  imageUrl?: string;
  raw?: unknown;
};
