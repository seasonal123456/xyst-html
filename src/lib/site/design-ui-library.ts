export type WebsiteDesignPreset = {
  id: string;
  name: string;
  description: string;
  colorTokens: string[];
  layoutRules: string[];
  sectionPatterns: string[];
  interactionRules: string[];
};

export const websiteDesignPresets: WebsiteDesignPreset[] = [
  {
    id: "sky-glass-workbench",
    name: "浅蓝玻璃拟态工作台官网",
    description:
      "适合 AI 工具、SaaS、企业服务、科技获客产品。首屏以大标题和工作台界面形成强冲击，下面用能力卡片、流程、语言/场景、前后对比和交付物建立可信闭环。",
    colorTokens: [
      "背景以 #f6fbff、#ffffff、#edf6ff 为主，形成清透、明亮、可信的企业科技感。",
      "主色使用 #2f6fed 或 #3b82f6，辅助强调色可使用 #ff5f73，但只用于关键转化词或主按钮。",
      "边框使用 rgba(47,111,237,.14)，阴影使用偏蓝的柔和长阴影，避免厚重灰黑阴影。"
    ],
    layoutRules: [
      "首屏采用左文案右产品工作台界面，右侧界面要像真实系统而不是普通插图。",
      "H1 必须巨大、直接、可传播，可用 1 个高饱和强调词形成记忆点。",
      "页面下方保持清晰秩序：能力矩阵、四步流程、多语言/多场景、前后对比、交付物、页脚。",
      "区块之间可用淡蓝渐变带、弧线轨迹、半透明浮层和轻微错位连接，不要割裂成一段段白底卡片。"
    ],
    sectionPatterns: [
      "Hero: 大标题 + 价值说明 + 双 CTA + 可信能力点 + 右侧生成工作台。",
      "Capabilities: 5-6 个能力块，图标浅蓝、边框轻、文案短。",
      "Process: 4 步横向流程，用箭头和编号表达从资料到上线。",
      "Global/Scenario: 多语言或多终端缩略图，强化可扩展性。",
      "BeforeAfter: 左边混乱资料，右边专业官网，用箭头表达转化。",
      "Delivery: 官网设计稿、响应式页面、完整前端代码、可继续修改。"
    ],
    interactionRules: [
      "按钮、能力块、缩略图、流程项必须有 hover/focus-visible 状态。",
      "工作台面板可以加入进度条、选中态、文件上传完成态、AI 发光节点等微动效。",
      "动画应轻盈克制：translate、shadow、gradient shift、progress pulse，避免大幅晃动。"
    ]
  }
];

export function getDefaultWebsiteDesignPreset() {
  return websiteDesignPresets[0];
}

export function buildDesignPresetPrompt(preset: WebsiteDesignPreset = getDefaultWebsiteDesignPreset()) {
  return [
    `Design UI preset: ${preset.name}`,
    preset.description,
    "Color tokens:",
    ...preset.colorTokens.map((item) => `- ${item}`),
    "Layout rules:",
    ...preset.layoutRules.map((item) => `- ${item}`),
    "Section patterns:",
    ...preset.sectionPatterns.map((item) => `- ${item}`),
    "Interaction rules:",
    ...preset.interactionRules.map((item) => `- ${item}`)
  ].join("\n");
}
