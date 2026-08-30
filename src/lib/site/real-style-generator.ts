import { saveGeneratedImage as saveGeneratedImageFile } from "@/lib/storage/storage-provider";
import { elapsedMs, extractUsageFromResponse, recordModelUsage } from "@/lib/model-usage";
import { buildDesignPresetPrompt } from "@/lib/site/design-ui-library";
import { buildSiteImageBudgetError, getSiteImageBudget } from "@/lib/site/site-image-budget";
import type { GeneratedStyleConcept, StyleConceptInput } from "@/lib/site/style-concept-types";
import { createRandomStyleDesignConditions, type StyleDesignConditions } from "@/lib/site/style-design-conditions";

type StyleDirection = StyleDesignConditions & {
  styleName: string;
  styleDescription: string;
  suitableFor: string;
  visualPrompt: string;
};

type ImageApiDataItem = {
  b64_json?: string;
  base64?: string;
  url?: string;
};

type ImageApiResponse = {
  data?: ImageApiDataItem[];
  imageBase64?: string;
  image_base64?: string;
  imageUrl?: string;
  image_url?: string;
  url?: string;
};

type StyleImageConfig = {
  baseUrl: string;
  endpoint: string;
  apiKey: string;
  model: string;
  size: string;
  quality: string;
};

type StyleConceptGenerationFailure = {
  index: number;
  styleName: string;
  error: unknown;
};

const imagePromptSafetyReplacements: Array<[RegExp, string]> = [
  [/性感|情色|色情|成人内容|成人用品|情趣|裸露|裸照|私密照|私房照|擦边/gi, "专业"],
  [/胸部|丰胸|隆胸|乳房|私处|生殖|下体/gi, "形象"],
  [/小姐姐|美女|辣妹|网红美女/gi, "人物"],
  [/约炮|陪聊|陪玩|陪酒|夜店|会所/gi, "商务服务"],
  [/写真|私房摄影|人体摄影/gi, "人像摄影"],
  [/医美|整形|隆鼻|瘦脸|脱毛/gi, "健康美容服务"]
];

function getStyleImageConfig(): StyleImageConfig | null {
  const apiKey = process.env.STYLE_IMAGE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    baseUrl: process.env.STYLE_IMAGE_API_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com",
    endpoint: process.env.STYLE_IMAGE_API_ENDPOINT?.trim() || "/v1/images/generations",
    apiKey,
    model: process.env.STYLE_IMAGE_MODEL?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2",
    size: process.env.STYLE_IMAGE_SIZE?.trim() || "1536x1024",
    quality: process.env.STYLE_IMAGE_QUALITY?.trim() || "medium"
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

function suitableForScheme(schemeType: string) {
  if (schemeType === "品牌叙事型整站方案") return "重视品牌形象、专业可信感、服务说明和长期信任建立的官网";
  if (schemeType === "项目展示型整站方案") return "需要展示项目、案例、产品、空间、服务成果或业务能力的企业官网";
  return "需要突出咨询入口、转化路径、服务卖点和行动按钮的营销型官网";
}

function schemeExecutionPrompt(schemeType: string) {
  if (schemeType === "品牌叙事型整站方案") {
    return "从强首屏延展到品牌故事、服务价值、能力证明、案例/项目和联系 CTA，整体要有可信、完整、可持续经营的企业气质。";
  }
  if (schemeType === "项目展示型整站方案") {
    return "首屏强调项目/业务价值，下方重点展示项目卡片、案例图片区、能力证明、流程说明和咨询转化，资料感要转化成成交感。";
  }
  return "首屏要明确痛点、结果和行动按钮，下方围绕痛点、方案、优势、流程、FAQ、联系转化递进，CTA 要自然但醒目。";
}

function visualBlueprintPrompt() {
  return [
    "这张风格图必须同时表达一份可执行的设计蓝图，而不是只表达氛围。",
    "请让画面清晰呈现：首屏图片比例、标题位置、导航密度、下方板块顺序、图片槽位、线条/分隔方式、CTA、联系人卡片、电话/微信入口和二维码/微信卡片可能出现的位置。",
    "后续最终官网会高度模仿这张预览图的构图、线条、板块节奏、配图方式和留白关系，再把客户上传图片与文案替换进去。",
    "行业类型只用于内容合理性纠偏，不得把画面拉回通用行业模板；如果预览图有独特结构，最终官网应优先继承预览图结构。",
    "当客户行业有真实空间、产品、项目、门店、课堂、作品、工厂、园区、餐饮、酒店、医美等可视化场景时，至少一个方案可以采用全宽沉浸式横屏首屏：一张完整横屏主图铺满首屏，文字覆盖在左侧或左中区域，少量数据/联系浮层融入画面，底部可有横向信息条。",
    "全宽横屏首屏必须像真实品牌官网首页，不像 UI 展板；禁止假后台、假浏览器、假 SaaS 面板、截图拼贴和卡片套卡片。"
  ].join("\n");
}

function sanitizeImagePromptText(value: string, fallback = "企业官网") {
  const normalized = value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  const safe = imagePromptSafetyReplacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), normalized);
  return safe.slice(0, 900) || fallback;
}

function directionsFor(input: StyleConceptInput): StyleDirection[] {
  const business = sanitizeImagePromptText(input.siteJob.businessDescription, "企业官网业务");
  const websitePurpose = sanitizeImagePromptText(input.siteJob.websitePurpose, "企业官网");
  const styleReferences = input.uploadedAssets.filter((asset) => asset.assetRole === "style_reference");
  const assetHints =
    input.uploadedAssets
      .filter((asset) => asset.assetRole !== "style_reference" && asset.assetRole !== "qr_code")
      .slice(0, 8)
      .map((asset) => sanitizeImagePromptText(asset.originalName, "业务图片"))
      .join("、") || "暂无业务图片素材，可使用高级占位视觉";
  const referenceHint = styleReferences.length
    ? `客户上传了 ${styleReferences.length} 张参考官网风格截图：${styleReferences.map((asset) => sanitizeImagePromptText(asset.originalName, "参考截图")).join("、")}。需要参考这些截图的配色、字体气质、版式节奏、按钮风格、留白、图文关系和整体审美，但不要照抄具体品牌、logo、商标、人物或原网站文案。`
    : "客户未上传参考官网风格图，请根据业务生成差异明显的视觉方向。";

  return createRandomStyleDesignConditions(3).map((conditions, index) => ({
    ...conditions,
    styleName: `方案 ${index + 1}`,
    styleDescription: [
      conditions.emotionalDescription,
      "设计蓝图原则：最终官网应高度继承本预览图的首屏构图、线条、图片比例、板块顺序、留白关系和 CTA 位置，再用客户上传图片与最终文案替换其中内容。行业类型只做内容合理性纠偏，不得覆盖预览图结构。"
    ].join("\n\n"),
    suitableFor: suitableForScheme(conditions.schemeType),
    visualPrompt: [
      `内部随机设计条件 ${index + 1}：`,
      `整站方案类型：${conditions.schemeType}`,
      `版式风格：${conditions.layoutStyle}`,
      `色彩倾向：${conditions.colorTendency}`,
      `视觉手法：${conditions.visualTechniques.join("、")}`,
      `用户可见描述：${conditions.emotionalDescription}`,
      "",
      "这些条件必须真实影响画面构图、板块衔接、色彩关系、图片处理方式和按钮/CTA 节奏，不要只把条件写成画面文字。",
      schemeExecutionPrompt(conditions.schemeType),
      "版式风格需要体现在网格、留白、图文关系、标题尺度和组件形态上；色彩倾向需要体现在整站主背景、强调色、按钮、渐变和插图/照片调色上。",
      "视觉手法必须在首屏和下方板块中至少多处出现，让三张方案之间有明显差异。",
      visualBlueprintPrompt(),
      `业务：${business}`,
      `网站用途：${websitePurpose}`,
      `素材线索：${assetHints}`,
      `参考要求：${referenceHint}`
    ].join("\n")
  }));
}

function buildImagePrompt(direction: StyleDirection, input: StyleConceptInput) {
  const designPresetPrompt = buildDesignPresetPrompt();
  const websitePurpose = sanitizeImagePromptText(input.siteJob.websitePurpose, "企业官网");
  return [
    "生成一张中文官网“整站设计参考图”，不是只画英雄首屏，不是单张 Banner，不是插画海报。",
    "画面比例 3:2，像专业网页设计方案展示图，可以被前端工程师按 HTML/CSS 实现。",
    "必须在同一张图里展示：顶部导航、Hero 首屏、至少 4 个下方内容板块的设计参考，例如业务简介、服务内容、优势、案例/项目、流程、FAQ、联系 CTA。",
    "下方板块不能只是整齐长方形堆叠。需要体现板块之间的设计关系：交错布局、跨区浮层、渐变衔接、斜切/波形/弧形分隔、图片抠像、局部遮罩、视觉元素贯穿等。",
    "加强客户个性化：根据业务行业选择视觉符号、图像气质、文案层级和板块顺序，不要输出通用 SaaS 模板。",
    "文字要少而清楚，使用短中文标题和少量说明，避免密密麻麻的小字。",
    "整体要高级、真实、可落地、有官网成品感。客户看到后应能理解这不只是首屏，而是未来官网的整体风格和下方板块走向。",
    "这张图会成为最终官网的第一设计依据。请把它画成可被高度模仿的整站蓝图：结构、线条、图片槽位、板块顺序、首屏沉浸感和 CTA 位置都要明确。",
    "如果业务适合，请优先尝试全宽沉浸式横屏 hero：背景/主体图横跨整屏，左侧标题和按钮叠在图上，右侧有少量轻量数据浮层，底部有横向信息条；整体像正式官网首屏。",
    "不要让行业模板决定最终结构。行业只负责避免内容跑偏；真正决定页面美感和结构的是本张风格预览图。",
    "画面只呈现正规的企业官网、产品、空间、项目、服务流程和商务人物形象；人物必须着装得体，避免身体特写、暧昧姿态和低俗营销表达。",
    "优先参考以下产品级 UI 审美库，但必须结合客户行业个性化，不要所有行业都套同一种 SaaS 页面：",
    designPresetPrompt,
    `网站用途：${websitePurpose}`,
    `风格方向：${direction.visualPrompt}`,
    "如果有参考官网风格图，最终画面要呈现“参考图同类审美 + 客户自身业务内容 + 完整板块设计参考”的效果。",
    "避免：只画首屏、只画一张横幅、纯机器人/AI 海报、过度抽象 3D 场景、杂乱后台表格、不可实现的超现实界面、所有板块都是同样的矩形卡片。"
  ].join("\n");
}

function summarizeStyleConceptFailures(failures: StyleConceptGenerationFailure[]) {
  const detail = failures
    .map((failure) => {
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error || "未知错误");
      return `${failure.styleName || `方案 ${failure.index + 1}`}：${message}`;
    })
    .join("；");
  return `真实整站设计参考图生成失败：${detail}`;
}

async function saveStyleImage(jobId: string, batchNumber: number, index: number, image: ImageApiResponse): Promise<string> {
  const item = image.data?.[0];
  const imageBase64 = item?.b64_json || item?.base64 || image.imageBase64 || image.image_base64;
  const imageUrl = item?.url || image.imageUrl || image.image_url || image.url;
  const filename = `style-${jobId}-${batchNumber}-${index + 1}.png`;

  if (imageBase64) {
    const stored = await saveGeneratedImageFile({ jobId, filename, imageBase64 });
    return stored.url;
  }

  if (imageUrl) {
    const stored = await saveGeneratedImageFile({ jobId, filename, sourceImageUrl: imageUrl });
    return stored.url;
  }
  throw new Error("真实生图接口没有返回 image URL 或 base64。");
}

async function requestImage(
  config: StyleImageConfig,
  prompt: string,
  context: { siteJobId: string; batchNumber: number; index: number; styleName: string }
): Promise<ImageApiResponse> {
  const body: Record<string, string | number> = {
    model: config.model,
    prompt,
    n: 1,
    size: config.size
  };

  if (config.quality) body.quality = config.quality;

  const endpoint = buildUrl(config.baseUrl, config.endpoint);
  const startedAt = Date.now();
  const metadata = {
    size: config.size,
    quality: config.quality || undefined,
    batchNumber: context.batchNumber,
    index: context.index,
    styleName: context.styleName
  };
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    await recordModelUsage({
      provider: "openai",
      operation: "site_style_image",
      model: config.model,
      endpoint,
      siteJobId: context.siteJobId,
      status: "error",
      imageCount: 1,
      promptCharacters: prompt.length,
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
      operation: "site_style_image",
      model: config.model,
      endpoint,
      siteJobId: context.siteJobId,
      status: "error",
      imageCount: 1,
      promptCharacters: prompt.length,
      durationMs: elapsedMs(startedAt),
      metadata,
      error: `HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`
    });
    throw new Error(`真实整站设计参考图生成失败：HTTP ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }

  const json = (await response.json()) as ImageApiResponse;
  await recordModelUsage({
    provider: "openai",
    operation: "site_style_image",
    model: config.model,
    endpoint,
    siteJobId: context.siteJobId,
    imageCount: 1,
    promptCharacters: prompt.length,
    responseCharacters: JSON.stringify(json).length,
    durationMs: elapsedMs(startedAt),
    metadata,
    ...extractUsageFromResponse(json)
  });

  return json;
}

export async function generateRealStyleConcepts(input: StyleConceptInput): Promise<GeneratedStyleConcept[]> {
  const config = getStyleImageConfig();
  if (!config) throw new Error("真实整站设计参考图接口未配置 API key。");

  const directions = directionsFor(input);
  const budget = await getSiteImageBudget(input.siteJob.id);
  if (budget.remaining < directions.length) {
    throw new Error(buildSiteImageBudgetError(budget, directions.length));
  }

  const settled = await Promise.allSettled(
    directions.map(async (direction, index) => {
      const result = await requestImage(config, buildImagePrompt(direction, input), {
        siteJobId: input.siteJob.id,
        batchNumber: input.batchNumber,
        index,
        styleName: direction.styleName
      });
      return {
        styleName: direction.styleName,
        styleDescription: direction.styleDescription,
        suitableFor: direction.suitableFor,
        schemeType: direction.schemeType,
        layoutStyle: direction.layoutStyle,
        colorTendency: direction.colorTendency,
        visualTechniques: direction.visualTechniques,
        emotionalDescription: direction.emotionalDescription,
        imageUrl: await saveStyleImage(input.siteJob.id, input.batchNumber, index, result),
        generationBatch: input.batchNumber,
        mode: "real" as const
      };
    })
  );

  const failures: StyleConceptGenerationFailure[] = [];
  const concepts: GeneratedStyleConcept[] = [];

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const direction = directions[index];
    if (result.status === "fulfilled") {
      concepts.push(result.value);
    } else {
      failures.push({ index, styleName: direction.styleName, error: result.reason });
    }
  }

  if (failures.length && !concepts.length) {
    throw new Error(summarizeStyleConceptFailures(failures));
  }

  return concepts;
}
