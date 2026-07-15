import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getNetlifyCreditUsage } from "@/lib/site/site-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  try {
    const usage = await getNetlifyCreditUsage();
    return NextResponse.json({ success: true, usage });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "读取 Netlify 额度失败。" },
      { status: 500 }
    );
  }
}
