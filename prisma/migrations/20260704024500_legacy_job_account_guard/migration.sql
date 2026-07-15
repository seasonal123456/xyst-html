ALTER TABLE "Job" ADD COLUMN "ownerAccountId" TEXT;
ALTER TABLE "Job" ADD COLUMN "chargedCreditAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "chargedCreditAmount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Job_ownerAccountId_idx" ON "Job"("ownerAccountId");
