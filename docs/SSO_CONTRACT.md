# 项目推荐卡工具 SSO 接入契约

状态：工具侧已实现接收端，官网侧已完成最小接入。

## 目标

项目推荐卡工具不重复建设客户登录系统。客户先登录 AI 官网，再从会员中心进入工具。官网负责认证身份，工具负责校验一次性进入票据并创建自己的轻量会话。

## 已盘点的官网认证现状

只读盘点目录：`D:\codex002\ai-image-mvp-stage1`

相关模块：

- `src/lib/auth/customer-auth.ts`
- `src/lib/customers/customer-account-service.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/account/page.tsx`
- `prisma/schema.prisma`

现有数据模型：

- `CustomerAccount`
  - `id`
  - `email`
  - `name`
  - `credits`
  - `status`
- `CustomerSession`
  - `accountId`
  - `tokenHash`
  - `expiresAt`

现有登录状态：

- Cookie：`ai_site_customer_session`
- 获取当前客户：`getCurrentCustomer()`
- 会员中心未登录会跳转：`/login?next=/account`

## 推荐链路

```text
客户登录 AI 官网
  ↓
进入会员中心
  ↓
点击“项目推荐卡生成器”
  ↓
官网创建一次性 SSO ticket
  ↓
浏览器跳转到工具站：
    /?sso_ticket=...
  ↓
工具站调用自己的 /api/sso/exchange
  ↓
工具站校验 ticket 签名、有效期、受众和幂等
  ↓
工具站创建轻量会话
  ↓
客户开始生成推荐卡
```

## Ticket 格式

推荐使用 HMAC-SHA256 签名的 JSON payload，不把官网 session cookie 直接传给工具站。

跳转参数：

```text
sso_ticket=<base64url(payload)>.<base64url(signature)>
```

Payload 字段：

```json
{
  "iss": "ai-site",
  "aud": "project-card-tool",
  "jti": "一次性随机 ID",
  "iat": 1785859200,
  "exp": 1785859500,
  "customer": {
    "id": "官网 CustomerAccount.id",
    "email": "customer@example.com",
    "name": "王经理",
    "status": "active"
  },
  "company": {
    "id": "可选，公司权益 ID",
    "name": "演示公司",
    "inviteCode": "可选"
  },
  "entitlement": {
    "planType": "time_unlimited",
    "creditsRemaining": 20,
    "validUntil": "2026-08-27"
  }
}
```

字段说明：

- `iss` 必须为 `ai-site`
- `aud` 必须为 `project-card-tool`
- `jti` 必须一次性使用，工具侧应记录已使用 ticket，防重放
- `iat` 签发时间，Unix 秒
- `exp` 过期时间，建议 5 分钟内
- `customer.id` 是员工生成记录归属主键
- `company` 是公司权益归属
- `entitlement` 用于工具侧本次会话初始化

## 工具侧接口

### POST `/api/sso/exchange`

请求：

```json
{
  "ticket": "<sso_ticket>"
}
```

成功响应：

```json
{
  "ok": true,
  "session": {
    "userId": "官网 CustomerAccount.id",
    "name": "王经理",
    "email": "customer@example.com",
    "companyId": "company_xxx",
    "companyName": "演示公司",
    "planType": "time_unlimited",
    "creditsRemaining": 20,
    "validUntil": "2026-08-27"
  }
}
```

失败响应：

```json
{
  "ok": false,
  "error": "SSO ticket 已过期或无效。"
}
```

推荐错误码：

- `400` 缺少 ticket 或格式错误
- `401` 签名错误、过期、受众错误、账号停用
- `409` ticket 重放
- `500` 工具侧内部错误

## 官网侧已新增接口

```text
POST /api/project-card/sso-ticket
```

行为：

1. 调用 `getCurrentCustomer()`
2. 未登录返回 `401`
3. 已登录则生成一次性 ticket
4. 返回工具跳转 URL

响应：

```json
{
  "success": true,
  "url": "https://tool-domain.example/?sso_ticket=..."
}
```

## 共享密钥

两边使用独立环境变量，不写入代码：

```text
PROJECT_CARD_SSO_SECRET
```

要求：

- 至少 32 字节随机值
- 官网和工具一致
- 不进入前端
- 不进入日志
- 更换时可短期支持双密钥

## 权益策略

第一版建议工具侧以 ticket 中的 entitlement 初始化公司权益。

后续正式化时可改为：

- 官网维护会员登录和基础账号
- 工具维护公司权益和生成记录
- 官网 ticket 只传客户身份
- 工具根据 `customer.id` 或 `company.id` 查自己的权益库

## 本阶段边界

本阶段已完成：

- 在 `project-card-tool` 内维护 `/api/sso/exchange`
- 在 `project-card-tool` 内维护 ticket 校验和本地会话初始化
- 在 `ai-image-mvp-stage1` 内新增 `/api/project-card/sso-ticket`
- 在会员中心新增“项目推荐卡生成器”入口按钮
- 仅在本地开发环境保留 demo session，作为无官网联调时的 fallback；生产环境默认关闭

本阶段不做：

- 不修改官网数据库
- 不新增官网迁移
- 不改官网登录 cookie
- 不改官网部署进程、端口、Nginx 或环境变量

## 验收标准

- 本地开发环境无 ticket 时，可按配置开启 demo 模式测试
- 生产环境无 ticket 或无工具会话 token 时，不能生成推荐卡
- 有合法 ticket 时，工具能初始化用户、公司和权益
- ticket 过期或签名错误时，工具拒绝
- 同一个 `jti` 不能重复使用
- 工具前端不接触 `PROJECT_CARD_SSO_SECRET`
- 生成记录可归属到 SSO 用户
- 生产环境生成码查询默认需要当前账号会话，只允许查看当前账号/公司可见记录
