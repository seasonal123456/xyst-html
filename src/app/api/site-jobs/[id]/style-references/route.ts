import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { ensureSiteJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { prisma } from "@/lib/db";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";
import { getSiteUploadLimits, saveSiteAssetFile, validateSiteAssetBatch } from "@/lib/site/site-file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function boolValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && ["true", "on", "1"].includes(value);
}

async function requireJobAccess(id: string) {
  const account = await getCurrentCustomer();
  if (!account) {
    return { error: NextResponse.json({ success: false, error: "请先登录客户账号。" }, { status: 401 }) };
  }

  const access = await ensureSiteJobAccountAccess(id, account.id);
  if (!access.ok) {
    return { error: NextResponse.json({ success: false, error: access.error }, { status: access.status }) };
  }

  const siteJob = await getSiteJob(id);
  if (!siteJob) {
    return { error: NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 }) };
  }

  return { siteJob };
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (access.error) return access.error;
  if (isSiteContentEditingLocked(access.siteJob)) {
    return NextResponse.json({ success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE }, { status: 409 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("styleReferenceFiles")
    .filter((file): file is File => file instanceof File && file.size > 0);
  const preferUploadedStyleReference = boolValue(formData.get("preferUploadedStyleReference"));
  const existingCount = access.siteJob.assets.filter((asset) => asset.assetRole === "style_reference").length;
  const limits = getSiteUploadLimits();

  if (existingCount + files.length > limits.maxStyleReferenceFiles) {
    return NextResponse.json({ success: false, error: `最多上传 ${limits.maxStyleReferenceFiles} 个参考官网截图。` }, { status: 400 });
  }

  const batchError = validateSiteAssetBatch([], files);
  if (batchError) {
    return NextResponse.json({ success: false, error: batchError }, { status: 400 });
  }

  if (preferUploadedStyleReference && existingCount + files.length === 0) {
    return NextResponse.json({ success: false, error: "请先上传希望复刻的官网截图，再勾选使用上传截图作为最终设计依据；若无参考截图，请不要勾选此项。" }, { status: 400 });
  }

  for (const file of files) {
    const asset = await saveSiteAssetFile(file, "style_reference");
    await prisma.siteAsset.create({
      data: {
        siteJobId: id,
        originalName: asset.originalName,
        storedName: asset.storedName,
        mimeType: asset.mimeType,
        size: asset.size,
        url: asset.url,
        storageType: asset.storageType,
        assetRole: "style_reference"
      }
    });
  }

  const updated = await updateSiteJob(id, { preferUploadedStyleReference });
  return NextResponse.json({ success: true, siteJob: updated || (await getSiteJob(id)) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (access.error) return access.error;
  if (isSiteContentEditingLocked(access.siteJob)) {
    return NextResponse.json({ success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { preferUploadedStyleReference?: boolean };
  const preferUploadedStyleReference = Boolean(body.preferUploadedStyleReference);
  const existingCount = access.siteJob.assets.filter((asset) => asset.assetRole === "style_reference").length;

  if (preferUploadedStyleReference && existingCount === 0) {
    return NextResponse.json({ success: false, error: "请先上传希望复刻的官网截图，再勾选使用上传截图作为最终设计依据；若无参考截图，请不要勾选此项。" }, { status: 400 });
  }

  const updated = await updateSiteJob(id, { preferUploadedStyleReference });
  return NextResponse.json({ success: true, siteJob: updated || (await getSiteJob(id)) });
}
