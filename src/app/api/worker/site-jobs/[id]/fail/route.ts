import { NextResponse } from "next/server";
import { refundCustomerCredits } from "@/lib/customers/generation-credit-service";
import { prisma } from "@/lib/db";
import { updateSiteJob } from "@/lib/site/site-job-service";
import { requireWorkerAuth } from "@/lib/worker/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const authError = requireWorkerAuth(request);
  if (authError) return authError;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    error?: string;
    workerId?: string;
    requeue?: boolean;
    revisionId?: string;
  };
  const message = body.error?.slice(0, 1200) || "本机 worker 生成失败。";

  const revision = body.revisionId
    ? await prisma.siteRevision.findFirst({ where: { id: body.revisionId, siteJobId: id } })
    : await prisma.siteRevision.findFirst({
        where: { siteJobId: id, status: { in: ["generating", "queued"] } },
        orderBy: { versionNumber: "desc" }
      });

  if (revision) {
    const chargedCreditAmount = revision.chargedCreditAmount || 0;
    await prisma.siteRevision.update({
      where: { id: revision.id },
      data: {
        status: body.requeue ? "queued" : "failed",
        error: message,
        chargedCreditAmount: body.requeue ? chargedCreditAmount : 0
      }
    });

    if (!body.requeue && chargedCreditAmount > 0) {
      const siteJob = await prisma.siteJob.findUnique({ where: { id }, select: { ownerAccountId: true } });
      if (siteJob?.ownerAccountId) {
        await refundCustomerCredits(siteJob.ownerAccountId, chargedCreditAmount).catch(() => undefined);
      }
    }
  }

  const updated = await updateSiteJob(id, {
    status: body.requeue ? "site_generation_queued" : revision ? "client_preview" : "failed",
    workerId: null,
    workerLeaseUntil: null,
    adminNote: `${body.workerId ? `worker ${body.workerId}: ` : ""}${message}`
  });

  if (!updated) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  return NextResponse.json({ success: true, siteJob: updated });
}
