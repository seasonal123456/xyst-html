import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getLaunchReadinessIssues } from "@/lib/launch/production-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const issues = getLaunchReadinessIssues();
  return NextResponse.json({
    success: true,
    ready: issues.every((issue) => issue.severity !== "blocker"),
    issues
  });
}
