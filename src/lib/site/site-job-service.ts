import type { CopyVersion, SiteAsset, SiteJob, SiteRevision, StyleConcept } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CopyModule, DeliveryIntegrityReportDto, SiteJobDto, SiteStatus } from "@/lib/site/site-types";
import { parseVisualTechniques } from "@/lib/site/style-design-conditions";

type SiteJobFull = SiteJob & {
  assets: SiteAsset[];
  styleConcepts: StyleConcept[];
  copyVersions: CopyVersion[];
  revisions: SiteRevision[];
};

export function parseCopyContent(contentJson: string): CopyModule[] {
  try {
    const parsed = JSON.parse(contentJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseDeliveryIntegrityReport(contentJson?: string | null): DeliveryIntegrityReportDto | null {
  if (!contentJson) return null;
  try {
    const parsed = JSON.parse(contentJson) as Partial<DeliveryIntegrityReportDto>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      jobId: String(parsed.jobId || ""),
      generatedAt: String(parsed.generatedAt || ""),
      websiteAssetCount: Number(parsed.websiteAssetCount || 0),
      archivedSourceAssetCount: Number(parsed.archivedSourceAssetCount || 0),
      missingWebsiteAssets: Array.isArray(parsed.missingWebsiteAssets) ? parsed.missingWebsiteAssets : [],
      missingArchivedSourceAssets: Array.isArray(parsed.missingArchivedSourceAssets) ? parsed.missingArchivedSourceAssets : [],
      rule: parsed.rule
    };
  } catch {
    return null;
  }
}

export function toSiteJobDto(job: SiteJobFull): SiteJobDto {
  return {
    id: job.id,
    customerName: job.customerName,
    customerContact: job.customerContact,
    businessDescription: job.businessDescription,
    websitePurpose: job.websitePurpose,
    materialConsent: job.materialConsent,
    status: job.status as SiteStatus,
    selectedMainStyleId: job.selectedMainStyleId,
    finalCopyVersionId: job.finalCopyVersionId,
    preferUploadedStyleReference: job.preferUploadedStyleReference,
    codexPrompt: job.codexPrompt,
    previewUrl: job.previewUrl,
    siteZipUrl: job.siteZipUrl,
    screenshotUrl: job.screenshotUrl,
    publishedUrl: job.publishedUrl,
    publishProvider: job.publishProvider,
    publishStatus: job.publishStatus,
    publishError: job.publishError,
    netlifySiteId: job.netlifySiteId,
    netlifySiteName: job.netlifySiteName,
    netlifyDeployId: job.netlifyDeployId,
    publishedAt: job.publishedAt?.toISOString() || null,
    deliveryNote: job.deliveryNote,
    deliveryIntegrityReport: parseDeliveryIntegrityReport(job.deliveryIntegrityReportJson),
    adminNote: job.adminNote,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    assets: job.assets.map((asset) => ({
      id: asset.id,
      originalName: asset.originalName,
      storedName: asset.storedName,
      mimeType: asset.mimeType,
      size: asset.size,
      url: asset.url,
      storageType: asset.storageType,
      assetRole: asset.assetRole,
      createdAt: asset.createdAt.toISOString()
    })),
    styleConcepts: job.styleConcepts.map((style) => ({
      id: style.id,
      styleName: style.styleName,
      styleDescription: style.styleDescription,
      suitableFor: style.suitableFor,
      schemeType: style.schemeType,
      layoutStyle: style.layoutStyle,
      colorTendency: style.colorTendency,
      visualTechniques: parseVisualTechniques(style.visualTechniquesJson),
      emotionalDescription: style.emotionalDescription,
      imageUrl: style.imageUrl,
      generationBatch: style.generationBatch,
      mode: style.mode as "mock" | "real" | "fallback",
      isFavorite: style.isFavorite,
      isMainStyle: style.isMainStyle,
      createdAt: style.createdAt.toISOString()
    })),
    copyVersions: job.copyVersions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      contentJson: parseCopyContent(version.contentJson),
      isFinal: version.isFinal,
      createdAt: version.createdAt.toISOString()
    })),
    revisions: job.revisions.map((revision) => ({
      id: revision.id,
      versionNumber: revision.versionNumber,
      revisionInstruction: revision.revisionInstruction,
      previewUrl: revision.previewUrl,
      screenshotUrl: revision.screenshotUrl,
      generator: revision.generator,
      status: revision.status,
      error: revision.error,
      chargedCreditAmount: revision.chargedCreditAmount,
      createdAt: revision.createdAt.toISOString()
    }))
  };
}

export async function getSiteJob(id: string): Promise<SiteJobDto | null> {
  const job = await prisma.siteJob.findUnique({
    where: { id },
    include: {
      assets: true,
      styleConcepts: { orderBy: [{ generationBatch: "desc" }, { createdAt: "asc" }] },
      copyVersions: { orderBy: { versionNumber: "desc" } },
      revisions: { orderBy: { versionNumber: "desc" } }
    }
  });
  return job ? toSiteJobDto(job) : null;
}

export async function createSiteJob(input: {
  businessDescription: string;
  websitePurpose: string;
  customerName?: string;
  customerContact?: string;
  materialConsent: boolean;
  assets: Array<{
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
    url: string;
    storageType: string;
    assetRole: string | null;
  }>;
}): Promise<SiteJobDto> {
  const job = await prisma.siteJob.create({
    data: {
      businessDescription: input.businessDescription,
      websitePurpose: input.websitePurpose,
      customerName: input.customerName || null,
      customerContact: input.customerContact || null,
      materialConsent: input.materialConsent,
      status: "materials_uploaded",
      assets: { create: input.assets }
    },
    include: { assets: true, styleConcepts: true, copyVersions: true, revisions: true }
  });
  return toSiteJobDto(job);
}

export async function updateSiteJob(id: string, data: Partial<SiteJob>): Promise<SiteJobDto | null> {
  const job = await prisma.siteJob.update({
    where: { id },
    data,
    include: {
      assets: true,
      styleConcepts: true,
      copyVersions: { orderBy: { versionNumber: "desc" } },
      revisions: { orderBy: { versionNumber: "desc" } }
    }
  }).catch(() => null);
  return job ? toSiteJobDto(job) : null;
}

export async function listSiteJobs(options: { status?: string; keyword?: string } = {}) {
  const where = {
    ...(options.status && options.status !== "all" ? { status: options.status } : {}),
    ...(options.keyword
      ? {
          OR: [
            { businessDescription: { contains: options.keyword } },
            { customerName: { contains: options.keyword } },
            { customerContact: { contains: options.keyword } }
          ]
        }
      : {})
  };
  const jobs = await prisma.siteJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { assets: true, styleConcepts: true, copyVersions: true, revisions: { orderBy: { versionNumber: "desc" } } }
  });
  return jobs.map(toSiteJobDto);
}

export async function replaceMainStyle(siteJobId: string, styleId: string) {
  await prisma.styleConcept.updateMany({ where: { siteJobId }, data: { isMainStyle: false } });
  await prisma.styleConcept.update({ where: { id: styleId }, data: { isMainStyle: true } });
  return updateSiteJob(siteJobId, { selectedMainStyleId: styleId, status: "style_selected" });
}
