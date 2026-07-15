import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { listSiteJobs } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  const url = new URL(request.url);
  const siteJobs = await listSiteJobs({
    status: url.searchParams.get("status") || undefined,
    keyword: url.searchParams.get("keyword") || undefined
  });
  return NextResponse.json({ success: true, siteJobs });
}
