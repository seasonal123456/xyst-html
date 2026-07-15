ALTER TABLE "SiteJob" ADD COLUMN "workerId" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "workerLeaseUntil" DATETIME;
ALTER TABLE "SiteJob" ADD COLUMN "siteGenerationQueuedAt" DATETIME;
ALTER TABLE "SiteJob" ADD COLUMN "siteGenerationStartedAt" DATETIME;
ALTER TABLE "SiteJob" ADD COLUMN "siteGenerationCompletedAt" DATETIME;
ALTER TABLE "SiteJob" ADD COLUMN "siteGenerationAttemptCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "SiteJob_status_updatedAt_idx" ON "SiteJob"("status", "updatedAt");
CREATE INDEX "SiteJob_workerLeaseUntil_idx" ON "SiteJob"("workerLeaseUntil");
