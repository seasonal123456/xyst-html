import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { getClientIp, getPublicGenerationLimit, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateCopyVersion } from "@/lib/site/copy-generator";
import { generateMockCopyVersion } from "@/lib/site/mock-copy-generator";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import { getSiteJob, parseCopyContent, updateSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "文案生成失败");
}

function isLikelyModelTimeout(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("http 504") || lower.includes("timed out") || lower.includes("timeout") || lower.includes("default_request_timeout");
}

function publicCopyError(message: string) {
  if (isLikelyModelTimeout(message)) {
    return "真实文案模型这次响应超时，通常是模型生成超过 30 秒导致。请稍后重试；如果连续出现，请联系管理员把鑫源 AI 的模型网关超时时间调高。";
  }
  if (message.includes("API key") || message.includes("401") || message.includes("403")) {
    return "真实文案接口暂时不可用，请联系管理员检查模型接口配置。";
  }
  return "文案生成失败，请稍后重试。";
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) {
    return NextResponse.json({ success: false, error: "请先登录客户账号后再生成文案。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { revisionInstruction?: string };
  const rate = rateLimit({
    key: `site-job:copy:${id}:${getClientIp(request)}`,
    limit: getPublicGenerationLimit(),
    windowMs: getPublicRateLimitWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "生成请求过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  const siteJob = await getSiteJob(id);
  if (!siteJob) {
    return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404, headers: rateLimitHeaders(rate) });
  }

  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status, headers: rateLimitHeaders(rate) });
  }
  if (isSiteContentEditingLocked(siteJob)) {
    return NextResponse.json(
      { success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE },
      { status: 409, headers: rateLimitHeaders(rate) }
    );
  }

  const selectedMainStyle = siteJob.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle);
  if (!selectedMainStyle && siteJob.styleConcepts.length) {
    return NextResponse.json(
      { success: false, error: "请先选择一张图片风格，再根据图片架构拓写文案。" },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }

  await updateSiteJob(id, { status: siteJob.copyVersions.length ? "copy_revising" : "copy_drafting" });
  const latest = siteJob.copyVersions[0];

  try {
    const generated = await generateCopyVersion({
      siteJob,
      selectedMainStyle,
      uploadedAssets: siteJob.assets,
      previousCopyVersion: latest,
      revisionInstruction: body.revisionInstruction
    });
    const version = await prisma.copyVersion.create({
      data: {
        siteJobId: id,
        versionNumber: (latest?.versionNumber || 0) + 1,
        contentJson: JSON.stringify(generated.contentJson)
      }
    });
    await updateSiteJob(id, { status: "copy_reviewing" });
    return NextResponse.json(
      { success: true, copyVersion: { ...version, contentJson: parseCopyContent(version.contentJson) }, siteJob: await getSiteJob(id) },
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error) {
    const message = errorMessage(error);
    const canFallback = isLikelyModelTimeout(message) && process.env.COPY_TIMEOUT_FALLBACK !== "false";

    if (canFallback) {
      const fallback = await generateMockCopyVersion({
        siteJob,
        selectedMainStyle,
        uploadedAssets: siteJob.assets,
        previousCopyVersion: latest,
        revisionInstruction: body.revisionInstruction
      });
      const version = await prisma.copyVersion.create({
        data: {
          siteJobId: id,
          versionNumber: (latest?.versionNumber || 0) + 1,
          contentJson: JSON.stringify(fallback.contentJson)
        }
      });
      await updateSiteJob(id, {
        status: "copy_reviewing",
        adminNote: `真实文案接口超时，本次已自动使用文案兜底生成，客户流程未中断。\n\n原始错误：${message}`
      });
      return NextResponse.json(
        { success: true, copyVersion: { ...version, contentJson: parseCopyContent(version.contentJson) }, siteJob: await getSiteJob(id) },
        { headers: rateLimitHeaders(rate) }
      );
    }

    await updateSiteJob(id, { status: "copy_reviewing", adminNote: message });
    return NextResponse.json({ success: false, error: publicCopyError(message) }, { status: 500, headers: rateLimitHeaders(rate) });
  }
}
