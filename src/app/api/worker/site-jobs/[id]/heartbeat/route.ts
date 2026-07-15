import { NextResponse } from "next/server";
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
  const body = (await request.json().catch(() => ({}))) as { leaseSeconds?: number; stage?: string; workerId?: string };
  const leaseSeconds = Math.min(3600, Math.max(60, Number(body.leaseSeconds || 900)));
  const stage = body.stage?.trim().slice(0, 80) || "官网生成中";
  const current = await prisma.siteJob.findUnique({ where: { id }, select: { siteGenerationStartedAt: true } });
  const updated = await updateSiteJob(id, {
    status: "site_generating",
    workerId: body.workerId?.trim() || "local-site-worker",
    workerLeaseUntil: new Date(Date.now() + leaseSeconds * 1000),
    siteGenerationStartedAt: current?.siteGenerationStartedAt || new Date(),
    adminNote: `${body.workerId ? `本机 worker ${body.workerId}` : "本机 worker"}：${stage}。最后心跳 ${new Date().toLocaleString("zh-CN", { hour12: false })}`
  });

  if (!updated) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  return NextResponse.json({ success: true });
}
