import { elapsedMs, extractUsageFromResponse, recordModelUsage } from "@/lib/model-usage";
import type { CopyGeneratorInput, GeneratedCopyVersion } from "@/lib/site/copy-types";
import { generateMockCopyVersion } from "@/lib/site/mock-copy-generator";
import type { CopyModule } from "@/lib/site/site-types";
import { buildEnhancedDeploymentPlan } from "@/lib/site/enhanced-deployment-plan";
import { buildLayoutTextBudgetPrompt } from "@/lib/site/layout-text-budget";
import { styleConditionSummary } from "@/lib/site/style-design-conditions";

type CopyConfig = {
  baseUrl: string;
  endpoint: string;
  apiKey: string;
  model: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: unknown;
};

function getCopyConfig(): CopyConfig | null {
  const apiKey = process.env.COPY_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    baseUrl: process.env.COPY_API_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com",
    endpoint: process.env.COPY_API_ENDPOINT?.trim() || "/v1/chat/completions",
    apiKey,
    model: process.env.COPY_MODEL?.trim() || process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.5"
  };
}

function buildUrl(baseUrl: string, endpoint: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const requestPath = endpoint.replace(/^\/+/, "");
  if (base.endsWith("/v1") && requestPath.startsWith("v1/")) {
    return `${base}/${requestPath.slice(3)}`;
  }
  return `${base}/${requestPath}`;
}

function previousDraft(input: CopyGeneratorInput) {
  return input.previousCopyVersion?.contentJson
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((module) => `${module.moduleName}\n${module.content}`)
    .join("\n\n");
}

function buildPrompt(input: CopyGeneratorInput) {
  const locked = input.previousCopyVersion?.contentJson.flatMap((module) => module.lockedRanges.map((range) => range.text).filter(Boolean)) || [];
  const rejected = input.previousCopyVersion?.contentJson.flatMap((module) => module.rejectedRanges.map((range) => range.text).filter(Boolean)) || [];
  const edited = input.previousCopyVersion?.contentJson.filter((module) => module.manualEdited).map((module) => module.content).join("\n\n") || "";
  const assets = input.uploadedAssets.map((asset) => asset.originalName).join("、") || "暂无";
  const enhancedDeploymentPlan = buildEnhancedDeploymentPlan(input.siteJob, input.selectedMainStyle);
  const layoutTextBudget = buildLayoutTextBudgetPrompt();

  return `请根据客户提供的有限资料，整理并拓写一篇可以直接交给客户审阅的官网文案稿。

重要要求：
1. 不要输出固定模块表格，不要要求客户逐项填写。
2. 输出应是一篇已经整理好逻辑顺序、读起来顺畅的官网文案，可直接放进一个大文本框让客户修改。
3. 可以使用小标题、短段落和项目符号，但不要编造客户未提供的资质、数据、年限、案例、地址或承诺。
4. 内容要像真实官网可直接使用的文案，不要写成内部说明、建议或系统提示。
5. 如果有上一版、锁定内容或客户不满意内容，请优先遵守这些修改信号。
6. 如果存在内部视觉条件，请让文案结构、标题层级、板块顺序和 CTA 节奏匹配该官网方向，但不要把“整站方案类型、版式风格、视觉手法”等内部标签写给客户看。
7. 本流程是“先选图片风格，再拓展文案”。请把选中的官网风格图当作页面架构蓝图：先判断它适合怎样的首屏主张、分屏方式、板块顺序、信息密度、图片/作品展示节奏、线条/分隔方式、联系卡片/电话/微信入口和咨询转化路径，再把客户资料拓展成与该架构匹配的文案。
8. 文案不要脱离视觉架构单独发挥。每个主要段落都应能自然落入官网页面：首屏、业务简介、课程/服务/产品板块、案例/作品/项目展示、优势说明、咨询 CTA、联系方式。
9. 权重顺序必须是：已选风格预览图和其中的结构/板块 > 客户上传资料 > 客户已有文案 > 行业类型 > 通用官网结构经验。行业类型只用于避免内容跑偏，不得把文案拉回通用行业模板。
10. 如果预览图暗示了特定板块数量、图文比例或字数密度，请按这些视觉槽位控制每段长度；不要写出无法放进预览图结构的大段说明。
11. 当前 MVP 阶段不要写表单、输入框、预约组件、报名表、会员、登录或客户专区文案。报名、预约、咨询、报价、领取方案等诉求统一写成“电话咨询、微信咨询、添加微信预约、联系某某了解”等直连动作。
12. 标题、按钮、标签、卡片和浮层文案必须遵守中文槽位字数预算。不要把长句写进小卡片标题、按钮或浮层。
13. 如果客户原始文案太长，请先提炼成短标题，再把解释内容放进普通正文段落。

客户业务资料：
${input.siteJob.businessDescription}

网站用途：
${input.siteJob.websitePurpose}

联系人/名称：
${input.siteJob.customerName || "未填写"}

联系方式：
${input.siteJob.customerContact || "未填写"}

选中的官网风格：
${input.selectedMainStyle?.styleName || "未选择"}

风格说明：
${input.selectedMainStyle?.emotionalDescription || input.selectedMainStyle?.styleDescription || "暂无"}

风格图地址：
${input.selectedMainStyle?.imageUrl || "暂无"}

内部视觉条件：
${styleConditionSummary(input.selectedMainStyle)}

增强部署规划：
${enhancedDeploymentPlan}

${layoutTextBudget}

上传素材文件名：
${assets}

上一版或客户编辑后的内容：
${edited || previousDraft(input) || "暂无"}

必须原样保留的内容：
${JSON.stringify(locked, null, 2)}

客户标记不满意、需要重写的内容：
${JSON.stringify(rejected, null, 2)}

输出必须是 JSON，不要 Markdown 代码块。格式：
{
  "draft": "完整官网文案稿"
}`;
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Copy API did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function normalizeDraft(value: unknown): CopyModule[] | null {
  if (typeof value !== "object" || value === null || !("draft" in value)) return null;
  const draft = (value as { draft?: unknown }).draft;
  if (typeof draft !== "string" || !draft.trim()) return null;

  return [
    {
      moduleId: "full_copy",
      moduleName: "官网文案稿",
      content: draft.trim(),
      order: 1,
      lockedRanges: [],
      rejectedRanges: [],
      manualEdited: false
    }
  ];
}

export async function generateRealCopyVersion(input: CopyGeneratorInput): Promise<GeneratedCopyVersion> {
  const config = getCopyConfig();
  if (!config) throw new Error("真实文案接口未配置 API key。");

  const endpoint = buildUrl(config.baseUrl, config.endpoint);
  const systemContent = "你是资深官网策划和中文商业文案编辑。你只输出符合要求的 JSON。";
  const userContent = `${buildPrompt(input)}\n\n客户对本次修改的整体想法：\n${input.revisionInstruction?.trim() || "无"}`;
  const startedAt = Date.now();

  const metadata = {
    hasPreviousCopy: Boolean(input.previousCopyVersion),
    uploadedAssetCount: input.uploadedAssets.length,
    hasRevisionInstruction: Boolean(input.revisionInstruction?.trim())
  };
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: systemContent
          },
          {
            role: "user",
            content: userContent
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      })
    });
  } catch (error) {
    await recordModelUsage({
      provider: "openai",
      operation: "site_copy_generation",
      model: config.model,
      endpoint,
      siteJobId: input.siteJob.id,
      status: "error",
      promptCharacters: systemContent.length + userContent.length,
      durationMs: elapsedMs(startedAt),
      metadata,
      error
    });
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    await recordModelUsage({
      provider: "openai",
      operation: "site_copy_generation",
      model: config.model,
      endpoint,
      siteJobId: input.siteJob.id,
      status: "error",
      promptCharacters: systemContent.length + userContent.length,
      durationMs: elapsedMs(startedAt),
      metadata,
      error: `HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`
    });
    throw new Error(`真实文案接口调用失败：HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }

  const json = (await response.json()) as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content;
  await recordModelUsage({
    provider: "openai",
    operation: "site_copy_generation",
    model: config.model,
    endpoint,
    siteJobId: input.siteJob.id,
    status: content ? "success" : "error",
    promptCharacters: systemContent.length + userContent.length,
    responseCharacters: content?.length || JSON.stringify(json).length,
    durationMs: elapsedMs(startedAt),
    metadata,
    error: content ? undefined : "Response did not include message content.",
    ...extractUsageFromResponse(json)
  });

  if (!content) throw new Error("真实文案接口没有返回内容。");

  const modules = normalizeDraft(parseJsonContent(content));
  if (!modules) {
    return generateMockCopyVersion(input);
  }

  return { contentJson: modules };
}
