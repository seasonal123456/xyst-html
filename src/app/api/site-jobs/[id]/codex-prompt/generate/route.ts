import { NextResponse } from "next/server";
import { buildCodexWebsitePrompt } from "@/lib/site/codex-prompt-builder";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  let siteJob = await getSiteJob(id);
  if (!siteJob) return NextResponse.json({ success: false, error: "官网任务不存在。" }, { status: 404 });
  const finalCopyVersion = siteJob.copyVersions.find((version) => version.id === siteJob.finalCopyVersionId || version.isFinal);
  if (!finalCopyVersion) return NextResponse.json({ success: false, error: "请先生成并确认最终文案，再生成官网提示词。" }, { status: 400 });
  const codexPrompt = buildCodexWebsitePrompt({
    siteJob,
    finalCopyVersion,
    selectedMainStyle: siteJob.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle),
    favoriteStyles: siteJob.styleConcepts.filter((style) => style.isFavorite),
    uploadedAssets: siteJob.assets
  });
  const updatedSiteJob = await updateSiteJob(id, { codexPrompt, status: "codex_prompt_ready" });
  return NextResponse.json({ success: true, siteJob: updatedSiteJob });
}
