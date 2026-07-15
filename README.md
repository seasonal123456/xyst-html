# AI 官网生成工作台

当前阶段：

`Stage 4：AI Website Generation Workbench`

阶段 4 的目标是验证：

上传资料
→ 生成官网风格图
→ 客户选择主风格
→ 生成官网文案
→ 客户锁定 / 标红 / 编辑
→ 提交最终文案
→ 生成 Codex 建站任务包
→ 管理员复制给 Codex 制作官网
→ 客户预览交付。

它不是营销官网，也不是复杂 SaaS。现阶段暂不自动调用 Codex CLI，不做支付、积分、复杂会员、模板商城或完整 SaaS。

## 如何运行

```bash
npm install
npx prisma generate
npx prisma migrate dev --name stage4_site_workbench
npm run dev
```

如果 Windows 本地或当前非交互环境中 `prisma migrate dev` 不可用，可使用已验证的兜底初始化：

```bash
npm run db:init
```

浏览器打开：

```text
http://localhost:3000
```

## 页面路径

客户官网生成流程：

- `/site/start`：资料上传与业务描述页
- `/site/style/[jobId]`：官网风格图生成与选择页
- `/site/copy/[jobId]`：官网文案协作页
- `/site/confirm/[jobId]`：最终文案确认页
- `/site/codex/[jobId]`：Codex 建站任务包页
- `/site/result/[jobId]`：客户官网预览交付页

管理员后台：

- `/admin/site-jobs`：官网生成任务列表
- `/admin/site-jobs/[jobId]`：官网生成任务详情
- `/admin/site-jobs/[jobId]/codex`：查看 / 复制 Codex 任务包
- `/admin/site-jobs/[jobId]/delivery`：填写预览地址、网站包、截图和交付说明

阶段 3 出图验证台仍保留：

- `/`
- `/admin`
- `/result/[id]`

## 环境变量

复制 `.env.example` 为 `.env` 或 `.env.local`。

核心配置：

```env
DATABASE_URL="file:./dev.db"
ADMIN_PASSWORD=change-me
STORAGE_PROVIDER=local
IMAGE_PROVIDER=mock
ENABLE_MOCK_FALLBACK=true

STYLE_IMAGE_PROVIDER=mock
COPY_PROVIDER=mock
```

真实接口预留：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_TEXT_MODEL=gpt-4.1-mini

STYLE_IMAGE_PROVIDER=openai
STYLE_IMAGE_API_BASE_URL=
STYLE_IMAGE_API_ENDPOINT=
STYLE_IMAGE_API_KEY=
STYLE_IMAGE_MODEL=
STYLE_IMAGE_SIZE=1536x1024
STYLE_IMAGE_QUALITY=medium

COPY_PROVIDER=openai
COPY_API_BASE_URL=
COPY_API_ENDPOINT=
COPY_API_KEY=
COPY_MODEL=
```

API key 只在服务端读取，不暴露给前端。

最简单的真实生成配置：

```env
OPENAI_API_KEY=你的服务端 API Key
STYLE_IMAGE_PROVIDER=openai
COPY_PROVIDER=openai
ENABLE_MOCK_FALLBACK=true
```

如果需要接第三方 OpenAI-compatible 服务，可分别填写 `STYLE_IMAGE_API_BASE_URL` / `STYLE_IMAGE_API_ENDPOINT` / `STYLE_IMAGE_API_KEY` / `STYLE_IMAGE_MODEL` 和 `COPY_API_*`。

## 当前实现

- SiteJob / SiteAsset / StyleConcept / CopyVersion / CopyAnnotation 数据模型
- `/site/start` 创建官网任务并保存素材
- 支持 jpg / jpeg / png / webp / pdf
- 图片最大 10MB，PDF 最大 20MB，最多 20 个文件
- 支持上传参考官网风格截图，系统会标记为 `style_reference`，用于生成官网模拟图和后续成站风格参考
- Mock 官网风格图生成
- 真实官网模拟图生成 Provider，可通过 `STYLE_IMAGE_PROVIDER=openai` 启用
- 风格收藏、设置主风格、下一批
- 模块化官网文案生成
- 真实模块化官网文案 Provider，可通过 `COPY_PROVIDER=openai` 启用
- 文案模块编辑、新增、删除、排序
- 选中文字锁定 / 标红
- 生成下一版文案
- 提交最终文案
- 自动生成 Codex 建站任务包
- 管理员查看官网任务、复制任务包、填写交付信息
- 客户结果页展示预览地址、截图、最终文案摘要

## 当前阶段没有实现

- 自动调用 Codex CLI
- 自动部署
- 支付系统
- 积分系统
- 模板商城
- 复杂用户系统
- 自动调用 Codex 从零写站

## 阶段 5 方向

- 服务器自动调用 Codex CLI
- 自动创建 workspace
- 自动复制模板
- 自动 `npm install` / `npm run build`
- 自动生成预览链接
- 自动截图
- 自动打包 ZIP
- 自动部署到 Cloudflare Pages / Vercel

## 交付自检规则

- `SITE_QUALITY_GATE_MODE` 默认保持 `off`，除非明确要求开启，不用自动质量门禁拦截客户任务。
- 交付、部署或排查明显版面问题时，Codex 可以按需打开助理浏览器进行截图目检，重点检查首屏、移动端、图片加载、文字遮挡、文字异常换行和按钮/表单状态。
- 助理浏览器截图自检属于人工验收辅助，不等同于自动拦截；发现明显硬伤时先反馈问题和截图结论，再决定是否重生成或修复。

## 安全提醒

- 不要提交 `.env`
- 不要提交 SQLite 数据库文件
- 不要公开客户上传素材
- 公开结果页不展示后台备注
- Codex 任务包明确要求不要编造客户没有提供的资质、案例、数据
