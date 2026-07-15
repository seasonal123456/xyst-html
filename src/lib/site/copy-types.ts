import type { CopyModule, CopyVersionDto, SiteAssetDto, SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

export type CopyGeneratorInput = {
  siteJob: SiteJobDto;
  selectedMainStyle?: StyleConceptDto;
  uploadedAssets: SiteAssetDto[];
  previousCopyVersion?: CopyVersionDto;
  revisionInstruction?: string;
  annotations?: unknown[];
};

export type GeneratedCopyVersion = {
  contentJson: CopyModule[];
};
