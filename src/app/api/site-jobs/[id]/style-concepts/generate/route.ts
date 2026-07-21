import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";
import { consumeCreditForSiteJob, refundCustomerCredits } from "@/lib/customers/generation-credit-service";
import { getClientIp, getPublicGenerationLimit, getPublicRateLimitWindowMs, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { checkSiteImageBudget, withSiteImageBudget } from "@/lib/site/site-image-budget";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import { getSiteJob, updateSiteJob } from "@/lib/site/site-job-service";
import { generateStyleConcepts } from "@/lib/site/style-concept-provider";
import { styleConditionsToJson } from "@/lib/site/style-design-conditions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = await getCurrentCustomer();
  if (!account) {
    return NextResponse.json({ success: false, error: "请先登录客户账号后再生成官网。" }, { status: 401 });
  }

  const rate = rateLimit({
    key: `site-job:style:${id}:${getClientIp(request)}`,
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
  if (isSiteContentEditingLocked(siteJob)) {
    return NextResponse.json(
      { success: false, error: SITE_CONTENT_EDIT_LOCKED_MESSAGE },
      { status: 409, headers: rateLimitHeaders(rate) }
    );
  }

  const budgetCheck = await checkSiteImageBudget(id, 3);
  if (!budgetCheck.ok) {
    return NextResponse.json(
      { success: false, error: budgetCheck.error, imageGenerationUsage: budgetCheck.budget },
      { status: budgetCheck.status, headers: rateLimitHeaders(rate) }
    );
  }

  const credit = await consumeCreditForSiteJob(id, account.id);
  if (!credit.ok) {
    return NextResponse.json({ success: false, error: credit.error }, { status: credit.status, headers: rateLimitHeaders(rate) });
  }

  await updateSiteJob(id, { status: "style_generating", adminNote: null });
  const latestBatch = siteJob.styleConcepts.reduce((max, item) => Math.max(max, item.generationBatch), 0);
  const batchNumber = latestBatch + 1;
  let concepts;
  try {
    concepts = await generateStyleConcepts({ siteJob, uploadedAssets: siteJob.assets, batchNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成整站设计参考图失败。";
    if (credit.charged) {
      await refundCustomerCredits(account.id, 1).catch(() => undefined);
      await prisma.siteJob.update({
        where: { id },
        data: {
          chargedCreditAt: null,
          chargedCreditAmount: 0
        }
      }).catch(() => undefined);
    }
    const reverted = await updateSiteJob(id, {
      status: siteJob.styleConcepts.length ? "style_generated" : "materials_uploaded",
      adminNote: `风格参考图生成失败：${message}`.slice(0, 1000)
    });
    return NextResponse.json(
      {
        success: false,
        siteJob: reverted ? await withSiteImageBudget(reverted) : null,
        credits: credit.charged ? credit.remainingCredits + 1 : credit.remainingCredits,
        charged: false,
        error: `风格参考图生成失败，请稍后重试。原因：${message}`
      },
      { status: 502, headers: rateLimitHeaders(rate) }
    );
  }

  await prisma.styleConcept.createMany({
    data: concepts.map((concept) => ({
      siteJobId: id,
      styleName: concept.styleName,
      styleDescription: concept.styleDescription,
      suitableFor: concept.suitableFor,
      schemeType: concept.schemeType,
      layoutStyle: concept.layoutStyle,
      colorTendency: concept.colorTendency,
      visualTechniquesJson: styleConditionsToJson(concept.visualTechniques),
      emotionalDescription: concept.emotionalDescription,
      imageUrl: concept.imageUrl,
      generationBatch: concept.generationBatch,
      mode: concept.mode
    }))
  });

  const updated = await updateSiteJob(id, { status: "style_generated", selectedMainStyleId: null });
  return NextResponse.json(
    { success: true, siteJob: await withSiteImageBudget(updated), credits: credit.remainingCredits, charged: credit.charged },
    { headers: rateLimitHeaders(rate) }
  );
}
