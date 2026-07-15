import { generateMockStyleConcepts } from "@/lib/site/mock-style-generator";
import { generateRealStyleConcepts } from "@/lib/site/real-style-generator";
import type { GeneratedStyleConcept, StyleConceptInput } from "@/lib/site/style-concept-types";

export async function generateStyleConcepts(input: StyleConceptInput): Promise<GeneratedStyleConcept[]> {
  const provider = process.env.STYLE_IMAGE_PROVIDER || "mock";

  if (provider !== "mock") {
    try {
      return await generateRealStyleConcepts(input);
    } catch (error) {
      if (error instanceof Error && error.message.includes("本次建站最多生成")) {
        throw error;
      }
      if (process.env.ENABLE_MOCK_FALLBACK === "false") {
        throw error;
      }
      const fallback = await generateMockStyleConcepts(input);
      return fallback.map((concept) => ({
        ...concept,
        mode: "fallback" as const,
        styleDescription: `${concept.styleDescription}（真实接口暂不可用，已使用兜底生成）`
      }));
    }
  }

  return generateMockStyleConcepts(input);
}
