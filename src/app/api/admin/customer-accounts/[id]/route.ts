import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { updateCustomerAccount } from "@/lib/customers/customer-account-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string | null;
      credits?: number;
      status?: "active" | "disabled";
      note?: string | null;
    };
    const account = await updateCustomerAccount({ id, ...body });
    if (!account) return NextResponse.json({ success: false, error: "客户账号不存在。" }, { status: 404 });
    return NextResponse.json({ success: true, account });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "该邮箱已被占用。" : "更新客户账号失败。";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
