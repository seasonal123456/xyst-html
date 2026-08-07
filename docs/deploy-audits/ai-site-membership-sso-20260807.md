# AI 官网会员系统 SSO 接入审计 - 2026-08-07

## 目标

让已登录 `xinyingst.com` 的会员从会员中心进入产业园项目推荐卡生成器，并将员工身份、公司权益和个人生成记录关联到同一会员账号。

## 生产变更

- 以原生产 release `/opt/xinyingst/releases/20260727-style-image-parallel-only` 为基线创建新 release。
- 新 release：`/opt/xinyingst/releases/20260807-project-card-sso-r1`。
- 新增 `POST /api/project-card/sso-ticket`。
- 会员中心新增“项目推荐卡生成器”入口。
- 官网与推荐卡工具通过 HMAC SHA-256 一次性 ticket 交换登录态。
- ticket 默认 300 秒有效，工具侧记录 `jti` 防止重放。
- 默认映射为 30 天 `time_unlimited` 公司权益。
- 未修改推荐卡工具 Nginx、systemd、图片 API 配置或客户数据结构。
- 未修改飞书 Codex 服务。

## 配置边界

官网新增以下环境变量：

```text
PROJECT_CARD_TOOL_URL
PROJECT_CARD_SSO_SECRET
PROJECT_CARD_SSO_TTL_SECONDS
PROJECT_CARD_ENTITLEMENT_DAYS
```

共享密钥仅在 ECS 私密环境文件之间进行服务器侧复制，未写入源码、审计文档、Git 或本地备份。

## 验收结果

- Next.js 生产构建成功，TypeScript 检查通过。
- 3002 灰度实例核心页面均返回 200。
- 未登录调用 SSO ticket 接口返回 401。
- 会员中心显示“项目推荐卡生成器”按钮。
- 点击按钮后官网签发 ticket，推荐卡工具成功交换会话。
- 工具地址栏在交换后自动移除 `sso_ticket`。
- 会员映射为独立 `userId`、`companyId` 和 `time_unlimited` 权益。
- 通过生产 Image 2 链路真实生成一张推荐卡，图片返回 200。
- E2E 临时会员、会话、测试图片、元数据和索引记录均已删除；复查登录为 401、图片为 404。
- 官网首页、登录、注册和推荐卡工具均返回 200。
- `project-card-tool.service`、`feishu-codex.service` 和 PM2 `xinyingst-ai-site` 均在线。

## 备份与回滚

- 官网环境备份：`/opt/xinyingst/backups/ai-site.env.before-project-card-sso.20260807-184742`。
- PM2 备份时间戳：`20260807-185537`。
- 回滚 release：`/opt/xinyingst/releases/20260727-style-image-parallel-only`。
- 本地脱敏备份：`D:\codex002\backups\chanyeyuan-card20260807会员系统接入上线`。

回滚时切回旧 release，重建 PM2 `xinyingst-ai-site` 进程即可；推荐卡工具服务无需变更。

## 运维提醒

`card.xinyingst.com` 的 Let's Encrypt 证书有效期至 `2026-11-05`。ECS 直接访问 ACME 服务曾受限，自动续期需要在到期前单独监控和验证。
