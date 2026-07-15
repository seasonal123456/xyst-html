export type LayoutTextBudgetSlot = {
  slot: string;
  maxChars: number;
  preferredLines?: number;
  maxLines?: number;
  note: string;
};

const DEFAULT_BUDGETS: LayoutTextBudgetSlot[] = [
  { slot: "hero.title", maxChars: 18, preferredLines: 2, maxLines: 2, note: "首屏大标题；短标题优先单行，长标题按语义均衡分行。" },
  { slot: "hero.subtitle", maxChars: 60, preferredLines: 2, maxLines: 3, note: "首屏副标题；只保留最能解释业务的核心句。" },
  { slot: "hero.cta", maxChars: 8, maxLines: 1, note: "主行动按钮，必须短而明确。" },
  { slot: "section.title", maxChars: 16, preferredLines: 1, maxLines: 2, note: "普通板块标题；不要写成长句。" },
  { slot: "banner.title", maxChars: 14, preferredLines: 1, maxLines: 2, note: "横幅/蓝色强调卡标题；标题长时拆成短标题+说明。" },
  { slot: "featureCard.title", maxChars: 8, maxLines: 2, note: "功能/优势/服务卡片标题；禁止完整长句。" },
  { slot: "featureCard.body", maxChars: 44, maxLines: 3, note: "功能/优势/服务卡片说明；只写一个意思。" },
  { slot: "floatingCard.title", maxChars: 8, maxLines: 2, note: "浮动数据/提示卡标题；必须非常短。" },
  { slot: "floatingCard.body", maxChars: 28, maxLines: 2, note: "浮动卡说明；避免长句。" },
  { slot: "statCard.label", maxChars: 8, maxLines: 1, note: "数据卡标签，例如“入驻企业”“出租率”。" },
  { slot: "statCard.value", maxChars: 6, maxLines: 1, note: "数据值，例如“260+”“92%”。不得编造。" },
  { slot: "chip", maxChars: 10, maxLines: 1, note: "标签/chip；超过限制要改短。" },
  { slot: "button", maxChars: 8, maxLines: 1, note: "按钮文字；移动端也必须完整显示。" },
  { slot: "contact.cardTitle", maxChars: 12, maxLines: 2, note: "联系人/微信卡片标题；不要写完整说明句。" },
  { slot: "contact.hint", maxChars: 36, maxLines: 2, note: "联系提示；长提示放到普通正文段落。" },
  { slot: "contactBar.title", maxChars: 10, maxLines: 1, note: "浮动/底部联系条标题；移动端会降级为普通模块。" }
];

export function buildLayoutTextBudgetPrompt() {
  return [
    "中文文案槽位预算（必须遵守）：",
    "估算原则：中文汉字约等于 1em，英文/数字约等于 0.55em，标点/空格约等于 0.35em；移动端可用宽度更小，预算默认再保守 20%。",
    "如果文案超过槽位预算，不要硬塞进卡片或按钮；必须改短、拆成短标题+说明、放入普通正文，或调整版式。",
    ...DEFAULT_BUDGETS.map((item) => {
      const lineRule = [item.preferredLines ? `建议 ${item.preferredLines} 行` : "", item.maxLines ? `最多 ${item.maxLines} 行` : ""]
        .filter(Boolean)
        .join("，");
      return `- ${item.slot}: <= ${item.maxChars} 个汉字${lineRule ? `，${lineRule}` : ""}。${item.note}`;
    }),
    "小卡片、浮层、按钮、标签中禁止使用完整长句；长句必须降级到正文说明。",
    "所有可见文字必须完整显示，禁止被裁切、遮挡、压住或超出容器。"
  ].join("\n");
}

export function layoutTextBudgetJson() {
  return DEFAULT_BUDGETS;
}
