import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { createCustomerAccount, listCustomerAccounts } from "@/lib/customers/customer-account-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }
  return NextResponse.json({ success: true, accounts: await listCustomerAccounts() });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
      credits?: number;
      status?: "active" | "disabled";
      note?: string;
    };
    if (!body.email || !body.password) {
      return NextResponse.json({ success: false, error: "请填写邮箱和初始密码。" }, { status: 400 });
    }

    const account = await createCustomerAccount({
      email: body.email,
      password: body.password,
      name: body.name,
      credits: body.credits,
      status: body.status,
      note: body.note
    });
    return NextResponse.json({ success: true, account });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "该邮箱已存在。" : "创建客户账号失败。";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
