import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RechargeRequestRow = {
  id: string;
  accountId: string;
  email: string;
  name: string | null;
  credits: number | bigint;
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
    accountId: row.accountId,
    email: row.email,
    name: row.name,
    currentCredits: Number(row.credits),
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
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const rows = await prisma.$queryRaw<RechargeRequestRow[]>`
    SELECT
      r.id,
      r.accountId,
      a.email,
      a.name,
      a.credits,
      r.packageName,
      r.requestedCredits,
      r.amountYuan,
      r.contact,
      r.note,
      r.status,
      r.createdAt,
      r.updatedAt
    FROM CreditRechargeRequest r
    JOIN CustomerAccount a ON a.id = r.accountId
    ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.createdAt DESC
    LIMIT 50
  `;
  return NextResponse.json({ success: true, requests: rows.map(toDto) });
}
