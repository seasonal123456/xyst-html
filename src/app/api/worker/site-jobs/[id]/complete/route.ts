import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateSiteJob } from "@/lib/site/site-job-service";
import { publishSiteJobIfEnabled } from "@/lib/site/site-publisher";
import { requireWorkerAuth } from "@/lib/worker/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function autoPublishOnPreview() {
  return process.env.SITE_AUTO_PUBLISH_ON_PREVIEW === "true";
}

export async function POST(request: Request, context: RouteContext) {
  const authError = requireWorkerAuth(request);
  if (authError) return authError;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    previewUrl?: string;
    screenshotUrl?: string;
    generator?: string;
    fallbackReason?: string;
    workerId?: string;
    revisionId?: string;
    qualityCheck?: {
      status?: string;
      summary?: string;
      issueCount?: number;
      reportPath?: string;
    };
  };

  if (!body.previewUrl) {
    return NextResponse.json({ success: false, error: "缺少 previewUrl。" }, { status: 400 });
  }

  const revision = body.revisionId
    ? await prisma.siteRevision.findFirst({ where: { id: body.revisionId, siteJobId: id } })
    : await prisma.siteRevision.findFirst({
        where: { siteJobId: id, status: { in: ["generating", "queued"] } },
        orderBy: { versionNumber: "desc" }
      });

  if (revision) {
    await prisma.siteRevision.update({
      where: { id: revision.id },
      data: {
        previewUrl: body.previewUrl,
        screenshotUrl: body.screenshotUrl || null,
        generator: body.generator || null,
        status: "ready",
        error: body.fallbackReason || null
      }
    });
  }

  const qualityNote = body.qualityCheck?.summary
    ? ` 自检：${body.qualityCheck.summary}${body.qualityCheck.reportPath ? ` 报告：${body.qualityCheck.reportPath}` : ""}`
    : "";

  const updated = await updateSiteJob(id, {
    previewUrl: body.previewUrl,
    screenshotUrl: body.screenshotUrl || null,
    siteZipUrl: null,
    publishedUrl: null,
    publishStatus: null,
    publishError: null,
    publishedAt: null,
    deliveryNote: null,
    status: "client_preview",
    workerLeaseUntil: null,
    siteGenerationCompletedAt: new Date(),
    adminNote:
      body.generator === "codex"
        ? `本机 worker${body.workerId ? ` ${body.workerId}` : ""} 已完成官网生成。${qualityNote}`
        : body.fallbackReason
          ? `本机 worker 使用模板回退完成官网生成：${body.fallbackReason}${qualityNote}`
          : `本机 worker 已完成官网生成。${qualityNote}`
  });

  if (!updated) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  if (!autoPublishOnPreview()) {
    return NextResponse.json({ success: true, siteJob: updated });
  }
  const published = await publishSiteJobIfEnabled(updated);
  return NextResponse.json({ success: true, siteJob: published });
}
