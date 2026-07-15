import type { SiteAssetDto, SiteJobDto } from "@/lib/site/site-types";
import type { StyleDesignConditions } from "@/lib/site/style-design-conditions";

export type StyleConceptInput = {
  siteJob: SiteJobDto;
  uploadedAssets: SiteAssetDto[];
  batchNumber: number;
};

export type GeneratedStyleConcept = {
  styleName: string;
  styleDescription: string;
  suitableFor: string;
  imageUrl: string;
  generationBatch: number;
  mode: "mock" | "real" | "fallback";
} & StyleDesignConditions;
