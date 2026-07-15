import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getAdminJobs } from "@/lib/jobs/job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await getAdminJobs({
    status: url.searchParams.get("status") || undefined,
    keyword: url.searchParams.get("keyword") || undefined,
    page: Number(url.searchParams.get("page") || 1),
    pageSize: Number(url.searchParams.get("pageSize") || 20)
  });

  return NextResponse.json({ success: true, ...result });
}
