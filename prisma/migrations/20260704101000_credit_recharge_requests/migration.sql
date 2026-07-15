CREATE TABLE "CreditRechargeRequest" (
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

CREATE INDEX "CreditRechargeRequest_accountId_idx" ON "CreditRechargeRequest"("accountId");
CREATE INDEX "CreditRechargeRequest_status_idx" ON "CreditRechargeRequest"("status");
CREATE INDEX "CreditRechargeRequest_createdAt_idx" ON "CreditRechargeRequest"("createdAt");
