import { createHmac, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";

export const dynamic = "force-dynamic";

const ISSUER = "ai-site";
const AUDIENCE = "project-card-tool";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildTicket(payload: Record<string, unknown>, secret: string) {
  const payloadPart = base64url(JSON.stringify(payload));
  const signaturePart = base64url(createHmac("sha256", secret).update(payloadPart).digest());
  return `${payloadPart}.${signaturePart}`;
}

export async function POST() {
  const account = await getCurrentCustomer();
  if (!account) {
    return NextResponse.json({ success: false, error: "请先登录会员账号。" }, { status: 401 });
  }

  const secret = env("PROJECT_CARD_SSO_SECRET");
  const toolUrl = env("PROJECT_CARD_TOOL_URL") || "http://127.0.0.1:4173/";
  if (!secret) {
    return NextResponse.json({ success: false, error: "项目推荐卡工具 SSO 尚未配置。" }, { status: 503 });
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(60, Math.min(900, Number(env("PROJECT_CARD_SSO_TTL_SECONDS") || 300) || 300));
  const entitlementDays = Math.max(1, Math.min(366, Number(env("PROJECT_CARD_ENTITLEMENT_DAYS") || 30) || 30));
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    jti: randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
    customer: {
      id: account.id,
      email: account.email,
      name: account.name,
      status: account.status
    },
    company: {
      id: `ai-site-account-${account.id}`,
      name: account.name ? `${account.name}权益` : "官网会员权益"
    },
    entitlement: {
      planType: "time_unlimited",
      creditsRemaining: 0,
      validUntil: addDaysIso(entitlementDays)
    }
  };

  const ticket = buildTicket(payload, secret);
  const url = new URL(toolUrl);
  url.searchParams.set("sso_ticket", ticket);

  return NextResponse.json({ success: true, url: url.toString() });
}
