export type UploadedAsset = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  sourceFile?: File;
};

export type RequirementFormValues = {
  name: string;
  customerName: string;
  customerContact: string;
  industry: string;
  business: string;
  targetCustomer: string;
  sellingPoints: string;
  contact: string;
  note: string;
  usagePurpose: string;
  needManualRefine: boolean;
  materialConsent: boolean;
};

export type ContentTypeOption = {
  id: string;
  label: string;
  ratio: string;
  description: string;
};

export type StyleOption = {
  id: string;
  label: string;
  description: string;
};

export type JobStatus = "pending" | "uploading" | "prompt_ready" | "generating" | "completed" | "review" | "delivered" | "failed" | "archived";

export type TaskStatus = "idle" | JobStatus;

export type JobMode = "mock" | "real" | "fallback";

export type PromptAsset = {
  name?: string;
  originalName?: string;
  storedName?: string;
  size: number;
  type?: string;
  mimeType?: string;
  url?: string;
};

export type BuildPromptInput = RequirementFormValues & {
  contentType: string;
  style: string;
  uploadedFiles: PromptAsset[];
};

export type MockImageInput = BuildPromptInput & {
  ratio: string;
  variantSeed: number;
};

export type StoredUploadedFile = {
  id?: string;
  jobId?: string;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  url: string;
  storageType?: "local" | "aliyun-oss";
  createdAt?: string;
};

export type GenerateJobInput = RequirementFormValues & {
  contentType: string;
  style: string;
};

export type GenerateJob = {
  id: string;
  status: JobStatus;
  mode: JobMode;
  input: GenerateJobInput;
  prompt: string;
  uploadedFiles: StoredUploadedFile[];
  generatedImageUrl?: string;
  publicResultUrl?: string;
  adminNote?: string;
  error?: string;
  rawProviderResponse?: unknown;
  regeneratedCount?: number;
  createdAt: string;
  updatedAt: string;
};
