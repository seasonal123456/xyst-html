import type { GeneratedStyleConcept, StyleConceptInput } from "@/lib/site/style-concept-types";
import { createRandomStyleDesignConditions } from "@/lib/site/style-design-conditions";

type StyleSeed = {
  name: string;
  description: string;
  suitableFor: string;
  bg: string;
  primary: string;
  accent: string;
  dark?: boolean;
};

const styleSeeds: StyleSeed[] = [
  {
    name: "品牌叙事型整站方案",
    description: "强首屏、下方服务与优势板块自然衔接，使用抠像、错位图文和柔和渐变建立专业可信感。最终官网应高度继承预览图的首屏构图、线条、图片槽位和板块节奏，再替换客户真实内容。",
    suitableFor: "律师、咨询、企业服务、个人品牌、需要建立信任的官网",
    bg: "#f8fafc",
    primary: "#0f766e",
    accent: "#b7791f"
  },
  {
    name: "项目展示型整站方案",
    description: "首屏突出项目价值，下方以交错卡片、斜切色块和项目图片区展示服务、案例与转化入口。最终官网应高度继承预览图的首屏构图、线条、图片槽位和板块节奏，再替换客户真实内容。",
    suitableFor: "产业园、厂房、制造业、招商项目、产品展示",
    bg: "#07111f",
    primary: "#d6a847",
    accent: "#2f6fed",
    dark: true
  },
  {
    name: "转化增长型整站方案",
    description: "下方板块围绕痛点、方案、流程和联系入口展开，适合快速承接咨询和微信转化。最终官网应高度继承预览图的首屏构图、线条、图片槽位和板块节奏，再替换客户真实内容。",
    suitableFor: "本地服务、获客落地页、法律服务、招商线索、咨询服务",
    bg: "#eef6ff",
    primary: "#1d4ed8",
    accent: "#06b6d4"
  }
];

function escapeSvgText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(value: string, max = 30) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function sectionBlocks(seed: StyleSeed) {
  const text = seed.dark ? "#f8fafc" : "#0f172a";
  const card = seed.dark ? "#101c2e" : "#ffffff";
  return `
    <path d="M0 390 C230 330 360 450 610 384 C850 320 990 344 1200 266 L1200 760 L0 760 Z" fill="${seed.primary}" opacity="${seed.dark ? ".20" : ".10"}"/>
    <path d="M0 526 C250 470 432 612 700 536 C900 478 1020 506 1200 430 L1200 760 L0 760 Z" fill="${seed.accent}" opacity="${seed.dark ? ".16" : ".12"}"/>

    <rect x="96" y="430" width="250" height="168" rx="26" fill="${card}" opacity="${seed.dark ? ".18" : ".96"}"/>
    <text x="124" y="484" fill="${text}" font-size="24" font-weight="900">服务板块</text>
    <rect x="124" y="514" width="154" height="14" rx="7" fill="${seed.primary}" opacity=".7"/>
    <rect x="124" y="546" width="190" height="12" rx="6" fill="${text}" opacity=".24"/>

    <g transform="translate(386 392) rotate(-3 155 110)">
      <rect width="310" height="210" rx="30" fill="${card}" opacity="${seed.dark ? ".20" : ".98"}"/>
      <circle cx="82" cy="88" r="46" fill="${seed.accent}" opacity=".85"/>
      <path d="M40 158 L112 100 L178 152 L222 124 L278 176 L40 176 Z" fill="${seed.primary}" opacity=".72"/>
      <text x="36" y="52" fill="${text}" font-size="22" font-weight="900">项目 / 案例</text>
    </g>

    <rect x="742" y="442" width="140" height="126" rx="24" fill="${card}" opacity="${seed.dark ? ".17" : ".94"}"/>
    <rect x="904" y="392" width="198" height="182" rx="28" fill="${card}" opacity="${seed.dark ? ".20" : ".96"}"/>
    <text x="770" y="494" fill="${text}" font-size="20" font-weight="900">优势</text>
    <text x="936" y="452" fill="${text}" font-size="22" font-weight="900">流程</text>
    <path d="M948 500 L1000 544 L1062 470" stroke="${seed.primary}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".82"/>

    <rect x="166" y="636" width="870" height="72" rx="36" fill="${seed.dark ? "#ffffff" : "#0f172a"}" opacity="${seed.dark ? ".12" : ".08"}"/>
    <text x="206" y="681" fill="${text}" font-size="22" font-weight="900">底部联系 CTA 与咨询入口</text>
    <rect x="828" y="652" width="166" height="40" rx="20" fill="${seed.primary}"/>
  `;
}

function svgDataUrl(seed: StyleSeed, business: string, batchNumber: number, index: number, titleOverride?: string) {
  const text = seed.dark ? "#f8fafc" : "#0f172a";
  const muted = seed.dark ? "#cbd5e1" : "#64748b";
  const card = seed.dark ? "#101c2e" : "#ffffff";
  const title = escapeSvgText(titleOverride || seed.name);
  const subtitle = escapeSvgText(truncate(business || "上传资料后生成的整站设计参考", 36));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
  <style>text{font-family:"Microsoft YaHei",Arial,sans-serif}</style>
  <rect width="1200" height="760" fill="${seed.bg}"/>
  <circle cx="1040" cy="116" r="160" fill="${seed.accent}" opacity="${seed.dark ? ".18" : ".13"}"/>
  <circle cx="158" cy="666" r="190" fill="${seed.primary}" opacity="${seed.dark ? ".18" : ".10"}"/>
  <rect x="74" y="54" width="1052" height="650" rx="34" fill="${seed.dark ? "#ffffff" : "#ffffff"}" opacity="${seed.dark ? ".06" : ".7"}"/>
  <rect x="108" y="90" width="138" height="34" rx="17" fill="${seed.primary}"/>
  <rect x="814" y="100" width="72" height="12" rx="6" fill="${muted}" opacity=".45"/>
  <rect x="914" y="100" width="72" height="12" rx="6" fill="${muted}" opacity=".35"/>
  <rect x="1014" y="86" width="82" height="38" rx="19" fill="${seed.accent}" opacity=".86"/>

  <text x="108" y="176" fill="${seed.primary}" font-size="24" font-weight="900">FULL WEBSITE CONCEPT ${batchNumber}.${index + 1}</text>
  <text x="108" y="246" fill="${text}" font-size="56" font-weight="900">${title}</text>
  <text x="108" y="304" fill="${muted}" font-size="28" font-weight="700">${subtitle}</text>
  <rect x="108" y="340" width="196" height="54" rx="27" fill="${seed.primary}"/>
  <text x="144" y="375" fill="${seed.dark ? "#07111f" : "#ffffff"}" font-size="22" font-weight="900">咨询 / 了解更多</text>

  <g transform="translate(724 156)">
    <rect width="318" height="230" rx="32" fill="${card}" opacity="${seed.dark ? ".20" : ".96"}"/>
    <path d="M40 180 L116 94 L178 154 L226 112 L290 190 Z" fill="${seed.primary}" opacity=".76"/>
    <circle cx="112" cy="94" r="52" fill="${seed.accent}" opacity=".82"/>
    <rect x="42" y="36" width="158" height="18" rx="9" fill="${text}" opacity=".28"/>
  </g>

  ${sectionBlocks(seed)}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function generateMockStyleConcepts(input: StyleConceptInput): Promise<GeneratedStyleConcept[]> {
  const conditions = createRandomStyleDesignConditions(3);
  return conditions.map((condition, index) => {
    const seed = styleSeeds[index % styleSeeds.length];
    return {
      styleName: `方案 ${index + 1}`,
      styleDescription: `${seed.description}\n\n设计蓝图原则：以这张预览图作为第一设计依据；行业类型只做内容纠偏，不应覆盖预览图中的结构、线条、图片比例、板块顺序和视觉节奏。`,
      suitableFor: seed.suitableFor,
      schemeType: condition.schemeType,
      layoutStyle: condition.layoutStyle,
      colorTendency: condition.colorTendency,
      visualTechniques: condition.visualTechniques,
      emotionalDescription: condition.emotionalDescription,
      imageUrl: svgDataUrl(seed, input.siteJob.businessDescription, input.batchNumber, index, condition.emotionalDescription),
      generationBatch: input.batchNumber,
      mode: "mock" as const
    };
  });
}
