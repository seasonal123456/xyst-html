import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getJobById, updateJob } from "@/lib/jobs/job-service";
import type { JobStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await getJobById(id, true);

  if (!job) {
    return NextResponse.json({ success: false, error: "任务不存在。" }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: JobStatus;
    adminNote?: string;
    generatedImageUrl?: string;
    publicResultUrl?: string;
  };
  const job = await updateJob(id, {
    status: body.status,
    adminNote: body.adminNote,
    generatedImageUrl: body.generatedImageUrl,
    publicResultUrl: body.publicResultUrl
  });

  if (!job) {
    return NextResponse.json({ success: false, error: "任务不存在。" }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}
