import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { prisma } from "@/lib/db";
import { getClientIp, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const packages = [
  { packageName: "单次建站包", requestedCredits: 1, amountYuan: 399 }
];

type RechargeRequestRow = {
  id: string;
  packageName: string;
  requestedCredits: number | bigint;
  amountYuan: number | bigint;
  contact: string | null;
  note: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function toDto(row: RechargeRequestRow) {
  return {
    id: row.id,
    packageName: row.packageName,
    requestedCredits: Number(row.requestedCredits),
    amountYuan: Number(row.amountYuan),
    contact: row.contact,
    note: row.note,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

export async function GET() {
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录会员账号。" }, { status: 401 });

  const rows = await prisma.$queryRaw<RechargeRequestRow[]>`
    SELECT id, packageName, requestedCredits, amountYuan, contact, note, status, createdAt, updatedAt
    FROM CreditRechargeRequest
    WHERE accountId = ${account.id}
    ORDER BY createdAt DESC
    LIMIT 20
  `;
  return NextResponse.json({ success: true, requests: rows.map(toDto) });
}

export async function POST(request: Request) {
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录会员账号。" }, { status: 401 });

  const rate = rateLimit({
    key: `account-recharge:${account.id}:${getClientIp(request)}`,
    limit: 10,
    windowMs: getPublicRateLimitWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "充值申请提交过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    packageName?: string;
    contact?: string;
    note?: string;
  };
  const selected = packages.find((item) => item.packageName === body.packageName);
  if (!selected) {
    return NextResponse.json({ success: false, error: "请选择有效的充值套餐。" }, { status: 400, headers: rateLimitHeaders(rate) });
  }

  const duplicate = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM CreditRechargeRequest
    WHERE accountId = ${account.id} AND status = 'pending'
    LIMIT 1
  `;
  if (duplicate[0]) {
    return NextResponse.json(
      { success: false, error: "你已有待处理的充值申请，请等待管理员处理后再提交。" },
      { status: 409, headers: rateLimitHeaders(rate) }
    );
  }

  const submittedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const auditNote = [
    `系统记录：账号 ${account.email} 于 ${submittedAt} 提交充值申请，申请金额 ¥${selected.amountYuan}，申请次数 ${selected.requestedCredits} 次。`,
    body.note?.trim() ? `客户备注：${body.note.trim()}` : "客户备注：未填写。"
  ].join("\n");

  await prisma.$executeRaw`
    INSERT INTO CreditRechargeRequest (id, accountId, packageName, requestedCredits, amountYuan, contact, note, status, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${account.id}, ${selected.packageName}, ${selected.requestedCredits}, ${selected.amountYuan}, ${body.contact?.trim() || null}, ${auditNote}, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;

  return NextResponse.json({ success: true }, { headers: rateLimitHeaders(rate) });
}
