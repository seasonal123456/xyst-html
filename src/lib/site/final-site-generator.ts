import { generateCodexWebsitePreview } from "@/lib/site/codex-site-generator";
import { assertCodexPublicGenerationAllowed } from "@/lib/launch/production-readiness";
import { generateRemoteHtmlWebsitePreview } from "@/lib/site/remote-html-site-generator";
import { generateWebsitePreview as generateTemplateWebsitePreview } from "@/lib/site/site-preview-generator";
import type { SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

export type FinalSitePreviewResult = {
  previewUrl: string;
  screenshotUrl?: string;
  generator: "codex" | "remote_html" | "template";
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

  if (provider === "codex" || provider === "remote_html") {
    if (provider === "codex") assertCodexPublicGenerationAllowed();

    try {
      const result =
        provider === "remote_html"
          ? await generateRemoteHtmlWebsitePreview(job, style, options)
          : await generateCodexWebsitePreview(job, style, options);
      return {
        previewUrl: result.previewUrl,
        screenshotUrl: result.screenshotUrl,
        generator: provider
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
        fallbackReason: error instanceof Error ? error.message : `${provider} generation failed`
      };
    }
  }

  if (provider === "template") {
    const result = await generateTemplateWebsitePreview(job, style, options);
    return {
      previewUrl: result.previewUrl,
      screenshotUrl: result.screenshotUrl,
      generator: "template"
    };
  }

  throw new Error(`不支持的官网生成器：${provider}`);
}
