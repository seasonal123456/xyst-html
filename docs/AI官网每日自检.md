# AI 官网每日自检

用途：给新对话每天接手 AI 生成官网项目时使用。目标是先确认基础设施健康，再决定是否需要跑真实测试任务。

## 新对话启动提示词

把下面这段发给新对话即可：

```text
请先读取 D:\codex002\AGENTS.md 和 D:\codex002\开发总纲.md，然后进入 AI 官网项目：
D:\codex002\ai-image-mvp-stage1

请按 D:\codex002\ai-image-mvp-stage1\docs\AI官网每日自检.md 执行每日自检。
先运行不消耗制作次数的健康检查：
powershell -ExecutionPolicy Bypass -File D:\codex002\ai-image-mvp-stage1\scripts\daily-ai-site-health-check.ps1

如果 worker 未运行，可以再运行：
powershell -ExecutionPolicy Bypass -File D:\codex002\ai-image-mvp-stage1\scripts\daily-ai-site-health-check.ps1 -StartMissingWorker

请最后用简短中文汇报：worker 是否在线、public 是否可访问、local 是否可访问、ECS/PM2 是否正常、最近生产任务是否有卡住、是否需要我手动处理。
不要调用会消耗生图、文案、官网制作次数的接口，除非我明确要求陪跑真实任务。
```

## 一键检查命令

基础检查，不自动启动 worker：

```powershell
powershell -ExecutionPolicy Bypass -File D:\codex002\ai-image-mvp-stage1\scripts\daily-ai-site-health-check.ps1
```

如果希望发现 worker 没开时自动启动：

```powershell
powershell -ExecutionPolicy Bypass -File D:\codex002\ai-image-mvp-stage1\scripts\daily-ai-site-health-check.ps1 -StartMissingWorker
```

自动启动实际调用：

```powershell
D:\codex002\ai-image-mvp-stage1\scripts\start-site-worker.ps1
```

这个 launcher 会使用便携 Node 直接执行 `scripts/site-worker.ts`，并写入 `site-worker.current.log`、`site-worker.current.err.log` 和 `site-worker.current.pid`。日常只需要跑自检命令，不需要手动调用它。

如果要顺手检测鑫源/OpenAI 兼容接口的 `/models`：

```powershell
powershell -ExecutionPolicy Bypass -File D:\codex002\ai-image-mvp-stage1\scripts\daily-ai-site-health-check.ps1 -CheckModelApi
```

脚本默认不会发起生图、文案生成、官网生成，因此不会消耗制作次数。

## 每日必须看

1. 本机 worker 进程

正常：存在 `npm run worker:site` / `scripts/site-worker.ts` 进程。

异常：没有 worker 进程，或日志长期不更新。

处理：运行带 `-StartMissingWorker` 的自检脚本，或手动启动：

```powershell
cd D:\codex002\ai-image-mvp-stage1
powershell -ExecutionPolicy Bypass -File .\scripts\start-site-worker.ps1
```

2. Public 版本

正常：

- `https://xinyingst.com/` 可访问
- `https://xinyingst.com/site/start` 可访问
- `https://xinyingst.com/login` 可访问

异常：超时、502、404、证书错误。

处理：优先检查 ECS 安全组 80/443、Nginx、PM2、当前 release。

3. Local 版本

正常：

- `http://127.0.0.1:3000/` 可访问
- `http://127.0.0.1:3000/site/start` 可访问

异常：3000 未监听。

处理：如果当天需要 local 调试，再启动 Next；如果只服务 public worker，可以不强制启动 local 页面。

4. ECS 和 PM2

正常：

- SSH 可连
- `/opt/xinyingst/current` 指向当前 release
- PM2 里 `xinyingst-ai-site` 为 online

异常：SSH 不通、PM2 offline、current 指向异常 release。

处理：先只读检查，不要贸然重启；确认影响后再恢复稳定 release 或重启 PM2。

5. 最近生产任务

正常：

- 最近任务没有长期停在 `site_generation_queued` 或 `site_generating`
- `workerId` 与本机 worker 一致时，日志有心跳
- 完成任务回到 `client_preview` 或后续交付状态

异常：

- 长时间 `site_generating` 但本机无 `codex.exe`
- `workerLeaseUntil` 已过期但状态没有恢复
- 任务已失败但前端没有返还权益或没有明确错误

处理：先查看生产库状态和本机 `generated\codex-runs`，再决定是否重试或手动修正状态。

## 关键配置基线

每日看到这些配置应当符合预期：

```text
SITE_GENERATION_MODE=worker_queue
SITE_GENERATOR_PROVIDER=codex
WORKER_SERVER_BASE_URL=https://xinyingst.com
PUBLIC_SITE_BASE_URL=https://xinyingst.com
CODEX_SITE_MODEL=gpt-5.5
CODEX_SITE_TIMEOUT_MS=1500000
WORKER_LEASE_SECONDS=1500
STYLE_IMAGE_PROVIDER=openai
STYLE_IMAGE_MODEL=gpt-image-2
COPY_PROVIDER=openai
COPY_MODEL=gpt-5.5-high
```

不要在汇报里输出任何 API key、OSS secret、Netlify token、Supabase secret。

## 不能随便打的接口

以下接口可能消耗客户次数或真实 API 费用，每日自检不要随便调用：

- 风格图生成
- 文案生成
- 官网生成
- 交付包生成

如果需要真实陪跑，应先说明会消耗什么，再由用户确认。

worker claim 接口也不要手动乱调用，因为 claim 会改变任务状态。检查 worker 是否正常，应看 worker 进程、日志、生产任务状态和心跳。

## 正常汇报模板

```text
今日 AI 官网制作基础设施自检完成：

- worker：在线，监听 public
- public：可访问
- local：可访问 / 或今日未启动但不影响 public worker
- ECS：SSH 正常，PM2 online，current release 正常
- 最近任务：无卡住任务
- 模型接口：已跳过真实生成检查，未消耗次数

结论：可以正常接单。 
```

## 异常汇报模板

```text
今日 AI 官网制作基础设施自检发现阻碍：

- worker：未运行
- public：可访问
- local：未启动
- ECS：PM2 online
- 最近任务：有 1 个任务停在 site_generating

影响：public 前端可以打开，但官网生成任务无法被本机执行。

建议：先启动 worker；启动后复查生产任务是否被领取。如果任务已过租约，需要再判断是否重试或恢复状态。
```

## 真实陪跑入口

只有当用户明确要求“跑一条真实任务”时，再考虑真实流程：

```powershell
cd D:\codex002\ai-image-mvp-stage1
$env:Path = 'D:\codex002\tools\node-v24.16.0-win-x64;' + $env:Path
node scripts/e2e-site-flow.mjs
```

真实陪跑会触发真实接口和次数消耗。跑之前应确认当前目标是 public 还是 local，以及是否允许消耗生图/文案/官网制作次数。
