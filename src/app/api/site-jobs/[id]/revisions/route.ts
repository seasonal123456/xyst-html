import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import {
  consumeCreditForSiteRevision,
  ensureSiteJobAccountAccess,
  refundCustomerCredits
} from "@/lib/customers/generation-credit-service";
import { prisma } from "@/lib/db";
import { getClientIp, getPublicGenerationLimit, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { withSiteImageBudget } from "@/lib/site/site-image-budget";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";
import { publishSiteJobIfEnabled } from "@/lib/site/site-publisher";
import type { SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function useWorkerQueue() {
  return process.env.SITE_GENERATION_MODE?.trim().toLowerCase() === "worker_queue";
}

function generatorProvider() {
  return process.env.SITE_GENERATOR_PROVIDER?.trim().toLowerCase() || "codex";
}

async function generateTemplatePreview(siteJob: SiteJobDto, style: StyleConceptDto, revisionInstruction: string) {
  const { generateWebsitePreview } = await import("@/lib/site/site-preview-generator");
  const result = await generateWebsitePreview(siteJob, style, { revisionInstruction });
  return {
    previewUrl: result.previewUrl,
    screenshotUrl: result.screenshotUrl,
    generator: "template" as "template" | "codex",
    fallbackReason: undefined as string | undefined
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });

  const rate = rateLimit({
    key: `site-job:revision:${id}:${getClientIp(request)}`,
    limit: getPublicGenerationLimit(),
    windowMs: getPublicRateLimitWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "生成请求过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { revisionInstruction?: string };
  const revisionInstruction = body.revisionInstruction?.trim() || "";
  if (revisionInstruction.length < 4) {
    return NextResponse.json(
      { success: false, error: "请至少写 4 个字的修改意见，方便系统明确调整方向。" },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }
  if (revisionInstruction.length > 1200) {
    return NextResponse.json(
      { success: false, error: "修改意见请控制在 1200 字以内。" },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }

  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status, headers: rateLimitHeaders(rate) });
  }

  const siteJob = await getSiteJob(id);
  if (!siteJob) {
    return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404, headers: rateLimitHeaders(rate) });
  }
  if (!siteJob.previewUrl) {
    return NextResponse.json(
      { success: false, error: "请先生成官网初稿，再提交修改意见。" },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }

  if (siteJob.status === "standard_delivery_ready" || siteJob.status === "delivered") {
    return NextResponse.json(
      { success: false, error: "官网已进入交付阶段，最终交付结果已锁定，不能再提交修改。" },
      { status: 409, headers: rateLimitHeaders(rate) }
    );
  }

  const hasActiveRevision = siteJob.revisions.some((revision) => revision.status === "queued" || revision.status === "generating");
  if (hasActiveRevision || siteJob.status === "site_generation_queued" || siteJob.status === "site_generating") {
    return NextResponse.json(
      { success: false, error: "当前已有官网生成或修改任务正在排队/生成中，请等待完成后再提交新的修改。" },
      { status: 409, headers: rateLimitHeaders(rate) }
    );
  }

  const mainStyle =
    siteJob.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle) ||
    siteJob.styleConcepts[0];

  const previousRevisionCount = siteJob.revisions.length;
  const shouldCharge = previousRevisionCount >= 1;
  const credit = await consumeCreditForSiteRevision(id, account.id, { shouldCharge });
  if (!credit.ok) {
    return NextResponse.json({ success: false, error: credit.error }, { status: credit.status, headers: rateLimitHeaders(rate) });
  }

  const chargedCreditAmount = credit.charged ? 1 : 0;
  const versionNumber = previousRevisionCount + 1;
  let revisionId = "";

  try {
    const created = await prisma.siteRevision.create({
      data: {
        siteJobId: id,
        versionNumber,
        revisionInstruction,
        status: useWorkerQueue() ? "queued" : "generating",
        chargedCreditAmount
      }
    });
    revisionId = created.id;

    if (useWorkerQueue()) {
      const queued = await updateSiteJob(id, {
        status: "site_generation_queued",
        siteGenerationQueuedAt: new Date(),
        workerId: null,
        workerLeaseUntil: null,
        siteGenerationStartedAt: null,
        siteGenerationCompletedAt: null,
        siteZipUrl: null,
        deliveryNote: null,
        adminNote: `官网第 ${versionNumber} 次修改已进入本机 worker 队列。`
      });

      return NextResponse.json(
        {
          success: true,
          queued: true,
          siteJob: queued ? await withSiteImageBudget(queued) : null,
          chargedCreditAmount,
          remainingCredits: credit.remainingCredits
        },
        { headers: rateLimitHeaders(rate) }
      );
    }

    if (generatorProvider() !== "template") {
      throw new Error("Codex 官网修改必须通过 worker queue 执行，请设置 SITE_GENERATION_MODE=worker_queue 并启动本机 worker。");
    }

    await updateSiteJob(id, { status: "site_generating" });
    const preview = await generateTemplatePreview(
      siteJob,
      mainStyle || {
        id: "default",
        styleName: "自动官网风格",
        styleDescription: "根据客户资料和最终文案自动生成完整官网。",
        suitableFor: "企业官网",
        schemeType: null,
        layoutStyle: null,
        colorTendency: null,
        visualTechniques: [],
        emotionalDescription: null,
        imageUrl: "",
        generationBatch: 0,
        mode: "fallback",
        isFavorite: false,
        isMainStyle: false,
        createdAt: new Date().toISOString()
      },
      revisionInstruction
    );

    await prisma.siteRevision.update({
      where: { id: revisionId },
      data: {
        previewUrl: preview.previewUrl,
        screenshotUrl: preview.screenshotUrl,
        generator: preview.generator,
        status: "ready",
        error: preview.fallbackReason || null
      }
    });

    const updated = await updateSiteJob(id, {
      previewUrl: preview.previewUrl,
      screenshotUrl: preview.screenshotUrl,
      siteZipUrl: null,
      deliveryNote: null,
      status: "client_preview",
      adminNote:
        preview.generator === "codex"
          ? `官网第 ${versionNumber} 次修改已由生成引擎完成。`
          : `官网第 ${versionNumber} 次修改使用模板回退生成。${preview.fallbackReason || ""}`
    });

    const published = await publishSiteJobIfEnabled(updated);

    return NextResponse.json(
      {
        success: true,
        siteJob: published,
        chargedCreditAmount,
        remainingCredits: credit.remainingCredits
      },
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error) {
    if (chargedCreditAmount > 0) {
      await refundCustomerCredits(account.id, chargedCreditAmount).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "生成修改版官网失败。";
    if (revisionId) {
      await prisma.siteRevision.update({
        where: { id: revisionId },
        data: { status: "failed", error: message, chargedCreditAmount: 0 }
      }).catch(() => undefined);
    }
    await updateSiteJob(id, { status: "client_preview", adminNote: message }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: `生成修改版官网失败：${message}` },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
