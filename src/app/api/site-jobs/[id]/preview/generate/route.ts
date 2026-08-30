import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { getClientIp, getPublicGenerationLimit, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { withSiteImageBudget } from "@/lib/site/site-image-budget";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import { getSiteJob, replaceMainStyle, updateSiteJob } from "@/lib/site/site-job-service";
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

async function generateTemplatePreview(siteJob: SiteJobDto, style: StyleConceptDto) {
  const { generateWebsitePreview } = await import("@/lib/site/site-preview-generator");
  const result = await generateWebsitePreview(siteJob, style);
  return {
    previewUrl: result.previewUrl,
    screenshotUrl: result.screenshotUrl,
    generator: "template" as "template" | "codex" | "remote_html",
    fallbackReason: undefined as string | undefined
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) {
    return NextResponse.json({ success: false, error: "请先登录客户账号后再生成官网。" }, { status: 401 });
  }

  const rate = rateLimit({
    key: `site-job:preview:${id}:${getClientIp(request)}`,
    limit: getPublicGenerationLimit(),
    windowMs: getPublicRateLimitWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "生成请求过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { styleId?: string };
  const current = await getSiteJob(id);
  if (!current) {
    return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404, headers: rateLimitHeaders(rate) });
  }

  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status, headers: rateLimitHeaders(rate) });
  }
  if (isSiteContentEditingLocked(current)) {
    return NextResponse.json(
      { success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE, siteJob: await withSiteImageBudget(current) },
      { status: 409, headers: rateLimitHeaders(rate) }
    );
  }

  if (current.status === "site_generation_queued" || current.status === "site_generating") {
    return NextResponse.json({ success: true, queued: true, siteJob: await withSiteImageBudget(current) }, { headers: rateLimitHeaders(rate) });
  }

  if (body.styleId) {
    await replaceMainStyle(id, body.styleId);
  }

  const readyJob = await getSiteJob(id);
  const finalCopy = readyJob?.copyVersions.find((version) => version.id === readyJob.finalCopyVersionId || version.isFinal);
  if (!finalCopy) {
    return NextResponse.json(
      { success: false, error: "请先生成并确认最终文案，再生成官网初稿。", siteJob: readyJob ? await withSiteImageBudget(readyJob) : null },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }

  if (useWorkerQueue()) {
    const queued = await updateSiteJob(id, {
      status: "site_generation_queued",
      siteGenerationQueuedAt: new Date(),
      workerId: null,
      workerLeaseUntil: null,
      siteGenerationStartedAt: null,
      siteGenerationCompletedAt: null,
      previewUrl: null,
      screenshotUrl: null,
      siteZipUrl: null,
      publishedUrl: null,
      publishStatus: null,
      publishError: null,
      publishedAt: null,
      deliveryNote: null,
      adminNote: "官网生成任务已进入后台任务队列。"
    });

    return NextResponse.json({ success: true, queued: true, siteJob: await withSiteImageBudget(queued) }, { headers: rateLimitHeaders(rate) });
  }

  await updateSiteJob(id, { status: "site_generating" });

  const siteJob = await getSiteJob(id);
  const mainStyle =
    siteJob?.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle) ||
    siteJob?.styleConcepts[0];

  if (!siteJob) {
    await updateSiteJob(id, { status: "style_generated" });
    return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404, headers: rateLimitHeaders(rate) });
  }

  try {
    if (generatorProvider() !== "template") {
      throw new Error("AI 官网生成必须通过后台任务执行器运行，请设置 SITE_GENERATION_MODE=worker_queue 并启动 worker。");
    }

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
      }
    );

    const updated = await updateSiteJob(id, {
      previewUrl: preview.previewUrl,
      screenshotUrl: preview.screenshotUrl,
      status: "client_preview",
      adminNote:
        preview.generator === "codex" || preview.generator === "remote_html"
          ? "官网由生成引擎生成。"
          : preview.fallbackReason
            ? `生成引擎失败，已回退模板生成：${preview.fallbackReason}`
            : "官网由模板生成器生成。"
    });

    const published = await publishSiteJobIfEnabled(updated);
    return NextResponse.json({ success: true, siteJob: await withSiteImageBudget(published) }, { headers: rateLimitHeaders(rate) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成官网预览失败";
    const updated = await updateSiteJob(id, { status: "failed", adminNote: message });
    return NextResponse.json(
      { success: false, error: `生成官网预览失败：${message}`, siteJob: await withSiteImageBudget(updated) },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
