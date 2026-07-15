import { NextResponse } from "next/server";
import { getCurrentCustomer, loginCustomer } from "@/lib/auth/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getCurrentCustomer();
  return NextResponse.json({ success: true, authenticated: Boolean(account), account });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ success: false, error: "请输入邮箱和密码。" }, { status: 400 });
    }

    const account = await loginCustomer(body.email, body.password);
    if (!account) {
      return NextResponse.json({ success: false, error: "邮箱或密码错误，或账号已停用。" }, { status: 401 });
    }

    return NextResponse.json({ success: true, account });
  } catch {
    return NextResponse.json({ success: false, error: "登录失败，请稍后重试。" }, { status: 500 });
  }
}
