CREATE TABLE "SiteRevision" (
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

CREATE INDEX "SiteRevision_siteJobId_idx" ON "SiteRevision"("siteJobId");
CREATE INDEX "SiteRevision_status_idx" ON "SiteRevision"("status");
CREATE INDEX "SiteRevision_createdAt_idx" ON "SiteRevision"("createdAt");
