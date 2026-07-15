import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { MAX_UPLOAD_FILES } from "@/lib/constants";
import { attachLegacyJobToAccount, consumeCreditForLegacyJob } from "@/lib/customers/generation-credit-service";
import { buildPrompt } from "@/lib/prompt-builder";
import { generateImageByProvider } from "@/lib/image-providers/image-provider";
import { addJobFiles, createJob, updateJob } from "@/lib/jobs/job-service";
import { saveGeneratedImage, saveUploadedFile } from "@/lib/storage/storage-provider";
import type { GenerateJob, GenerateJobInput } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getText(formData: FormData, key: keyof GenerateJobInput): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, key: keyof GenerateJobInput): boolean {
  const value = formData.get(key);
  return value === "true" || value === "on" || value === "1";
}

function getFiles(formData: FormData): File[] {
  const values = [...formData.getAll("files"), ...formData.getAll("uploadedFiles")];
  return values.filter((value): value is File => value instanceof File && value.size > 0);
}

export async function POST(request: Request) {
  const account = await getCurrentCustomer();
  if (!account) {
    return NextResponse.json({ success: false, error: "请先登录客户账号后再生成图片。" }, { status: 401 });
  }

  let job: GenerateJob | null = null;

  try {
    const formData = await request.formData();
    const input: GenerateJobInput = {
      name: getText(formData, "name"),
      customerName: getText(formData, "customerName"),
      customerContact: getText(formData, "customerContact"),
      industry: getText(formData, "industry"),
      business: getText(formData, "business"),
      targetCustomer: getText(formData, "targetCustomer"),
      sellingPoints: getText(formData, "sellingPoints"),
      contact: getText(formData, "contact"),
      note: getText(formData, "note"),
      contentType: getText(formData, "contentType"),
      style: getText(formData, "style"),
      usagePurpose: getText(formData, "usagePurpose"),
      needManualRefine: getBoolean(formData, "needManualRefine"),
      materialConsent: getBoolean(formData, "materialConsent")
    };

    if (!input.materialConsent) {
      return NextResponse.json({ success: false, error: "请先确认素材授权。" }, { status: 400 });
    }

    if (!input.name) {
      return NextResponse.json({ success: false, error: "请填写企业 / 项目名称。" }, { status: 400 });
    }

    if (!input.contentType) {
      return NextResponse.json({ success: false, error: "请选择出图类型。" }, { status: 400 });
    }

    if (!input.style) {
      return NextResponse.json({ success: false, error: "请选择设计风格。" }, { status: 400 });
    }

    const files = getFiles(formData);

    if (files.length > MAX_UPLOAD_FILES) {
      return NextResponse.json({ success: false, error: `最多只能上传 ${MAX_UPLOAD_FILES} 张图片。` }, { status: 400 });
    }

    job = await createJob(input);
    await attachLegacyJobToAccount(job.id, account.id);
    const credit = await consumeCreditForLegacyJob(job.id, account.id);
    if (!credit.ok) {
      await updateJob(job.id, { status: "failed", error: credit.error });
      return NextResponse.json({ success: false, error: credit.error }, { status: credit.status });
    }

    job = (await updateJob(job.id, { status: "uploading" })) ?? job;

    const uploadedFiles = [];
    for (const file of files) {
      uploadedFiles.push(await saveUploadedFile(file));
    }

    job = (await addJobFiles(job.id, uploadedFiles)) ?? job;

    const prompt = buildPrompt({
      ...input,
      uploadedFiles
    });

    job =
      (await updateJob(job.id, {
        prompt,
        status: "prompt_ready"
      })) ?? job;

    job = (await updateJob(job.id, { status: "generating" })) ?? job;

    const providerResult = await generateImageByProvider({
      jobId: job.id,
      prompt,
      input,
      uploadedFiles
    });
    const generatedImage = await saveGeneratedImage({
      jobId: job.id,
      imageBuffer: providerResult.imageBuffer,
      imageBase64: providerResult.imageBase64,
      sourceImageUrl: providerResult.imageUrl
    });
    const publicResultUrl = `/result/${job.id}`;

    job =
      (await updateJob(job.id, {
        status: input.needManualRefine ? "review" : "completed",
        mode: providerResult.mode,
        generatedImageUrl: generatedImage.url,
        publicResultUrl,
        error: providerResult.mode === "fallback" ? "真实出图接口失败，已使用 Mock 兜底。" : null
      })) ?? job;

    return NextResponse.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败，请稍后重试。";

    if (job) {
      await updateJob(job.id, {
        status: "failed",
        error: message
      });
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
