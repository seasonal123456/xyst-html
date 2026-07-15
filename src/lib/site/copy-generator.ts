import { generateMockCopyVersion } from "@/lib/site/mock-copy-generator";
import { generateRealCopyVersion } from "@/lib/site/real-copy-generator";
import type { CopyGeneratorInput, GeneratedCopyVersion } from "@/lib/site/copy-types";

export async function generateCopyVersion(input: CopyGeneratorInput): Promise<GeneratedCopyVersion> {
  const provider = process.env.COPY_PROVIDER || "mock";

  if (provider !== "mock") {
    try {
      return await generateRealCopyVersion(input);
    } catch (error) {
      if (process.env.ENABLE_MOCK_FALLBACK === "false") {
        throw error;
      }
      return generateMockCopyVersion(input);
    }
  }

  return generateMockCopyVersion(input);
}
