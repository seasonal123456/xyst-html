import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { attachSiteJobToAccount } from "@/lib/customers/generation-credit-service";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createSiteJob } from "@/lib/site/site-job-service";
import { saveSiteAssetFile, validateSiteAssetBatch } from "@/lib/site/site-file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function publicWindowMs() {
  const value = Number(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

function siteJobCreateLimit() {
  const value = Number(process.env.PUBLIC_SITE_JOB_CREATE_LIMIT);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

export async function POST(request: Request) {
  const account = await getCurrentCustomer();
  if (!account) {
    return NextResponse.json({ success: false, error: "请先登录客户账号后再创建官网任务。" }, { status: 401 });
  }

  const rate = rateLimit({
    key: `site-job:create:${getClientIp(request)}`,
    limit: siteJobCreateLimit(),
    windowMs: publicWindowMs()
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "提交过于频繁，请稍后再试。" },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const formData = await request.formData();
    const businessDescription = text(formData, "businessDescription");
    const sourceCopy = text(formData, "sourceCopy");
    const websitePurpose = text(formData, "websitePurpose") || "AI 帮我判断";
    const materialConsent = ["true", "on", "1"].includes(text(formData, "materialConsent"));
    const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    const styleReferenceFiles = formData
      .getAll("styleReferenceFiles")
      .filter((file): file is File => file instanceof File && file.size > 0);
    const qrCodeFiles = formData
      .getAll("qrCodeFiles")
      .filter((file): file is File => file instanceof File && file.size > 0);

    if (!businessDescription) {
      return NextResponse.json({ success: false, error: "请填写一句话业务描述。" }, { status: 400, headers: rateLimitHeaders(rate) });
    }

    if (!materialConsent) {
      return NextResponse.json({ success: false, error: "请先确认素材授权。" }, { status: 400, headers: rateLimitHeaders(rate) });
    }

    const batchError = validateSiteAssetBatch(files, styleReferenceFiles, qrCodeFiles);
    if (batchError) {
      return NextResponse.json({ success: false, error: batchError }, { status: 400, headers: rateLimitHeaders(rate) });
    }

    const assets: Array<{
      originalName: string;
      storedName: string;
      mimeType: string;
      size: number;
      url: string;
      storageType: string;
      assetRole: string | null;
    }> = [];

    for (const file of files) {
      const asset = await saveSiteAssetFile(file, "business_asset");
      assets.push({ ...asset, assetRole: asset.assetRole ?? null });
    }

    for (const file of styleReferenceFiles) {
      const asset = await saveSiteAssetFile(file, "style_reference");
      assets.push({ ...asset, assetRole: "style_reference" });
    }

    for (const file of qrCodeFiles) {
      const asset = await saveSiteAssetFile(file, "qr_code");
      assets.push({ ...asset, assetRole: "qr_code" });
    }

    const siteJob = await createSiteJob({
      businessDescription: sourceCopy
        ? `【业务概述】\n${businessDescription}\n\n【客户提供的原始文案】\n${sourceCopy}`
        : businessDescription,
      websitePurpose,
      customerName: text(formData, "customerName"),
      customerContact: text(formData, "customerContact"),
      materialConsent,
      assets
    });

    await attachSiteJobToAccount(siteJob.id, account.id);
    return NextResponse.json({ success: true, siteJob }, { headers: rateLimitHeaders(rate) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建官网任务失败。";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: rateLimitHeaders(rate) });
  }
}
