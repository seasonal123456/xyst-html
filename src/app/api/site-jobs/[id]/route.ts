import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { withSiteImageBudget } from "@/lib/site/site-image-budget";
import { getSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });
  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  const siteJob = await getSiteJob(id);
  if (!siteJob) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  return NextResponse.json({ success: true, siteJob: await withSiteImageBudget(siteJob) });
}
