import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });

  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

  const siteJob = await getSiteJob(id);
  if (!siteJob) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  if (siteJob.status !== "site_generation_queued") {
    return NextResponse.json({ success: false, error: "当前任务不在排队状态，无法取消排队。" }, { status: 409 });
  }

  const hasFinalCopy = Boolean(siteJob.finalCopyVersionId || siteJob.copyVersions.some((version) => version.isFinal));
  const hasCopyDraft = Boolean(siteJob.copyVersions.length);
  const nextStatus = hasFinalCopy ? "copy_confirmed" : hasCopyDraft ? "copy_reviewing" : siteJob.selectedMainStyleId ? "style_selected" : "style_generated";
  const updated = await updateSiteJob(id, {
    status: nextStatus,
    workerId: null,
    workerLeaseUntil: null,
    siteGenerationQueuedAt: null,
    siteGenerationStartedAt: null,
    adminNote: "客户取消官网生成排队，任务已退回修改状态。"
  });

  return NextResponse.json({ success: true, siteJob: updated });
}
