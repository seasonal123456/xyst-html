import { prisma } from "@/lib/db";

export const SITE_IMAGE_GENERATION_OPERATIONS = ["site_style_image", "site_content_image", "site_final_blueprint_image"] as const;
const DEFAULT_SITE_IMAGE_GENERATION_LIMIT = 9;

export type SiteImageGenerationUsage = {
  limit: number;
  used: number;
  remaining: number;
};

export type SiteImageBudgetCheck =
  | { ok: true; budget: SiteImageGenerationUsage }
  | { ok: false; budget: SiteImageGenerationUsage; error: string; status: 400 };

function configuredSiteImageLimit() {
  const configured = Number(process.env.SITE_IMAGE_GENERATION_LIMIT || DEFAULT_SITE_IMAGE_GENERATION_LIMIT);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_SITE_IMAGE_GENERATION_LIMIT;
  return Math.min(Math.floor(configured), DEFAULT_SITE_IMAGE_GENERATION_LIMIT);
}

export async function getSiteImageBudget(siteJobId: string): Promise<SiteImageGenerationUsage> {
  const aggregate = await prisma.modelUsageLog.aggregate({
    _sum: { imageCount: true },
    where: {
      siteJobId,
      status: "success",
      operation: { in: [...SITE_IMAGE_GENERATION_OPERATIONS] }
    }
  });
  const used = Math.max(0, aggregate._sum.imageCount || 0);
  const limit = configuredSiteImageLimit();

  return {
    limit,
    used,
    remaining: Math.max(0, limit - used)
  };
}

export function buildSiteImageBudgetError(budget: SiteImageGenerationUsage, requestedCount: number) {
  return `本次建站最多生成 ${budget.limit} 张图片，当前已使用 ${budget.used}/${budget.limit}，剩余 ${budget.remaining} 张，不足以继续生成 ${requestedCount} 张。`;
}

export async function checkSiteImageBudget(siteJobId: string, requestedCount: number): Promise<SiteImageBudgetCheck> {
  const budget = await getSiteImageBudget(siteJobId);
  if (budget.remaining < requestedCount) {
    return {
      ok: false,
      budget,
      error: buildSiteImageBudgetError(budget, requestedCount),
      status: 400
    };
  }

  return { ok: true, budget };
}

export async function withSiteImageBudget<T extends { id: string }>(siteJob: T | null): Promise<(T & { imageGenerationUsage: SiteImageGenerationUsage }) | null> {
  if (!siteJob) return null;
  return {
    ...siteJob,
    imageGenerationUsage: await getSiteImageBudget(siteJob.id)
  };
}
