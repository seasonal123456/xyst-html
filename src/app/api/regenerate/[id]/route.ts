import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { consumeCreditForLegacyJob, ensureLegacyJobAccountAccess } from "@/lib/customers/generation-credit-service";
import { buildPrompt } from "@/lib/prompt-builder";
import { generateImageByProvider } from "@/lib/image-providers/image-provider";
import { getJobById, updateJob } from "@/lib/jobs/job-service";
import { saveGeneratedImage } from "@/lib/storage/storage-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const isAdmin = await isAdminAuthenticated();
  const account = isAdmin ? null : await getCurrentCustomer();
  if (!isAdmin && !account) {
    return NextResponse.json({ success: false, error: "请先登录客户账号后再重新生成。" }, { status: 401 });
  }

  let job = await getJobById(id, true);

  if (!job) {
    return NextResponse.json({ success: false, error: "任务不存在。" }, { status: 404 });
  }

  try {
    if (!isAdmin && account) {
      const access = await ensureLegacyJobAccountAccess(id, account.id);
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error, job }, { status: access.status });
      }
      const credit = await consumeCreditForLegacyJob(id, account.id);
      if (!credit.ok) {
        return NextResponse.json({ success: false, error: credit.error, job }, { status: credit.status });
      }
    }

    job = (await updateJob(id, { status: "generating", error: null })) ?? job;
    const prompt = buildPrompt({
      ...job.input,
      uploadedFiles: job.uploadedFiles
    });
    const providerResult = await generateImageByProvider({
      jobId: job.id,
      prompt,
      input: job.input,
      uploadedFiles: job.uploadedFiles
    });
    const generatedImage = await saveGeneratedImage({
      jobId: job.id,
      imageBuffer: providerResult.imageBuffer,
      imageBase64: providerResult.imageBase64,
      sourceImageUrl: providerResult.imageUrl
    });

    job =
      (await updateJob(id, {
        prompt,
        generatedImageUrl: generatedImage.url,
        publicResultUrl: `/result/${id}`,
        mode: providerResult.mode,
        status: job.input.needManualRefine ? "review" : "completed",
        error: providerResult.mode === "fallback" ? "真实出图接口失败，已使用 Mock 兜底。" : null,
        regeneratedCount: (job.regeneratedCount || 0) + 1
      })) ?? job;

    return NextResponse.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重新生成失败。";
    job = (await updateJob(id, { status: "failed", error: message })) ?? job;
    return NextResponse.json({ success: false, error: message, job }, { status: 500 });
  }
}
