import { generateByCustomHttpProvider } from "@/lib/image-providers/custom-http-provider";
import { generateMockImage } from "@/lib/image-providers/mock-provider";
import { generateByOpenAiProvider } from "@/lib/image-providers/openai-provider";
import type { ImageProviderInput, ImageProviderResult } from "@/lib/image-providers/provider-types";

export async function generateImageByProvider(input: ImageProviderInput): Promise<ImageProviderResult> {
  const provider = process.env.IMAGE_PROVIDER?.trim() || "mock";

  if (provider === "openai") {
    try {
      return await generateByOpenAiProvider(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenAI 生图接口调用失败，已回退 Mock。";
      if (process.env.ENABLE_MOCK_FALLBACK === "false") {
        throw new Error(message);
      }
      return generateMockImage(input, "fallback", { fallbackReason: message });
    }
  }

  if (provider === "custom-http") {
    try {
      return await generateByCustomHttpProvider(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "真实出图接口调用失败，已回退 Mock。";
      if (process.env.ENABLE_MOCK_FALLBACK === "false") {
        throw new Error(message);
      }
      return generateMockImage(input, "fallback", { fallbackReason: message });
    }
  }

  return generateMockImage(input, "mock");
}
