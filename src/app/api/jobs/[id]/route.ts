import { NextResponse } from "next/server";
import { getJobById } from "@/lib/jobs/job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const job = await getJobById(id);

    if (!job) {
      return NextResponse.json({ success: false, error: "任务不存在。" }, { status: 404 });
    }

    return NextResponse.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取任务详情失败。";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
