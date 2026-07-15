export type WebsitePurpose = "展示公司" | "展示产品" | "展示项目" | "招商获客" | "收集咨询" | "AI 帮我判断";

export type SiteStatus =
  | "draft"
  | "materials_uploaded"
  | "style_generating"
  | "style_generated"
  | "style_selected"
  | "copy_drafting"
  | "copy_reviewing"
  | "copy_revising"
  | "copy_confirmed"
  | "codex_prompt_ready"
  | "site_generation_queued"
  | "site_generating"
  | "site_generated"
  | "admin_reviewing"
  | "client_preview"
  | "standard_delivery_ready"
  | "revision_requested"
  | "delivered"
  | "archived"
  | "failed";

export type SiteAssetDto = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  url: string;
  storageType: string;
  assetRole?: string | null;
  createdAt: string;
};

export type StyleConceptDto = {
  id: string;
  styleName: string;
  styleDescription: string;
  suitableFor?: string | null;
  schemeType?: string | null;
  layoutStyle?: string | null;
  colorTendency?: string | null;
  visualTechniques: string[];
  emotionalDescription?: string | null;
  imageUrl: string;
  generationBatch: number;
  mode: "mock" | "real" | "fallback";
  isFavorite: boolean;
  isMainStyle: boolean;
  createdAt: string;
};

export type CopyRange = {
  text: string;
  startOffset?: number;
  endOffset?: number;
};

export type CopyModule = {
  moduleId: string;
  moduleName: string;
  content: string;
  order: number;
  lockedRanges: CopyRange[];
  rejectedRanges: CopyRange[];
  manualEdited: boolean;
};

export type CopyVersionDto = {
  id: string;
  versionNumber: number;
  contentJson: CopyModule[];
  isFinal: boolean;
  createdAt: string;
};

export type SiteRevisionDto = {
  id: string;
  versionNumber: number;
  revisionInstruction: string;
  previewUrl?: string | null;
  screenshotUrl?: string | null;
  generator?: string | null;
  status: string;
  error?: string | null;
  chargedCreditAmount: number;
  createdAt: string;
};

export type ImageGenerationUsageDto = {
  limit: number;
  used: number;
  remaining: number;
};

export type DeliveryIntegrityAssetIssueDto = {
  sourceUrl: string;
  reason: string;
};

export type DeliveryIntegrityReportDto = {
  jobId: string;
  generatedAt: string;
  websiteAssetCount: number;
  archivedSourceAssetCount: number;
  missingWebsiteAssets: DeliveryIntegrityAssetIssueDto[];
  missingArchivedSourceAssets: DeliveryIntegrityAssetIssueDto[];
  rule?: string;
};

export type SiteJobDto = {
  id: string;
  customerName?: string | null;
  customerContact?: string | null;
  businessDescription: string;
  websitePurpose: string;
  materialConsent: boolean;
  status: SiteStatus;
  selectedMainStyleId?: string | null;
  finalCopyVersionId?: string | null;
  preferUploadedStyleReference: boolean;
  codexPrompt?: string | null;
  previewUrl?: string | null;
  siteZipUrl?: string | null;
  screenshotUrl?: string | null;
  publishedUrl?: string | null;
  publishProvider?: string | null;
  publishStatus?: string | null;
  publishError?: string | null;
  netlifySiteId?: string | null;
  netlifySiteName?: string | null;
  netlifyDeployId?: string | null;
  publishedAt?: string | null;
  deliveryNote?: string | null;
  deliveryIntegrityReport?: DeliveryIntegrityReportDto | null;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
  assets: SiteAssetDto[];
  styleConcepts: StyleConceptDto[];
  copyVersions: CopyVersionDto[];
  revisions: SiteRevisionDto[];
  imageGenerationUsage?: ImageGenerationUsageDto;
};
