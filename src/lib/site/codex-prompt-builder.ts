import type { CopyVersionDto, SiteAssetDto, SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";
import { buildEnhancedDeploymentPlan } from "@/lib/site/enhanced-deployment-plan";
import { buildLayoutTextBudgetPrompt } from "@/lib/site/layout-text-budget";
import { styleConditionSummary } from "@/lib/site/style-design-conditions";

function assetUsageLabel(asset: SiteAssetDto) {
  if (asset.assetRole === "qr_code") return "contact QR code asset; use only in contact section or WeChat card";
  if (asset.assetRole === "style_reference") return "website style reference; do not use as visible page content";
  return "website content image/material";
}

export function buildCodexWebsitePrompt(input: {
  siteJob: SiteJobDto;
  finalCopyVersion: CopyVersionDto;
  selectedMainStyle?: StyleConceptDto;
  favoriteStyles: StyleConceptDto[];
  uploadedAssets: SiteAssetDto[];
}) {
  const modules = input.finalCopyVersion.contentJson
    .sort((a, b) => a.order - b.order)
    .map((module) => `【${module.moduleName}】\n${module.content}`)
    .join("\n\n");
  const qrAwareAssets = input.uploadedAssets
    .map((asset, index) => `${index + 1}. ${asset.originalName} - ${asset.url} - asset role: ${assetUsageLabel(asset)}`)
    .join("\n");
  const favoriteStyleDetails = input.favoriteStyles.length
    ? input.favoriteStyles
        .map(
          (style, index) =>
            `${index + 1}. ${style.styleName}\n   用户可见描述：${style.emotionalDescription || style.styleDescription}\n   内部视觉条件：\n${styleConditionSummary(style)
              .split("\n")
              .map((line) => `   - ${line}`)
              .join("\n")}\n   适合：${style.suitableFor || "未填写"}\n   图片：${style.imageUrl}`
        )
        .join("\n")
    : "无";
  const enhancedDeploymentPlan = buildEnhancedDeploymentPlan(input.siteJob, input.selectedMainStyle);
  const layoutTextBudget = buildLayoutTextBudgetPrompt();

  return `一、项目背景
客户业务描述：${input.siteJob.businessDescription}
网站用途：${input.siteJob.websitePurpose}

二、客户业务理解
请根据客户描述和上传资料，总结客户提供什么服务 / 产品 / 项目。不要编造客户没有提供的信息。

三、网站目标
- 展示公司形象
- 展示产品 / 项目
- 引导客户咨询
- 适合微信转发
- 适合移动端浏览

四、网站类型与 MVP 转化方式
请根据业务自动判断展示官网、产品/项目官网、获客落地页、品牌官网等类型。
当前 MVP 阶段默认规避表单、预约、报名、会员、登录、客户专区和后台线索查看。所有转化优先用电话、微信、联系人、二维码/微信卡片、地址和固定联系 CTA 完成。
${enhancedDeploymentPlan}

五、视觉风格
主风格名称：${input.selectedMainStyle?.styleName || "未选择"}
主风格说明：${input.selectedMainStyle?.emotionalDescription || input.selectedMainStyle?.styleDescription || "按客户最终选择执行"}
最终设计依据：${input.siteJob.preferUploadedStyleReference ? "客户上传的参考官网截图，不使用生成的官网参考图作为设计依据" : "客户选中的生成官网参考图"}
主风格内部视觉条件：
${styleConditionSummary(input.selectedMainStyle)}
收藏风格参考：${input.favoriteStyles.map((style) => style.styleName).join("、") || "无"}
收藏风格明细：
${favoriteStyleDetails}
色彩建议：参考主风格预览图，保持专业、清晰、可信赖。
版式建议：选中的风格预览图是第一设计依据。最终官网应高度模仿预览图的首屏构图、线条、图片比例、板块顺序、留白关系、视觉节奏和 CTA 位置，再替换为客户上传图片与最终文案。行业类型只做内容合理性纠偏，不得覆盖预览图结构。
全宽沉浸式首屏建议：如果客户行业有真实空间、产品、项目、园区、门店、课堂、作品或服务场景，并且有合适图片，请优先考虑 full-width immersive hero：一张横屏大图铺满首屏，左侧/左中叠加标题和 CTA，右侧少量轻量数据浮层，底部可有横向信息条；不要默认退回右侧小图卡片。

六、页面结构
不要直接套用固定行业模板。请先从选中的预览图/参考图反推页面蓝图：
- 首屏是大图背景、半屏图文、居中标题、还是更复杂的沉浸式场景？
- 下方板块是几段、每段图片和文字比例如何、线条/分隔/留白如何延续？
- 哪些图片槽位适合替换成客户上传图片，哪些需要用图库/案例墙承载？
- 电话/微信 CTA、联系人卡片、二维码/微信卡片和联系信息应放在哪些自然位置？
- 如果预览图结构与通用行业结构冲突，优先保留预览图结构，只补齐必要业务信息。

六点五、中文文字槽位预算
${layoutTextBudget}

七、最终确认文案
${modules}

要求 Codex：
- 不能删除最终确认文案
- 不能改写锁定文案
- 可以做轻微排版和层级优化
- 不能编造客户没有提供的信息

八、图片素材使用要求
${qrAwareAssets || "客户暂未提供足够图片，可以使用清晰占位图。"}

要求：
- 优先使用客户上传图片
- 如果没有足够图片，可以用占位图
- 不要把图片用于无关场景
- 英雄页沉浸感规则：如果客户上传图片或 AI 生成配图适合作为首屏视觉，请让 Hero 看起来拥有一张饱满的大图作为背景或主视觉场域，并用遮罩、渐变、留白和对比保证文字清晰；不要在适合大图表达时只把首屏图片缩成小卡片。
- 英雄页主视觉优先级：
  1. 第一优先：客户上传的真实门店、作品、团队、产品、空间、课堂、项目或服务过程照片。
  2. 第二优先：真实摄影感、沉浸式、行业强相关的 AI 场景图。
  3. 第三优先：不用右侧硬凑配图，改成纯文字首屏 + 局部作品墙/案例图，宁可干净，不要廉价拼贴。
- 英雄页图片质量规则：除非客户本身是软件、SaaS、数据平台或数字产品，不要用假浏览器窗口、假后台界面、假 App UI、数据面板、卡片套卡片、截图拼贴作为主视觉。教育、培训、制造、餐饮、门店、本地服务等行业应优先使用真实业务场景、空间、人物、产品、作品或服务过程。
- 英雄页主视觉禁用清单：禁止小图套小卡、卡片叠卡、截图嵌截图、灰白低对比、雾蒙蒙、主体不清、行业弱相关通用素材、AI 乱码文字、假按钮和假 UI 标签。英雄图必须一眼看懂行业、主体够大、有空间感、可铺满首屏或半屏、文字区域不打架。
- 中文大标题排版规则：大标题必须主动控制语义换行，不要依赖自动换行。换行只能出现在自然短语边界，禁止出现单字/双字孤行，例如“从一次尝试开始，慢慢走进绘 / 画”。
- 英雄页标题实现规则：主标题请使用 class="hero-title" 或 data-headline-guard。5-12 个汉字的短标题应优先保持单行；较长标题应使用 <span class="headline-line">...</span> 或 <br> 按语义分成均衡行，例如 8/8、6/7、7/7，禁止 7/1、10/2 这种孤字/孤词尾巴。CSS 应加入 text-wrap: balance、word-break: keep-all、overflow-wrap: normal，并在移动端调整字号或容器宽度。
- 信息卡文案规则：不要输出“课程方向 5”“咨询报名 刘先生”“年度作品展 2次”这种后台字段式表达。请改成自然访客语言，例如“5 类课程方向”“每年 2 次作品展”“刘先生为你介绍适合的课程”。没有真实数字时不要编造数字。

九、交互和转化要求
- 联系电话 / 微信：${input.siteJob.customerContact || "按客户补充信息展示"}
- 咨询按钮明显
- 移动端明显 CTA
- 当前默认不要生成表单、输入框、预约入口、会员入口、登录入口或后台入口；咨询、报名、预约、报价统一改为“打电话/加微信联系”。
- 桌面端允许少量浮层增强视觉，但移动端必须降级为普通上下排列模块，不得覆盖标题、图片、按钮、联系信息或下一屏内容。

十、技术栈要求
Next.js + TypeScript + Tailwind CSS
必须包含 package.json、README.md、响应式布局、可本地运行、不依赖外部 CDN、图片从 public 或配置路径读取。
运行命令：npm install / npm run dev

十一、文件结构要求
generated-site/
  ├── package.json
  ├── README.md
  ├── src/
  │   ├── app/
  │   │   ├── page.tsx
  │   │   ├── layout.tsx
  │   │   └── globals.css
  │   ├── components/
  │   └── data/
  └── public/
      └── assets/

十二、移动端适配要求
- 手机端必须清晰
- CTA 按钮明显
- 图片不能溢出
- 文案层级清楚
- 微信内打开体验友好

十三、禁止事项
1. 不要编造客户没有提供的资质、案例、数据。
2. 不要删除最终确认文案。
3. 不要改写锁定文案。
4. 不要使用外部不可控 CDN。
5. 不要生成无法运行的伪代码。
6. 不要忽略移动端适配。
7. 不要把客户上传图片用于无关场景。
8. 不要生成真实支付；MVP 阶段不要生成登录、预约、表单、会员和轻后台，除非项目已明确开启增强部署。
9. 不要引入不必要的复杂依赖。
10. 不要过度炫技，优先做可用官网。
11. 不要用假 UI mockup 冒充行业配图。
12. 不要让中文标题出现单字孤行或奇怪换行；短中文英雄标题不要自动断成“七个字一行、一个字掉到第二行”。
13. 不要把信息卡写成后台字段和值。`;
}
