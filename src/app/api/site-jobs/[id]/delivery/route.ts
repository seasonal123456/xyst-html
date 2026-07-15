import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { getClientIp, getPublicGenerationLimit, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateStandardDeliveryPackage } from "@/lib/site/standard-delivery-generator";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });
  const rate = rateLimit({
    key: `site-job:delivery:${id}:${getClientIp(request)}`,
    limit: getPublicGenerationLimit(),
    windowMs: getPublicRateLimitWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "生成请求过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  const siteJob = await getSiteJob(id);
  if (!siteJob) {
    return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404, headers: rateLimitHeaders(rate) });
  }

  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status, headers: rateLimitHeaders(rate) });

  try {
    const delivery = await generateStandardDeliveryPackage(siteJob);
    const updated = await updateSiteJob(id, {
      siteZipUrl: delivery.siteZipUrl,
      deliveryNote: delivery.deliveryNote,
      deliveryIntegrityReportJson: JSON.stringify(delivery.integrityReport),
      publishStatus: null,
      publishError: null,
      status: "standard_delivery_ready"
    });
    return NextResponse.json({ success: true, siteJob: updated }, { headers: rateLimitHeaders(rate) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "生成标准交付包失败。" },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    previewUrl?: string;
    siteZipUrl?: string;
    screenshotUrl?: string;
    deliveryNote?: string;
    status?: string;
  };
  const siteJob = await updateSiteJob(id, {
    previewUrl: body.previewUrl,
    siteZipUrl: body.siteZipUrl,
    screenshotUrl: body.screenshotUrl,
    deliveryNote: body.deliveryNote,
    status: body.status || "client_preview"
  });
  return NextResponse.json({ success: true, siteJob });
}
