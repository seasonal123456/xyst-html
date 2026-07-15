import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type RechargeRow = {
  id: string;
  accountId: string;
  requestedCredits: number | bigint;
  status: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: "未登录管理员。" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { status?: "approved" | "rejected" };
  const status = body.status === "rejected" ? "rejected" : "approved";

  const rows = await prisma.$queryRaw<RechargeRow[]>`
    SELECT id, accountId, requestedCredits, status
    FROM CreditRechargeRequest
    WHERE id = ${id}
    LIMIT 1
  `;
  const recharge = rows[0];
  if (!recharge) return NextResponse.json({ success: false, error: "充值申请不存在。" }, { status: 404 });
  if (recharge.status !== "pending") return NextResponse.json({ success: false, error: "该申请已处理。" }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE CreditRechargeRequest
      SET status = ${status}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${id} AND status = 'pending'
    `;

    if (status === "approved") {
      await tx.$executeRaw`
        UPDATE CustomerAccount
        SET credits = credits + ${Number(recharge.requestedCredits)}, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${recharge.accountId}
      `;
    }
  });

  return NextResponse.json({ success: true });
}
