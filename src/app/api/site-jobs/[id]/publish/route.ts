import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { getClientIp, getPublicGenerationLimit, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";
import { getNetlifyCreditUsage, normalizeNetlifySiteName, publishSiteJobIfEnabled, validateNetlifySiteName } from "@/lib/site/site-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type NetlifyCreditUsagePayload = {
  before: Awaited<ReturnType<typeof getNetlifyCreditUsage>> | null;
  after: Awaited<ReturnType<typeof getNetlifyCreditUsage>> | null;
  consumed: number | null;
  nextUsagePeriodStart?: string | null;
  note?: string;
};

function formatNetlifyUsageNote(usage: NetlifyCreditUsagePayload) {
  const after = usage.after;
  if (!after) return null;
  const consumedLabel = usage.consumed === null ? "待同步" : String(usage.consumed);
  const refreshLabel = usage.nextUsagePeriodStart || after.nextUsagePeriodStart || "Netlify Billing 页面为准";
  return `Netlify 额度：本次部署消耗 ${consumedLabel} credits；剩余 ${after.remaining}/${after.included}；已用 ${after.used}；下次刷新 ${refreshLabel}。`;
}

function isNetlifyPublishingConfigured() {
  return process.env.SITE_PUBLISH_PROVIDER?.trim().toLowerCase() === "netlify" && Boolean(process.env.NETLIFY_AUTH_TOKEN?.trim());
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { siteName?: string };

  const rate = rateLimit({
    key: `site-job:publish:${id}:${getClientIp(request)}`,
    limit: getPublicGenerationLimit(),
    windowMs: getPublicRateLimitWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "部署请求过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  if (!isNetlifyPublishingConfigured()) {
    return NextResponse.json(
      { success: false, error: "轻量化部署服务尚未配置完成，请联系管理员处理。" },
      { status: 503, headers: rateLimitHeaders(rate) }
    );
  }

  const siteJob = await getSiteJob(id);
  if (!siteJob) {
    return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404, headers: rateLimitHeaders(rate) });
  }
  if (!siteJob.previewUrl) {
    return NextResponse.json({ success: false, error: "请先生成官网预览，再发起轻量化部署。" }, { status: 400, headers: rateLimitHeaders(rate) });
  }

  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status, headers: rateLimitHeaders(rate) });

  const requestedSiteName = body.siteName ? normalizeNetlifySiteName(body.siteName) : "";
  if (siteJob.publishedUrl && siteJob.publishStatus === "published") {
    return NextResponse.json({ success: true, siteJob }, { headers: rateLimitHeaders(rate) });
  }
  if (body.siteName?.trim() && !requestedSiteName) {
    return NextResponse.json(
      { success: false, error: "域名关键词只能包含小写英文字母、数字和中横线。" },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }
  const siteNameError = requestedSiteName ? validateNetlifySiteName(requestedSiteName) : null;
  if (siteNameError) {
    return NextResponse.json({ success: false, error: siteNameError }, { status: 400, headers: rateLimitHeaders(rate) });
  }
  if (requestedSiteName && siteJob.netlifySiteId && siteJob.netlifySiteName && requestedSiteName !== siteJob.netlifySiteName) {
    return NextResponse.json(
      { success: false, error: "该任务已经绑定 Netlify 站点，暂不支持直接改域名前缀；请使用现有公开链接或联系管理员处理。" },
      { status: 409, headers: rateLimitHeaders(rate) }
    );
  }

  const usageBefore = await getNetlifyCreditUsage().catch(() => null);
  const published = await publishSiteJobIfEnabled(siteJob, { netlifySiteName: requestedSiteName || undefined });
  const usageAfter = await getNetlifyCreditUsage().catch(() => null);
  const consumed =
    usageBefore && usageAfter && Number.isFinite(usageBefore.used) && Number.isFinite(usageAfter.used)
      ? Math.max(0, usageAfter.used - usageBefore.used)
      : null;
  const netlifyCreditUsage: NetlifyCreditUsagePayload = {
    before: usageBefore,
    after: usageAfter,
    consumed,
    nextUsagePeriodStart: usageAfter?.nextUsagePeriodStart || usageBefore?.nextUsagePeriodStart || null,
    note: consumed === 0 ? "Netlify 用量统计可能存在延迟；如刚完成部署，请稍后刷新 Billing 页面复核。" : undefined
  };
  const usageNote = formatNetlifyUsageNote(netlifyCreditUsage);
  if (usageNote && published) {
    await updateSiteJob(id, {
      adminNote: [published.adminNote, usageNote, netlifyCreditUsage.note].filter(Boolean).join("\n")
    }).catch(() => null);
  }
  if (!published?.publishedUrl) {
    return NextResponse.json(
      { success: false, siteJob: published, error: published?.publishError || "轻量化部署失败，请联系管理员查看日志。" },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }

  return NextResponse.json({ success: true, siteJob: published }, { headers: rateLimitHeaders(rate) });
}
