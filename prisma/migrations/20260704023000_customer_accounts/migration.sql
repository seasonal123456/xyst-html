CREATE TABLE "CustomerAccount" (
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

CREATE TABLE "CustomerSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerAccount_email_key" ON "CustomerAccount"("email");
CREATE INDEX "CustomerAccount_email_idx" ON "CustomerAccount"("email");
CREATE INDEX "CustomerAccount_status_idx" ON "CustomerAccount"("status");
CREATE INDEX "CustomerAccount_createdAt_idx" ON "CustomerAccount"("createdAt");
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_accountId_idx" ON "CustomerSession"("accountId");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

ALTER TABLE "SiteJob" ADD COLUMN "ownerAccountId" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "chargedCreditAt" DATETIME;
ALTER TABLE "SiteJob" ADD COLUMN "chargedCreditAmount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "SiteJob_ownerAccountId_idx" ON "SiteJob"("ownerAccountId");
