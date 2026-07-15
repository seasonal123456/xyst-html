import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSiteJob } from "@/lib/site/site-job-service";
import { requireWorkerAuth } from "@/lib/worker/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimRow = {
  id: string;
};

export async function POST(request: Request) {
  const authError = requireWorkerAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as {
    workerId?: string;
    leaseSeconds?: number;
  };
  const workerId = body.workerId?.trim() || "local-site-worker";
  const leaseSeconds = Math.min(3600, Math.max(60, Number(body.leaseSeconds || 900)));
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000);

  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimRow[]>`
      SELECT id
      FROM SiteJob
      WHERE status = 'site_generation_queued'
        OR (
          status = 'site_generating'
          AND workerLeaseUntil IS NOT NULL
          AND workerLeaseUntil < unixepoch('now') * 1000
        )
      ORDER BY COALESCE(siteGenerationQueuedAt, updatedAt) ASC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;

    await tx.$executeRaw`
      UPDATE SiteJob
      SET
        status = 'site_generating',
        workerId = ${workerId},
        workerLeaseUntil = ${leaseUntil},
        siteGenerationStartedAt = COALESCE(siteGenerationStartedAt, CURRENT_TIMESTAMP),
        siteGenerationAttemptCount = siteGenerationAttemptCount + 1,
        updatedAt = CURRENT_TIMESTAMP,
        adminNote = '本机 worker 已领取官网生成任务。'
      WHERE id = ${row.id}
    `;

    await tx.$executeRaw`
      UPDATE SiteRevision
      SET status = 'generating', error = NULL
      WHERE id = (
        SELECT id
        FROM SiteRevision
        WHERE siteJobId = ${row.id}
          AND status = 'queued'
        ORDER BY versionNumber DESC
        LIMIT 1
      )
    `;

    return row.id;
  });

  if (!claimed) {
    return NextResponse.json({ success: true, claimed: false });
  }

  const siteJob = await getSiteJob(claimed);
  const mainStyle =
    siteJob?.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle) ||
    siteJob?.styleConcepts[0] ||
    null;

  return NextResponse.json({ success: true, claimed: true, siteJob, mainStyle });
}
