import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerAccountId" TEXT,
  "status" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "customerName" TEXT,
  "customerContact" TEXT,
  "industry" TEXT,
  "business" TEXT,
  "targetCustomer" TEXT,
  "sellingPoints" TEXT,
  "contact" TEXT,
  "note" TEXT,
  "contentType" TEXT NOT NULL,
  "style" TEXT NOT NULL,
  "usagePurpose" TEXT,
  "needManualRefine" BOOLEAN NOT NULL DEFAULT false,
  "materialConsent" BOOLEAN NOT NULL DEFAULT false,
  "prompt" TEXT NOT NULL,
  "generatedImageUrl" TEXT,
  "publicResultUrl" TEXT,
  "adminNote" TEXT,
  "error" TEXT,
  "chargedCreditAt" DATETIME,
  "chargedCreditAmount" INTEGER NOT NULL DEFAULT 0,
  "regeneratedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "JobFile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "storageType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobFile_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SiteJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerAccountId" TEXT,
  "customerName" TEXT,
  "customerContact" TEXT,
  "businessDescription" TEXT NOT NULL,
  "websitePurpose" TEXT NOT NULL,
  "materialConsent" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL,
  "selectedMainStyleId" TEXT,
  "finalCopyVersionId" TEXT,
  "preferUploadedStyleReference" BOOLEAN NOT NULL DEFAULT false,
  "codexPrompt" TEXT,
  "previewUrl" TEXT,
  "siteZipUrl" TEXT,
  "screenshotUrl" TEXT,
  "deliveryNote" TEXT,
  "adminNote" TEXT,
  "chargedCreditAt" DATETIME,
  "chargedCreditAmount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SiteAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteJobId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "storageType" TEXT NOT NULL,
  "assetRole" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteAsset_siteJobId_fkey" FOREIGN KEY ("siteJobId") REFERENCES "SiteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "StyleConcept" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteJobId" TEXT NOT NULL,
  "styleName" TEXT NOT NULL,
  "styleDescription" TEXT NOT NULL,
  "suitableFor" TEXT,
  "schemeType" TEXT,
  "layoutStyle" TEXT,
  "colorTendency" TEXT,
  "visualTechniquesJson" TEXT,
  "emotionalDescription" TEXT,
  "imageUrl" TEXT NOT NULL,
  "generationBatch" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  "isMainStyle" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StyleConcept_siteJobId_fkey" FOREIGN KEY ("siteJobId") REFERENCES "SiteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "CopyVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteJobId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "contentJson" TEXT NOT NULL,
  "isFinal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopyVersion_siteJobId_fkey" FOREIGN KEY ("siteJobId") REFERENCES "SiteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "CopyAnnotation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "copyVersionId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "selectedText" TEXT NOT NULL,
  "annotationType" TEXT NOT NULL,
  "startOffset" INTEGER,
  "endOffset" INTEGER,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SiteRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteJobId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "revisionInstruction" TEXT NOT NULL,
  "previewUrl" TEXT,
  "screenshotUrl" TEXT,
  "generator" TEXT,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "chargedCreditAmount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteRevision_siteJobId_fkey" FOREIGN KEY ("siteJobId") REFERENCES "SiteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteRevision_siteJobId_idx" ON "SiteRevision"("siteJobId");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteRevision_status_idx" ON "SiteRevision"("status");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteRevision_createdAt_idx" ON "SiteRevision"("createdAt");`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "ModelUsageLog" (
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
`);

await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUsageLog_siteJobId_idx" ON "ModelUsageLog"("siteJobId");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUsageLog_jobId_idx" ON "ModelUsageLog"("jobId");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUsageLog_operation_idx" ON "ModelUsageLog"("operation");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUsageLog_model_idx" ON "ModelUsageLog"("model");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ModelUsageLog_createdAt_idx" ON "ModelUsageLog"("createdAt");`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "CustomerAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT NOT NULL,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "note" TEXT,
  "lastLoginAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "CustomerSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "CreditRechargeRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "packageName" TEXT NOT NULL,
  "requestedCredits" INTEGER NOT NULL,
  "amountYuan" INTEGER NOT NULL,
  "contact" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditRechargeRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_email_key" ON "CustomerAccount"("email");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerAccount_email_idx" ON "CustomerAccount"("email");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerAccount_status_idx" ON "CustomerAccount"("status");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerAccount_createdAt_idx" ON "CustomerAccount"("createdAt");`);
await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerSession_accountId_idx" ON "CustomerSession"("accountId");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CreditRechargeRequest_accountId_idx" ON "CreditRechargeRequest"("accountId");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CreditRechargeRequest_status_idx" ON "CreditRechargeRequest"("status");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CreditRechargeRequest_createdAt_idx" ON "CreditRechargeRequest"("createdAt");`);

async function ensureColumn(table, column, ddl) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
  if (!columns.some((item) => item.name === column)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
  }
}

await ensureColumn("SiteJob", "ownerAccountId", `"ownerAccountId" TEXT`);
await ensureColumn("SiteJob", "workerId", `"workerId" TEXT`);
await ensureColumn("SiteJob", "preferUploadedStyleReference", `"preferUploadedStyleReference" BOOLEAN NOT NULL DEFAULT false`);
await ensureColumn("SiteJob", "workerLeaseUntil", `"workerLeaseUntil" DATETIME`);
await ensureColumn("SiteJob", "siteGenerationQueuedAt", `"siteGenerationQueuedAt" DATETIME`);
await ensureColumn("SiteJob", "siteGenerationStartedAt", `"siteGenerationStartedAt" DATETIME`);
await ensureColumn("SiteJob", "siteGenerationCompletedAt", `"siteGenerationCompletedAt" DATETIME`);
await ensureColumn("SiteJob", "siteGenerationAttemptCount", `"siteGenerationAttemptCount" INTEGER NOT NULL DEFAULT 0`);
await ensureColumn("SiteJob", "chargedCreditAt", `"chargedCreditAt" DATETIME`);
await ensureColumn("SiteJob", "chargedCreditAmount", `"chargedCreditAmount" INTEGER NOT NULL DEFAULT 0`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteJob_ownerAccountId_idx" ON "SiteJob"("ownerAccountId");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteJob_status_updatedAt_idx" ON "SiteJob"("status", "updatedAt");`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteJob_workerLeaseUntil_idx" ON "SiteJob"("workerLeaseUntil");`);
await ensureColumn("StyleConcept", "schemeType", `"schemeType" TEXT`);
await ensureColumn("StyleConcept", "layoutStyle", `"layoutStyle" TEXT`);
await ensureColumn("StyleConcept", "colorTendency", `"colorTendency" TEXT`);
await ensureColumn("StyleConcept", "visualTechniquesJson", `"visualTechniquesJson" TEXT`);
await ensureColumn("StyleConcept", "emotionalDescription", `"emotionalDescription" TEXT`);
await ensureColumn("Job", "ownerAccountId", `"ownerAccountId" TEXT`);
await ensureColumn("Job", "chargedCreditAt", `"chargedCreditAt" DATETIME`);
await ensureColumn("Job", "chargedCreditAmount", `"chargedCreditAmount" INTEGER NOT NULL DEFAULT 0`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Job_ownerAccountId_idx" ON "Job"("ownerAccountId");`);

await prisma.$disconnect();
console.log("SQLite tables are ready.");
