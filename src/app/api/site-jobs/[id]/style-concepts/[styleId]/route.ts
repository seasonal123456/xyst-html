import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import { getSiteJob, replaceMainStyle } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; styleId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id, styleId } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });
  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  const body = (await request.json()) as { isFavorite?: boolean; isMainStyle?: boolean };
  const siteJob = await getSiteJob(id);
  if (!siteJob) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  if (isSiteContentEditingLocked(siteJob)) {
    return NextResponse.json({ success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE }, { status: 409 });
  }

  if (body.isMainStyle) {
    const updated = await replaceMainStyle(id, styleId);
    return NextResponse.json({ success: true, siteJob: updated });
  }

  await prisma.styleConcept.update({ where: { id: styleId }, data: { isFavorite: Boolean(body.isFavorite) } });
  return NextResponse.json({ success: true, siteJob: await getSiteJob(id) });
}
