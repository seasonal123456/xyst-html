import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getSiteJob } from "@/lib/site/site-job-service";
import { publishSiteJobIfEnabled } from "@/lib/site/site-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const { id } = await context.params;
  const siteJob = await getSiteJob(id);
  if (!siteJob) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  if (!siteJob.previewUrl) return NextResponse.json({ success: false, error: "请先生成官网预览。" }, { status: 400 });

  const published = await publishSiteJobIfEnabled(siteJob);
  return NextResponse.json({ success: true, siteJob: published });
}
