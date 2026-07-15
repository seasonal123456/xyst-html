import { NextResponse } from "next/server";
import { loginCustomer } from "@/lib/auth/customer-auth";
import { createCustomerAccount, normalizeEmail } from "@/lib/customers/customer-account-service";
import { getClientIp, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signupEnabled() {
  return process.env.CUSTOMER_SIGNUP_ENABLED !== "false";
}

function initialCredits() {
  return Math.max(0, Math.floor(Number(process.env.CUSTOMER_SIGNUP_INITIAL_CREDITS || 0) || 0));
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const rate = rateLimit({
    key: `customer-register:${getClientIp(request)}`,
    limit: 8,
    windowMs: getPublicRateLimitWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "注册请求过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  if (!signupEnabled()) {
    return NextResponse.json(
      { success: false, error: "当前暂未开放自助注册，请联系管理员开通账号。" },
      { status: 403, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const email = normalizeEmail(body.email || "");
    const password = body.password || "";
    const name = body.name?.trim() || "";

    if (!validEmail(email)) {
      return NextResponse.json({ success: false, error: "请输入有效邮箱。" }, { status: 400, headers: rateLimitHeaders(rate) });
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, error: "密码至少 8 位。" }, { status: 400, headers: rateLimitHeaders(rate) });
    }

    const account = await createCustomerAccount({
      email,
      password,
      name,
      credits: initialCredits(),
      status: "active",
      note: initialCredits() > 0 ? "用户自助注册，已发放体验次数。" : "用户自助注册，待后台开通次数。"
    });

    await loginCustomer(email, password);
    return NextResponse.json({ success: true, account }, { headers: rateLimitHeaders(rate) });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "该邮箱已注册，请直接登录。" : "注册失败，请稍后重试。";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: rateLimitHeaders(rate) });
  }
}
