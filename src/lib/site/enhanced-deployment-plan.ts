import type { SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

type EnhancedModule = {
  id: string;
  name: string;
  triggerKeywords: string[];
  dataTable: string;
  purpose: string;
};

const MODULES: EnhancedModule[] = [
  {
    id: "lead_form",
    name: "咨询线索表单",
    triggerKeywords: ["咨询", "联系", "获取方案", "报价", "留言", "报名"],
    dataTable: "site_leads",
    purpose: "收集姓名、电话/微信、咨询内容、来源页面和提交时间，供管理员回溯。"
  },
  {
    id: "appointment",
    name: "预约/到店/体验课",
    triggerKeywords: ["预约", "到店", "体验", "试听", "试课", "档期"],
    dataTable: "site_appointments",
    purpose: "收集预约人、联系方式、预约项目、期望时间、备注和处理状态。"
  },
  {
    id: "membership",
    name: "轻会员/客户专区",
    triggerKeywords: ["会员", "登录", "客户专区", "学员", "订单", "进度"],
    dataTable: "site_members",
    purpose: "为需要长期服务或复购的客户预留会员身份、登录入口和基础资料记录。"
  }
];

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function enhancedBackendEnabled() {
  return process.env.SITE_ENABLE_ENHANCED_BACKEND_MODULES === "true";
}

export function inferEnhancedDeploymentModules(job: SiteJobDto, style?: StyleConceptDto | null) {
  if (!enhancedBackendEnabled()) return [];

  const text = [
    job.businessDescription,
    job.websitePurpose,
    job.customerContact,
    style?.styleDescription,
    style?.suitableFor,
    style?.emotionalDescription
  ]
    .filter(Boolean)
    .join("\n");

  const matched = MODULES.filter((module) => containsAny(text, module.triggerKeywords));
  if (matched.length) return matched;

  if (job.websitePurpose.includes("收集咨询") || job.websitePurpose.includes("招商获客") || job.websitePurpose.includes("AI")) {
    return [MODULES[0]];
  }

  return [];
}

export function buildEnhancedDeploymentPlan(job: SiteJobDto, style?: StyleConceptDto | null) {
  if (!enhancedBackendEnabled()) {
    return [
      "MVP 直连咨询模式：当前默认不生成表单、预约、报名、会员、登录、客户专区或后台线索查看入口。",
      "官网转化应改为直接展示联系人、电话、微信号、二维码/微信卡片、营业地址和固定联系 CTA，引导访客直接打电话或加微信。",
      "如果客户资料中出现报名、预约、咨询、报价、领取方案等诉求，也先写成“电话/微信咨询、电话/微信预约、添加微信获取方案”，不要输出可填写字段的表单。",
      "只有当 SITE_ENABLE_ENHANCED_BACKEND_MODULES=true 且项目明确进入增强部署阶段时，才规划 Supabase/Netlify Functions 表单、预约、会员或客户后台。"
    ].join("\n");
  }

  const modules = inferEnhancedDeploymentModules(job, style);
  if (!modules.length) {
    return [
      "增强部署规划：当前资料未明确要求表单、预约、会员或后台能力，默认以可公开访问官网为主。",
      "但生成时仍应保留清晰咨询入口；若页面出现表单/预约/会员入口，应同步输出可接 Supabase/Netlify Functions 的字段规划，不要做假交互。"
    ].join("\n");
  }

  return [
    "增强部署规划：本任务按常态增强部署处理。最终官网若出现以下业务动作，必须按真实可接入模块设计，不得只做假按钮或假表单。",
    ...modules.map(
      (module, index) =>
        `${index + 1}. ${module.name}（${module.id}）：${module.purpose} 建议 Supabase 表：${module.dataTable}。`
    ),
    "前端要求：表单字段、按钮状态、成功/失败提示、隐私提示和移动端输入体验要完整；如果当前预览阶段未接入真实 API，也要在代码和交付说明中清楚标出待接入的 endpoint/table。",
    "部署要求：轻部署默认面向 Netlify + Supabase。静态展示可直接上线；带业务动作的页面需要对应 Supabase 表、RLS/服务端写入策略、Netlify Function 或安全后端接口。"
  ].join("\n");
}
