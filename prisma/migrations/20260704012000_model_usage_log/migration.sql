CREATE TABLE "ModelUsageLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "model" TEXT,
  "endpoint" TEXT,
  "jobId" TEXT,
  "siteJobId" TEXT,
  "status" TEXT NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "imageCount" INTEGER,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "totalTokens" INTEGER,
  "cachedInputTokens" INTEGER,
  "reasoningTokens" INTEGER,
  "promptCharacters" INTEGER,
  "responseCharacters" INTEGER,
  "durationMs" INTEGER,
  "rawUsageJson" TEXT,
  "metadataJson" TEXT,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ModelUsageLog_siteJobId_idx" ON "ModelUsageLog"("siteJobId");
CREATE INDEX "ModelUsageLog_jobId_idx" ON "ModelUsageLog"("jobId");
CREATE INDEX "ModelUsageLog_operation_idx" ON "ModelUsageLog"("operation");
CREATE INDEX "ModelUsageLog_model_idx" ON "ModelUsageLog"("model");
CREATE INDEX "ModelUsageLog_createdAt_idx" ON "ModelUsageLog"("createdAt");
