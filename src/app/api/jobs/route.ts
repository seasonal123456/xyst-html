import { NextResponse } from "next/server";
import { getRecentJobs } from "@/lib/jobs/job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = await getRecentJobs(20);
    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取生成记录失败。";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
