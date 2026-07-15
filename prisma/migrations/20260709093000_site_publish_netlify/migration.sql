ALTER TABLE "SiteJob" ADD COLUMN "publishedUrl" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "publishProvider" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "publishStatus" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "publishError" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "netlifySiteId" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "netlifySiteName" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "netlifyDeployId" TEXT;
ALTER TABLE "SiteJob" ADD COLUMN "publishedAt" DATETIME;
