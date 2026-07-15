import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { buildCodexWebsitePrompt } from "@/lib/site/codex-prompt-builder";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; copyVersionId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id, copyVersionId } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });
  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  const siteJobBeforeFinalize = await getSiteJob(id);
  if (!siteJobBeforeFinalize) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  if (isSiteContentEditingLocked(siteJobBeforeFinalize)) {
    return NextResponse.json({ success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE }, { status: 409 });
  }
  await prisma.copyVersion.updateMany({ where: { siteJobId: id }, data: { isFinal: false } });
  await prisma.copyVersion.update({ where: { id: copyVersionId }, data: { isFinal: true } });
  const confirmedSiteJob = await updateSiteJob(id, { finalCopyVersionId: copyVersionId, status: "copy_confirmed" });
  if (!confirmedSiteJob) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  const finalCopyVersion = confirmedSiteJob.copyVersions.find((version) => version.id === copyVersionId);
  const selectedMainStyle = confirmedSiteJob.styleConcepts.find((style) => style.id === confirmedSiteJob.selectedMainStyleId || style.isMainStyle);
  if (!finalCopyVersion) return NextResponse.json({ success: false, error: "最终文案不存在。" }, { status: 404 });
  const codexPrompt = buildCodexWebsitePrompt({
    siteJob: confirmedSiteJob,
    finalCopyVersion,
    selectedMainStyle,
    favoriteStyles: confirmedSiteJob.styleConcepts.filter((style) => style.isFavorite),
    uploadedAssets: confirmedSiteJob.assets
  });
  const siteJob = await updateSiteJob(id, { codexPrompt, status: "codex_prompt_ready" });
  return NextResponse.json({ success: true, siteJob });
}
