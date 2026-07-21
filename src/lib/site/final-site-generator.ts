import { generateCodexWebsitePreview } from "@/lib/site/codex-site-generator";
import { assertCodexPublicGenerationAllowed } from "@/lib/launch/production-readiness";
import { generateWebsitePreview as generateTemplateWebsitePreview } from "@/lib/site/site-preview-generator";
import type { SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

export type FinalSitePreviewResult = {
  previewUrl: string;
  screenshotUrl?: string;
  generator: "codex" | "template";
  fallbackReason?: string;
};

export type FinalSitePreviewOptions = {
  revisionInstruction?: string;
};

export async function generateFinalWebsitePreview(
  job: SiteJobDto,
  style: StyleConceptDto,
  options: FinalSitePreviewOptions = {}
): Promise<FinalSitePreviewResult> {
  const provider = process.env.SITE_GENERATOR_PROVIDER?.trim().toLowerCase() || "codex";

  if (provider !== "template") {
    assertCodexPublicGenerationAllowed();

    try {
      const result = await generateCodexWebsitePreview(job, style, options);
      return {
        previewUrl: result.previewUrl,
        screenshotUrl: result.screenshotUrl,
        generator: "codex"
      };
    } catch (error) {
      if (process.env.SITE_GENERATOR_ENABLE_TEMPLATE_FALLBACK !== "true") {
        throw error;
      }
      const fallback = await generateTemplateWebsitePreview(job, style, options);
      return {
        previewUrl: fallback.previewUrl,
        screenshotUrl: fallback.screenshotUrl,
        generator: "template",
        fallbackReason: error instanceof Error ? error.message : "Codex generation failed"
      };
    }
  }

  const result = await generateTemplateWebsitePreview(job, style, options);
  return {
    previewUrl: result.previewUrl,
    screenshotUrl: result.screenshotUrl,
    generator: "template"
  };
}
