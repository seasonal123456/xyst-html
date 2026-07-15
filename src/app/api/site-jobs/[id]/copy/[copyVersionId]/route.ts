import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import { getSiteJob, parseCopyContent } from "@/lib/site/site-job-service";
import type { CopyModule } from "@/lib/site/site-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; copyVersionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id, copyVersionId } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });
  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  const siteJobBeforeUpdate = await getSiteJob(id);
  if (!siteJobBeforeUpdate) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  if (isSiteContentEditingLocked(siteJobBeforeUpdate)) {
    return NextResponse.json({ success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE }, { status: 409 });
  }
  const body = (await request.json()) as { contentJson?: CopyModule[] };
  await prisma.copyVersion.update({ where: { id: copyVersionId }, data: { contentJson: JSON.stringify(body.contentJson || []) } });
  const siteJob = await getSiteJob(id);
  return NextResponse.json({ success: true, siteJob });
}
