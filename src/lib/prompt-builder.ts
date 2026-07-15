import { CONTENT_TYPES, LAYOUT_SUGGESTIONS, STYLE_DIRECTIONS, USAGE_SCENARIOS } from "@/lib/constants";
import type { BuildPromptInput, PromptAsset } from "@/types";

function normalizeOptional(value: string, fallback = "未填写"): string {
  return value.trim() || fallback;
}

function formatSellingPoints(value: string): string {
  const points = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (points.length === 0) {
    return "未填写";
  }

  return points.map((point, index) => `${index + 1}. ${point}`).join("\n");
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getContentTypeRatio(contentType: string): string {
  return CONTENT_TYPES.find((item) => item.label === contentType)?.ratio ?? "16:9";
}

function getAssetName(file: PromptAsset): string {
  return file.originalName || file.name || file.storedName || "未命名素材";
}

function getAssetMimeType(file: PromptAsset): string {
  return file.mimeType || file.type || "图片";
}

function formatFileList(files: PromptAsset[]): string {
  if (files.length === 0) {
    return "暂无上传素材。";
  }

  return files
    .map((file, index) => {
      const urlText = file.url ? `，保存地址：${file.url}` : "";
      const storedNameText = file.storedName ? `，存储文件名：${file.storedName}` : "";
      return `${index + 1}. ${getAssetName(file)}（${formatFileSize(file.size)}，${getAssetMimeType(file)}${storedNameText}${urlText}）`;
    })
    .join("\n");
}

export function buildPrompt(input: BuildPromptInput): string {
  const ratio = getContentTypeRatio(input.contentType);
  const usageScenario = USAGE_SCENARIOS[input.contentType] ?? "用于商业传播、客户沟通和销售转化。";
  const styleDirection = STYLE_DIRECTIONS[input.style] ?? "保持专业、清晰、可信赖的商业视觉方向。";
  const layoutSuggestion = LAYOUT_SUGGESTIONS[input.contentType] ?? "建议采用标题、主视觉、核心卖点、联系方式四层结构。";
  const fileCount = input.uploadedFiles.length;
  const fileList = formatFileList(input.uploadedFiles);

  return `你是一名资深商业视觉设计师，请根据以下企业素材和需求，生成一张适合商业传播的宣传图。

【出图类型】
${input.contentType}

【推荐画面比例】
${ratio}

【主要使用场景】
${usageScenario}

【设计风格】
${input.style}

【企业 / 项目名称】
${normalizeOptional(input.name)}

【所属行业】
${normalizeOptional(input.industry)}

【主营产品 / 服务】
${normalizeOptional(input.business)}

【目标客户】
${normalizeOptional(input.targetCustomer)}

【核心卖点】
${formatSellingPoints(input.sellingPoints)}

【联系方式】
${normalizeOptional(input.contact)}

【补充说明】
${normalizeOptional(input.note)}

【客户期望用途】
${normalizeOptional(input.usagePurpose)}

【是否需要人工精修】
${input.needManualRefine ? "需要人工精修" : "暂不需要人工精修"}

【素材使用授权】
${input.materialConsent ? "客户已确认素材仅用于本次出图测试。" : "客户尚未确认素材授权，正式处理前需要补充确认。"}

【已上传素材】
共上传 ${fileCount} 个素材文件：
${fileList}

【设计方向】
${styleDirection}

【版式建议】
${layoutSuggestion}

【设计要求】
1. 画面要专业、清晰、可信赖。
2. 信息层级要明确，适合客户快速理解。
3. 不要堆砌文字。
4. 风格要符合「${input.style}」。
5. 内容要围绕「${input.contentType}」展开。
6. 画面中应突出企业 / 项目名称和核心卖点。
7. 适合用于微信、朋友圈、公众号或官网展示。
8. 如果素材中包含 logo、厂房、产品或项目图片，应优先作为视觉元素使用。
9. 中文字体要清晰，不要出现乱码。
10. 商业信息表达要克制，不要过度浮夸。
11. 画面要具备销售转化意识，而不是单纯好看。
12. 信息重点要适合客户在 3 秒内理解。

【设计交付建议】
如果用于客户初稿展示，请保证画面清晰、信息完整、可进一步人工精修。
如果用于正式传播，请预留人工校对空间，避免生成错误文字或虚假信息。

【输出要求】
生成一张高质量商业宣传图。
请优先保证：
- 标题清晰
- 卖点突出
- 画面专业
- 适合传播
- 能让客户快速理解业务价值`;
}
