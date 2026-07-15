import type { StyleConceptDto } from "@/lib/site/site-types";

export type StyleDesignConditions = {
  schemeType: string;
  layoutStyle: string;
  colorTendency: string;
  visualTechniques: string[];
  emotionalDescription: string;
};

const schemeTypes = [
  "品牌叙事型整站方案",
  "项目展示型整站方案",
  "项目展示型整站方案",
  "转化增长型整站方案",
  "转化增长型整站方案"
];

const layoutStyles = ["极简主义", "日系清新风", "Bento Grid 风格", "复古风", "北欧风"];
const colorTendencies = ["高饱和配色", "低饱和配色"];
const visualTechniquePool = [
  "大留白",
  "柔和渐变",
  "错位图文",
  "局部抠像",
  "斜切色块",
  "半透明渐变",
  "交错网格",
  "跨板块浮层",
  "渐变带",
  "异形分隔",
  "竖向时间线",
  "悬浮 CTA",
  "局部放大",
  "底纹叠层",
  "卡片化排版"
];

const emotionalDescriptions = [
  "清爽可信的品牌官网方向",
  "更适合展示项目和案例的官网方向",
  "更强调咨询转化的营销官网方向",
  "更有设计感和记忆点的品牌方向",
  "更年轻、更明亮的视觉方向",
  "更稳重、更高级的企业方向"
];

function pickOne<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickMany<T>(items: T[], min: number, max: number) {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = items.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function describeEmotion(conditions: Omit<StyleDesignConditions, "emotionalDescription">, usedDescriptions: Set<string>) {
  const candidates: string[] = [];

  if (conditions.schemeType === "品牌叙事型整站方案") {
    candidates.push("清爽可信的品牌官网方向", "更有设计感和记忆点的品牌方向");
  }
  if (conditions.schemeType === "项目展示型整站方案") {
    candidates.push("更适合展示项目和案例的官网方向");
  }
  if (conditions.schemeType === "转化增长型整站方案") {
    candidates.push("更强调咨询转化的营销官网方向");
  }
  if (conditions.colorTendency === "高饱和配色") {
    candidates.push("更年轻、更明亮的视觉方向");
  }
  if (conditions.colorTendency === "低饱和配色") {
    candidates.push("更稳重、更高级的企业方向");
  }
  if (conditions.layoutStyle === "日系清新风" || conditions.layoutStyle === "北欧风") {
    candidates.push("清爽可信的品牌官网方向");
  }
  if (conditions.layoutStyle === "复古风" || conditions.visualTechniques.includes("异形分隔")) {
    candidates.push("更有设计感和记忆点的品牌方向");
  }

  const uniqueCandidates = Array.from(new Set([...candidates, ...emotionalDescriptions]));
  return uniqueCandidates.find((item) => !usedDescriptions.has(item)) || pickOne(emotionalDescriptions);
}

function schemeKey(conditions: Omit<StyleDesignConditions, "emotionalDescription">) {
  return [conditions.schemeType, conditions.layoutStyle, conditions.colorTendency, conditions.visualTechniques.slice().sort().join("|")].join("::");
}

export function createRandomStyleDesignConditions(count = 3): StyleDesignConditions[] {
  const results: StyleDesignConditions[] = [];
  const usedKeys = new Set<string>();
  const usedDescriptions = new Set<string>();

  while (results.length < count) {
    const draft = {
      schemeType: pickOne(schemeTypes),
      layoutStyle: pickOne(layoutStyles),
      colorTendency: pickOne(colorTendencies),
      visualTechniques: pickMany(visualTechniquePool, 2, 4)
    };
    const key = schemeKey(draft);
    if (usedKeys.has(key) && usedKeys.size < 20) continue;

    const emotionalDescription = describeEmotion(draft, usedDescriptions);
    usedKeys.add(key);
    usedDescriptions.add(emotionalDescription);
    results.push({ ...draft, emotionalDescription });
  }

  return results;
}

export function parseVisualTechniques(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  } catch {
    return value
      .split(/[、,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function styleConditionsToJson(visualTechniques: string[]) {
  return JSON.stringify(visualTechniques.filter(Boolean));
}

export function styleConditionSummary(style?: Partial<StyleConceptDto> | null) {
  if (!style) return "未选择具体视觉方案。";
  const parts = [
    style.schemeType ? `整站方案类型：${style.schemeType}` : "",
    style.layoutStyle ? `版式风格：${style.layoutStyle}` : "",
    style.colorTendency ? `色彩倾向：${style.colorTendency}` : "",
    style.visualTechniques?.length ? `视觉手法：${style.visualTechniques.join("、")}` : "",
    style.emotionalDescription ? `用户可见描述：${style.emotionalDescription}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : "未记录随机视觉条件，请依据风格图本身执行。";
}
