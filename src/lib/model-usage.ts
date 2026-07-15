import { prisma } from "@/lib/db";

type UnknownRecord = Record<string, unknown>;

export type ParsedModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  rawUsageJson?: string;
};

export type RecordModelUsageInput = ParsedModelUsage & {
  provider: string;
  operation: string;
  model?: string;
  endpoint?: string;
  jobId?: string;
  siteJobId?: string;
  status?: "success" | "error";
  requestCount?: number;
  imageCount?: number;
  promptCharacters?: number;
  responseCharacters?: number;
  durationMs?: number;
  metadata?: unknown;
  error?: unknown;
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = asNumber(value);
    if (numberValue !== undefined) return numberValue;
  }
  return undefined;
}

function safeJson(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

export function extractUsageFromResponse(responseJson: unknown): ParsedModelUsage {
  const root = asRecord(responseJson);
  const usage = asRecord(root?.usage);
  if (!usage) return {};

  const promptDetails = asRecord(usage.prompt_tokens_details);
  const completionDetails = asRecord(usage.completion_tokens_details);
  const inputDetails = asRecord(usage.input_tokens_details);
  const outputDetails = asRecord(usage.output_tokens_details);

  return {
    inputTokens: firstNumber(usage.input_tokens, usage.prompt_tokens),
    outputTokens: firstNumber(usage.output_tokens, usage.completion_tokens),
    totalTokens: firstNumber(usage.total_tokens),
    cachedInputTokens: firstNumber(inputDetails?.cached_tokens, promptDetails?.cached_tokens),
    reasoningTokens: firstNumber(outputDetails?.reasoning_tokens, completionDetails?.reasoning_tokens),
    rawUsageJson: safeJson(usage)
  };
}

export async function recordModelUsage(input: RecordModelUsageInput) {
  try {
    await prisma.modelUsageLog.create({
      data: {
        provider: input.provider,
        operation: input.operation,
        model: input.model,
        endpoint: input.endpoint,
        jobId: input.jobId,
        siteJobId: input.siteJobId,
        status: input.status || (input.error ? "error" : "success"),
        requestCount: input.requestCount || 1,
        imageCount: input.imageCount,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        cachedInputTokens: input.cachedInputTokens,
        reasoningTokens: input.reasoningTokens,
        promptCharacters: input.promptCharacters,
        responseCharacters: input.responseCharacters,
        durationMs: input.durationMs,
        rawUsageJson: input.rawUsageJson,
        metadataJson: safeJson(input.metadata),
        error: errorMessage(input.error)
      }
    });
  } catch (error) {
    console.warn("Model usage log failed:", error instanceof Error ? error.message : error);
  }
}

export function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}
