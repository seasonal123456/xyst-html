import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    icpRecordNumber: env("SITE_ICP_RECORD_NUMBER"),
    icpRecordUrl: env("SITE_ICP_RECORD_URL") || "https://beian.miit.gov.cn/",
    policeRecordNumber: env("SITE_POLICE_RECORD_NUMBER"),
    policeRecordUrl: env("SITE_POLICE_RECORD_URL")
  });
}
