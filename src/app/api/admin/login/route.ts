import { NextResponse } from "next/server";
import { createAdminSessionCookie, isAdminAuthenticated, verifyAdminPassword } from "@/lib/auth/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, authenticated: await isAdminAuthenticated() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };

    if (!body.password || !verifyAdminPassword(body.password)) {
      return NextResponse.json({ success: false, error: "管理员密码错误。" }, { status: 401 });
    }

    await createAdminSessionCookie();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "登录失败，请重试。" }, { status: 500 });
  }
}
