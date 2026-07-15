import type { ImageProviderInput, ImageProviderResult } from "@/lib/image-providers/provider-types";
import { elapsedMs, extractUsageFromResponse, recordModelUsage } from "@/lib/model-usage";

type OpenAiImageConfig = {
  baseUrl: string;
  endpoint: string;
  apiKey: string;
  model: string;
  size: string;
  quality: string;
};

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
    base64?: string;
    url?: string;
  }>;
  imageBase64?: string;
  image_base64?: string;
  imageUrl?: string;
  image_url?: string;
  url?: string;
};

function getOpenAiImageConfig(): OpenAiImageConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com",
    endpoint: process.env.OPENAI_IMAGE_ENDPOINT?.trim() || "/v1/images/generations",
    apiKey,
    model: process.env.IMAGE_MODEL?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2",
    size: process.env.IMAGE_SIZE?.trim() || process.env.STYLE_IMAGE_SIZE?.trim() || "1024x1024",
    quality: process.env.IMAGE_QUALITY?.trim() || process.env.STYLE_IMAGE_QUALITY?.trim() || ""
  };
}

function buildUrl(baseUrl: string, endpoint: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const requestPath = endpoint.replace(/^\/+/, "");
  if (base.endsWith("/v1") && requestPath.startsWith("v1/")) {
    return `${base}/${requestPath.slice(3)}`;
  }
  return `${base}/${requestPath}`;
}

export async function generateByOpenAiProvider(input: ImageProviderInput): Promise<ImageProviderResult> {
  const config = getOpenAiImageConfig();
  if (!config) {
    throw new Error("OpenAI 生图接口未配置 API key。");
  }

  const body: Record<string, string | number> = {
    model: config.model,
    prompt: input.prompt,
    n: 1,
    size: config.size
  };

  if (config.quality) body.quality = config.quality;

  const endpoint = buildUrl(config.baseUrl, config.endpoint);
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    await recordModelUsage({
      provider: "openai",
      operation: "legacy_image_generation",
      model: config.model,
      endpoint,
      jobId: input.jobId,
      status: "error",
      imageCount: 1,
      promptCharacters: input.prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata: { size: config.size, quality: config.quality || undefined },
      error
    });
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    await recordModelUsage({
      provider: "openai",
      operation: "legacy_image_generation",
      model: config.model,
      endpoint,
      jobId: input.jobId,
      status: "error",
      imageCount: 1,
      promptCharacters: input.prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata: { size: config.size, quality: config.quality || undefined },
      error: `HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`
    });
    throw new Error(`OpenAI 生图接口调用失败：HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }

  const json = (await response.json()) as OpenAiImageResponse;
  await recordModelUsage({
    provider: "openai",
    operation: "legacy_image_generation",
    model: config.model,
    endpoint,
    jobId: input.jobId,
    imageCount: 1,
    promptCharacters: input.prompt.length,
    responseCharacters: JSON.stringify(json).length,
    durationMs: elapsedMs(startedAt),
    metadata: { size: config.size, quality: config.quality || undefined },
    ...extractUsageFromResponse(json)
  });
  const first = json.data?.[0];
  return {
    mode: "real",
    imageBase64: first?.b64_json || first?.base64 || json.imageBase64 || json.image_base64,
    imageUrl: first?.url || json.imageUrl || json.image_url || json.url,
    raw: json
  };
}
