import type { ContentTypeOption, StyleOption } from "@/types";

export const CONTENT_TYPES: ContentTypeOption[] = [
  {
    id: "hero-poster",
    label: "企业宣传主图",
    ratio: "16:9",
    description: "适合企业介绍、销售转发和综合宣传场景。"
  },
  {
    id: "project-card",
    label: "项目推荐卡",
    ratio: "3:4",
    description: "适合项目亮点、案例推荐和客户跟进。"
  },
  {
    id: "product-card",
    label: "产品卖点卡",
    ratio: "3:4",
    description: "适合突出产品能力、参数和使用价值。"
  },
  {
    id: "park招商",
    label: "产业园招商图",
    ratio: "4:5",
    description: "适合园区、厂房、区位与招商政策展示。"
  },
  {
    id: "wechat-cover",
    label: "微信推文封面",
    ratio: "2.35:1",
    description: "适合公众号封面和文章入口视觉。"
  },
  {
    id: "website-banner",
    label: "官网首屏 Banner",
    ratio: "16:9",
    description: "适合官网首屏、落地页和横幅展示。"
  }
];

export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: "modern-business",
    label: "现代商务风",
    description: "白底、蓝灰色、清晰、专业、适合企业服务。"
  },
  {
    id: "premium-park",
    label: "高端产业园风",
    description: "深蓝、金色点缀、建筑感、适合园区招商。"
  },
  {
    id: "tech-blue",
    label: "科技蓝风",
    description: "蓝色渐变、网格、光效线条、适合科技企业。"
  },
  {
    id: "manufacturing-hardcore",
    label: "制造业硬核风",
    description: "深灰、橙色强调、工业质感、适合工厂与制造业。"
  },
  {
    id: "wechat-viral",
    label: "微信朋友圈传播风",
    description: "标题醒目、信息短、适合手机快速阅读。"
  },
  {
    id: "xiaohongshu",
    label: "小红书图文风",
    description: "浅色、标签感、亲和、适合图文种草。"
  },
  {
    id: "investment-card",
    label: "招商项目推荐卡风",
    description: "参数清晰、区位突出、适合厂房和产业园推荐。"
  },
  {
    id: "website-hero",
    label: "企业官网首图风",
    description: "横幅结构、大标题、按钮感、适合官网首屏。"
  }
];

export const MATERIAL_HINTS = [
  "logo",
  "企业环境图",
  "产品图",
  "厂房图",
  "园区图",
  "项目图片",
  "人物照片",
  "参考风格图"
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 10;

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const USAGE_SCENARIOS: Record<string, string> = {
  企业宣传主图: "用于企业介绍、销售转发、招商沟通和综合宣传入口。",
  项目推荐卡: "用于客户跟进、私域转发、项目亮点推荐和销售沟通。",
  产品卖点卡: "用于突出产品价值、关键参数、应用场景和采购决策理由。",
  产业园招商图: "用于园区招商、厂房推荐、区位介绍和政策卖点展示。",
  微信推文封面: "用于公众号文章封面，要求标题快速抓人、画面简洁。",
  "官网首屏 Banner": "用于官网首屏横幅，要求品牌可信、信息清晰、具备行动引导。"
};

export const STYLE_DIRECTIONS: Record<string, string> = {
  现代商务风: "使用浅色背景、蓝灰主色、清晰分区和克制装饰，强调专业可信。",
  高端产业园风: "使用深蓝基底、金色点缀、建筑线条和空间透视，强调园区品质与招商价值。",
  科技蓝风: "使用蓝色渐变、网格背景、光效线条和数据感元素，强调技术与效率。",
  制造业硬核风: "使用深灰背景、橙色强调、工业块面和设备质感，强调生产能力与可靠交付。",
  微信朋友圈传播风: "使用醒目标题、短句卖点和强对比视觉，适合手机快速滑动阅读。",
  小红书图文风: "使用浅色背景、柔和色块、标签化信息和亲和表达，适合图文种草。",
  招商项目推荐卡风: "使用参数化信息区、区位标签、面积租金优势模块，强调结构清楚。",
  企业官网首图风: "使用横幅结构、大标题、副标题和按钮样式，强调官网首屏转化。"
};

export const LAYOUT_SUGGESTIONS: Record<string, string> = {
  企业宣传主图: "建议采用左侧主标题和卖点、右侧素材主视觉的横版结构，底部保留联系方式。",
  项目推荐卡: "建议采用顶部标题、中部项目图或核心参数、底部卖点与联系方式的竖版卡片结构。",
  产品卖点卡: "建议突出产品图或产品能力，使用三条核心卖点卡片辅助说明。",
  产业园招商图: "建议采用区位/面积/租金/优势四组信息标签，配合园区或厂房素材形成招商卡片。",
  微信推文封面: "建议标题占据主要视觉区域，副标题简短，背景素材弱化处理避免干扰阅读。",
  "官网首屏 Banner": "建议使用横幅英雄区，大标题、简短副标题、行动按钮和右侧主视觉。"
};
