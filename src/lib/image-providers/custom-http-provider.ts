import type { ImageProviderInput, ImageProviderResult } from "@/lib/image-providers/provider-types";
import { elapsedMs, extractUsageFromResponse, recordModelUsage } from "@/lib/model-usage";

type CustomHttpConfig = {
  baseUrl: string;
  endpoint: string;
  apiKey: string;
  model: string;
};

export function getCustomHttpConfig(): CustomHttpConfig | null {
  const baseUrl = process.env.IMAGE_API_BASE_URL?.trim();
  const endpoint = process.env.IMAGE_API_ENDPOINT?.trim();
  const apiKey = process.env.IMAGE_API_KEY?.trim();
  const model = process.env.IMAGE_API_MODEL?.trim();

  if (!baseUrl || !endpoint || !apiKey || !model) {
    return null;
  }

  return { baseUrl, endpoint, apiKey, model };
}

function buildUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function usageMetadata(input: ImageProviderInput, extra?: Record<string, unknown>) {
  return {
    uploadedFileCount: input.uploadedFiles.length,
    contentType: input.input.contentType,
    style: input.input.style,
    name: input.input.name,
    ...extra
  };
}

export async function generateByCustomHttpProvider(input: ImageProviderInput): Promise<ImageProviderResult> {
  const config = getCustomHttpConfig();

  if (!config) {
    throw new Error("custom-http image API config is incomplete; falling back to mock.");
  }

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
      body: JSON.stringify({
        model: config.model,
        prompt: input.prompt,
        images: input.uploadedFiles.map((file) => ({
          filename: file.originalName,
          url: file.url
        })),
        metadata: {
          contentType: input.input.contentType,
          style: input.input.style,
          name: input.input.name
        }
      })
    });
  } catch (error) {
    await recordModelUsage({
      provider: "custom-http",
      operation: "legacy_image_generation",
      model: config.model,
      endpoint,
      jobId: input.jobId,
      status: "error",
      imageCount: 1,
      promptCharacters: input.prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata: usageMetadata(input),
      error
    });
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    await recordModelUsage({
      provider: "custom-http",
      operation: "legacy_image_generation",
      model: config.model,
      endpoint,
      jobId: input.jobId,
      status: "error",
      imageCount: 1,
      promptCharacters: input.prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata: usageMetadata(input),
      error: `HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`
    });
    throw new Error(`Real image API request failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.startsWith("image/")) {
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    await recordModelUsage({
      provider: "custom-http",
      operation: "legacy_image_generation",
      model: config.model,
      endpoint,
      jobId: input.jobId,
      imageCount: 1,
      promptCharacters: input.prompt.length,
      responseCharacters: imageBuffer.length,
      durationMs: elapsedMs(startedAt),
      metadata: usageMetadata(input, { responseContentType: contentType })
    });
    return {
      mode: "real",
      imageBuffer,
      raw: { contentType }
    };
  }

  const json = (await response.json()) as {
    imageBase64?: string;
    image_base64?: string;
    imageUrl?: string;
    image_url?: string;
    url?: string;
    [key: string]: unknown;
  };

  await recordModelUsage({
    provider: "custom-http",
    operation: "legacy_image_generation",
    model: config.model,
    endpoint,
    jobId: input.jobId,
    imageCount: 1,
    promptCharacters: input.prompt.length,
    responseCharacters: JSON.stringify(json).length,
    durationMs: elapsedMs(startedAt),
    metadata: usageMetadata(input, { responseContentType: contentType || undefined }),
    ...extractUsageFromResponse(json)
  });

  return {
    mode: "real",
    imageBase64: json.imageBase64 || json.image_base64,
    imageUrl: json.imageUrl || json.image_url || json.url,
    raw: json
  };
}
