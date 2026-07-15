import type { CopyGeneratorInput, GeneratedCopyVersion } from "@/lib/site/copy-types";
import type { CopyModule } from "@/lib/site/site-types";

function previousDraft(input: CopyGeneratorInput) {
  return input.previousCopyVersion?.contentJson
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((module) => module.content)
    .join("\n\n");
}

function buildDraft(input: CopyGeneratorInput, version: number) {
  const business = input.siteJob.businessDescription.trim();
  const name = input.siteJob.customerName || "客户官网";
  const contact = input.siteJob.customerContact || "请补充联系方式";
  const style = input.selectedMainStyle?.styleName || "专业官网风格";
  const styleDescription = input.selectedMainStyle?.emotionalDescription || input.selectedMainStyle?.styleDescription || "已选官网风格";
  const revised = version > 1 ? "\n\n【本版调整】\n已根据上一版编辑内容和标记意见重新整理表达，保留客户认可的句子，弱化不准确或不满意的段落。" : "";

  const previous = previousDraft(input);
  if (previous && version > 1) {
    return `${previous}${revised}`;
  }

  return `【首页首屏】
${name}

围绕客户提供的真实资料，搭建一个清晰、可信、便于咨询转化的官网。页面将以“${style}”为视觉方向，把业务信息整理成访客容易理解的表达。

【视觉架构说明】
本版文案会先顺着已选图片风格展开：${styleDescription}。首屏、下方板块、图片槽位、线条节奏和 CTA 位置优先继承预览图，再替换为客户上传图片与业务内容。行业类型只用于避免内容跑偏，不覆盖预览图结构。
后续页面中的卡片标题、按钮、标签和浮层文案会遵守中文槽位预算：小卡片使用 4-8 字短标题，按钮不超过 8 字，长解释放入普通正文，避免显示不全或被裁切。

【业务简介】
${business}

这部分内容会作为官网的核心说明，优先保留客户原始资料中的事实信息，并将口语化描述整理为更适合官网展示的表达。

【服务与展示重点】
- 清晰说明客户提供的服务、产品或项目。
- 展示客户希望重点呈现的业务资料和图片素材。
- 用简洁可信的语言说明适合哪些客户咨询。
- 在关键位置保留明确的咨询入口。

【核心优势】
官网表达会保持克制和真实，不编造客户没有提供的数据、资质、荣誉、案例或承诺。重点突出业务定位清楚、资料展示集中、沟通入口明确。

【合作或咨询流程】
了解需求 → 沟通资料 → 确认服务方向 → 推进合作 → 持续沟通。

【联系方式】
如需进一步了解，可通过以下方式联系：
${contact}

【页尾说明】
本官网内容基于客户当前提供的资料整理，后续可继续补充图片、案例、项目介绍和更详细的服务说明。`;
}

export async function generateMockCopyVersion(input: CopyGeneratorInput): Promise<GeneratedCopyVersion> {
  const versionNumber = (input.previousCopyVersion?.versionNumber || 0) + 1;
  const content = buildDraft(input, versionNumber);
  const previous = input.previousCopyVersion?.contentJson[0];

  const copyModule: CopyModule = {
    moduleId: "full_copy",
    moduleName: "官网文案稿",
    content,
    order: 1,
    lockedRanges: previous?.lockedRanges || [],
    rejectedRanges: [],
    manualEdited: false
  };

  return { contentJson: [copyModule] };
}
