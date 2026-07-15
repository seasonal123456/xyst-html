CREATE TABLE "SiteJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerName" TEXT,
  "customerContact" TEXT,
  "businessDescription" TEXT NOT NULL,
  "websitePurpose" TEXT NOT NULL,
  "materialConsent" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL,
  "selectedMainStyleId" TEXT,
  "finalCopyVersionId" TEXT,
  "codexPrompt" TEXT,
  "previewUrl" TEXT,
  "siteZipUrl" TEXT,
  "screenshotUrl" TEXT,
  "deliveryNote" TEXT,
  "adminNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SiteAsset" (
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

CREATE TABLE "StyleConcept" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteJobId" TEXT NOT NULL,
  "styleName" TEXT NOT NULL,
  "styleDescription" TEXT NOT NULL,
  "suitableFor" TEXT,
  "imageUrl" TEXT NOT NULL,
  "generationBatch" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  "isMainStyle" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StyleConcept_siteJobId_fkey" FOREIGN KEY ("siteJobId") REFERENCES "SiteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CopyVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteJobId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "contentJson" TEXT NOT NULL,
  "isFinal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopyVersion_siteJobId_fkey" FOREIGN KEY ("siteJobId") REFERENCES "SiteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CopyAnnotation" (
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
