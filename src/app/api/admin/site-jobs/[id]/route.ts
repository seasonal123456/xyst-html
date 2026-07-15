import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  const { id } = await context.params;
  const siteJob = await getSiteJob(id);
  if (!siteJob) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  return NextResponse.json({ success: true, siteJob });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json()) as { status?: string; adminNote?: string };
  const siteJob = await updateSiteJob(id, { status: body.status, adminNote: body.adminNote });
  return NextResponse.json({ success: true, siteJob });
}
