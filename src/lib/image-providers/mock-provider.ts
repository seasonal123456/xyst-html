import { getContentTypeRatio } from "@/lib/prompt-builder";
import { generateMockImageDataUrl } from "@/lib/mock-image-generator";
import { dataUrlToBuffer } from "@/lib/file-utils";
import type { ImageProviderInput, ImageProviderResult } from "@/lib/image-providers/provider-types";

export async function generateMockImage(input: ImageProviderInput, mode: ImageProviderResult["mode"] = "mock", raw?: unknown): Promise<ImageProviderResult> {
  const dataUrl = generateMockImageDataUrl({
    ...input.input,
    uploadedFiles: input.uploadedFiles,
    ratio: getContentTypeRatio(input.input.contentType),
    variantSeed: Date.now()
  });

  return {
    mode,
    imageBuffer: dataUrlToBuffer(dataUrl),
    raw
  };
}
