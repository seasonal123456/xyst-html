# Project Card Tool

## 交接总览

项目名称：

产业园项目推荐卡生成器。

技术栈：

- 前端：原生 HTML / CSS / JavaScript，手机端优先，无构建步骤。
- 服务端：Node.js 原生 HTTP 服务，负责 SSO 会话、真实生图接口调用、图片落盘和生成记录归档。
- 生图能力：兼容 OpenAI Images API 风格的 Image 2 接口，模型默认 `gpt-image-2`。
- 当前数据层：文件型轻量归档，使用 JSON 元数据和 PNG 文件保存生成结果；第一版未接入 MySQL / PostgreSQL / SQLite。
- 官网接入：AI 官网会员中心签发一次性 SSO ticket，工具侧交换为轻量 session。

启动方式：

本地完整联调推荐使用：

```powershell
$env:IMAGE_API_BASE_URL="https://你的生图接口地址/v1"
$env:IMAGE_API_KEY="你的 API Key"
powershell -ExecutionPolicy Bypass -File "D:\codex002\project-card-tool\scripts\start-local-sso-stack.ps1" -StopExisting
```

启动后访问：

```text
工具页：http://127.0.0.1:4173/
官网会员入口：http://127.0.0.1:3001/account
```

只启动工具服务：

```powershell
$env:IMAGE_API_BASE_URL="https://你的生图接口地址/v1"
$env:IMAGE_API_KEY="你的 API Key"
$env:IMAGE_API_MODEL="gpt-image-2"
powershell -ExecutionPolicy Bypass -File "D:\codex002\project-card-tool\start-real-api-server.ps1"
```

需要配置：

见下方“环境变量清单”。生产环境至少需要配置 SSO 密钥、生图接口地址和生图接口密钥。

## 环境变量清单

- `PORT`：工具服务端口，本地默认 `4173`，生产建议使用独立内网端口。
- `HOST`：监听地址，默认 `127.0.0.1`；生产保持该值，由 Nginx 对外提供 HTTPS。
- `PROJECT_CARD_ENV`：运行环境；生产设置为 `production`。
- `PROJECT_CARD_DATA_DIR`：运行数据根目录；生产建议 `/var/lib/project-card-tool`，其中会保存 SSO 防重放记录和生成图目录。
- `PROJECT_CARD_STORAGE_DIR`：生成图片和追溯索引目录；不配置时默认使用 `${PROJECT_CARD_DATA_DIR}/generated`。
- `PROJECT_CARD_LOG_DIR`：服务日志目录；生产建议 `/var/log/project-card-tool`。
- `PROJECT_CARD_TMP_DIR`：生图接口临时请求目录；生产建议 `/var/lib/project-card-tool/tmp`。
- `PROJECT_CARD_SSO_SECRET`：官网和工具共同持有的 SSO 签名密钥，生产必填，不进入前端和仓库。
- `PROJECT_CARD_SSO_ISSUER`：SSO 签发方，默认 `ai-site`。
- `PROJECT_CARD_SSO_AUDIENCE`：SSO 受众，默认 `project-card-tool`。
- `IMAGE_API_BASE_URL`：生图接口 Base URL，生产必填，通常以 `/v1` 结尾。
- `IMAGE_API_KEY`：生图接口密钥，生产必填，只允许通过环境变量或服务器私密 env 文件注入。
- `IMAGE_API_MODEL`：生图模型，默认 `gpt-image-2`。
- `IMAGE_API_REQUEST_TIMEOUT_MS`：生图请求超时时间，默认 `260000`。
- `IMAGE_API_RETRY_COUNT`：真实生图重试次数，默认 `3`，范围 `1-3`。
- `PROJECT_CARD_ALLOW_DEMO_SESSION`：仅开发环境可用；设为 `false` 可关闭 demo session。
- `PROJECT_CARD_ADMIN_ENABLED`：仅开发环境可用；设为 `true` 才打开工具内管理台。
- `PROJECT_CARD_PUBLIC_TRACE_LOOKUP`：生产默认不公开生成码裸查；除非明确需要，否则不要设为 `true`。

部署：

见下方“部署说明”。

## 部署说明

推荐生产边界如下：

- 独立域名：`card.xinyingst.com`。
- 独立服务端口：`127.0.0.1:8773`。
- 独立代码目录：`/opt/project-card-tool/releases/<release>`，通过 `/opt/project-card-tool/current` 指向当前版本。
- 独立环境变量文件：`/etc/project-card-tool/project-card-tool.env`。
- 独立运行数据目录：`/var/lib/project-card-tool`，生成图片位于 `/var/lib/project-card-tool/generated`。
- 独立日志目录：`/var/log/project-card-tool`。
- 独立 systemd 服务：`project-card-tool.service`。
- 独立 Nginx 配置：`/etc/nginx/conf.d/project-card-tool.conf`。

仓库内已提供生产部署模板和脚本：

- `deploy/project-card-tool.env.example`
- `deploy/project-card-tool.service`
- `deploy/nginx-project-card-tool-http.conf`
- `scripts/deploy/install-release.sh`
- `scripts/deploy/configure-production-env.py`
- `scripts/deploy/rollback-release.sh`
- `scripts/deploy/verify-production.sh`

脚本只使用上述独立边界。真正执行前仍需先恢复 ECS 登录，并按《开发总纲》逐步确认创建目录、写入 env、启动 systemd、配置 Nginx 和证书等生产变更。

生产部署前必须先做只读盘点，再逐步执行：创建独立目录和用户、上传 release 包、写入私密 env、创建 systemd、创建 Nginx server block、申请 HTTPS 证书、检查 `/api/ready`。不得复用或覆盖 AI 官网、飞书 Codex 等旧项目的目录、端口、Nginx 配置、进程名、数据库或环境变量。

## 项目代码

核心代码位于 `D:\codex002\project-card-tool`：

- `index.html`：客户侧手机端页面结构。
- `styles.css`：客户侧移动端 UI 和推荐卡工作台视觉样式。
- `app.js`：前端交互、文本整理、图片上传限制、SSO exchange、生成调用和“我的生成”展示。
- `server.js`：Node 服务端，包含静态文件服务、SSO 校验、生成接口、Image 2 调用、生成记录和追溯接口。
- `scripts/start-local-sso-stack.ps1`：本地同时启动官网和工具，用于完整 SSO 联调。
- `scripts/smoke-local-api.ps1`：不消耗生图额度的本地 smoke 检查。
- `start-real-api-server.ps1`：只启动工具服务并接入真实生图接口。
- `docs/SSO_CONTRACT.md`：官网会员 SSO 接入契约。
- `docs/ACCEPTANCE.md`：MVP 验收清单。
- `docs/deploy-audits/ecs-readonly-preflight-20260807-1033.md`：ECS 上线前只读盘点报告。

## 数据库结构

当前第一版没有接入传统数据库，使用本地文件归档作为轻量数据层。本地默认运行数据保存在：

```text
D:\codex002\project-card-tool\storage
```

生产环境建议设置：

```text
PROJECT_CARD_DATA_DIR=/var/lib/project-card-tool
```

设置后，生成图片、追溯索引和 SSO 防重放记录都会放在 release 目录之外，发版和回滚时不会覆盖运行数据。

### 1. 生成图片

路径：

```text
storage/generated/YYYYMMDD/*.png
```

用途：

- 保存 Image 2 返回的项目推荐卡图片。
- 前端通过返回的 `imageUrl` 预览图片。

### 2. 单卡元数据

路径：

```text
storage/generated/YYYYMMDD/*.json
```

结构：

```json
{
  "traceCode": "PC-xxxx",
  "projectName": "项目名，可为空",
  "model": "gpt-image-2",
  "endpoint": "configured-image-api",
  "prompt": "本次生图提示词快照",
  "payload": {
    "sourceText": "用户提交的项目文案",
    "contactName": "联系人，可为空",
    "contactPhone": "联系电话，可为空",
    "colorPreset": "配色方案",
    "styleIntensity": "精致"
  },
  "context": {
    "user": {
      "id": "website:官网用户ID",
      "externalCustomerId": "官网用户ID",
      "name": "员工姓名",
      "email": "员工邮箱",
      "authSource": "website_sso"
    },
    "company": {
      "id": "公司ID",
      "name": "公司名",
      "planType": "权益类型",
      "validUntil": "有效期"
    }
  },
  "createdAt": "2026-08-07T00:00:00.000Z"
}
```

说明：

- `.json` 元数据只供服务端追溯和管理员排查，不通过静态文件公开访问。
- 生成码只进入系统记录，不显示在生成图片中。
- 元数据不保存 API Key。

### 3. 脱敏追溯索引

路径：

```text
storage/generated/trace-index.json
```

结构：

```json
{
  "version": 1,
  "updatedAt": "2026-08-07T00:00:00.000Z",
  "cards": [
    {
      "traceCode": "PC-xxxx",
      "projectName": "项目名，可为空",
      "createdAt": "2026-08-07T00:00:00.000Z",
      "imageUrl": "/storage/generated/YYYYMMDD/example.png",
      "context": {
        "user": {},
        "company": {}
      },
      "payload": {
        "colorPreset": "白金",
        "styleIntensity": "精致"
      }
    }
  ]
}
```

说明：

- 用于加速“我的生成”和生成码追溯。
- 不保存原始项目文案、联系人、联系电话和完整 prompt。
- 静态访问返回 `403`，只能通过服务端接口读取脱敏摘要。

### 4. SSO 防重放记录

路径：

```text
storage/sso-used-jti.json
```

结构：

```json
{
  "一次性jti": 1785859500
}
```

说明：

- 记录已使用过的 SSO ticket ID，避免同一 ticket 被重复交换。
- key 为 ticket `jti`，value 为过期时间戳。

长期运营建议：

- 公司、员工、权益、批次、生成记录、用量流水、管理员审计迁移到 SQLite 或 PostgreSQL。
- 图片和用户上传素材迁移到独立 OSS bucket / prefix。
- 运行数据目录放在 release 目录之外，避免发版覆盖。

独立项目推荐卡工具 MVP。当前版本是手机端优先的零构建前端 + 本地轻量 Node 服务，用于验证“官网会员进入后，粘贴项目资料，生成招商推荐卡”的真实闭环。

## 当前主流程

客户侧手机页面只保留轻量链路：

1. 从官网会员入口进入工具
2. 粘贴项目说明文本
3. 可选填写联系人、联系电话
4. 可选上传 1 张展示图片，单张原图不超过 8MB
5. 在 12 套配色中选择一套
6. 点击“整理资料”
7. 点击“开始生成”
8. 页面展示生成结果
9. 员工可在“我的生成”查看历史记录
10. 系统记录生成码，可在管理端溯源；生成码不显示在推荐卡图片中

当前文本整理只做轻量辅助，不设置必填字段。用户粘贴什么文案，系统就按这段文案生成项目推荐卡；项目名、面积、价格、用电量、通勤距离、生活配套等信息都不是必填项。

如果文案里包含明确的项目名、面积、租金、用电量、区位、交通或配套信息，系统会尽量提取为生成辅助；如果没有，就直接按原文主题和表达方向生成图片。

联系人、联系电话是可选填写项；填写后可作为推荐卡上的联系信息交给生图模型处理，不填写则不出现。

展示图片不是必填项，当前轻量版每次最多上传 1 张，单张原图不超过 8MB。不上传时，系统会让生图模型使用默认产业园画面生成。

生成风格采用“单一主卖点 + 克制高级 + 大留白”的方向，前端提供 12 套配色按钮。默认配色为白金；同一批次内所有推荐卡保持同一配色，单张重生成会沿用原卡配色。

## 使用方式

### 仅前端预览

```powershell
powershell -ExecutionPolicy Bypass -File "D:\codex002\project-card-tool\serve-static.ps1"
```

然后打开：

```text
http://localhost:4173/
```

### 真实生图试用

不要把 API Key 写进代码、README、提交记录或截图。

推荐启动方式：

```powershell
$env:IMAGE_API_BASE_URL="https://你的生图接口地址/v1"
$env:IMAGE_API_KEY="你的 API Key"
$env:IMAGE_API_MODEL="gpt-image-2"
powershell -ExecutionPolicy Bypass -File "D:\codex002\project-card-tool\start-real-api-server.ps1"
```

如果未提前设置 `IMAGE_API_BASE_URL` 或 `IMAGE_API_KEY`，启动脚本会提示临时输入，不会写入文件。

真实生成图片会保存到：

```text
D:\codex002\project-card-tool\storage\generated
```

每张图片旁边会生成 `.json` 元数据，包含生成码、模型、提示词和来源资料快照；如果用户提供了项目名，也会记录项目名。

本机 Node 访问部分中转站时可能出现连接超时。服务端已设置 IPv4 优先，并在 Node `fetch` 失败时自动使用 PowerShell HTTP fallback 继续调用真实接口。

本机联调已确认：部分中转站对 Node / PowerShell 的 TLS 或中文 JSON 处理不稳定。当前真实生图调用链路为：

```text
Node fetch
  ↓ 失败后
curl.exe
  ↓ 失败后
Windows PowerShell HTTP fallback
```

服务端向生图接口发送请求时，会把 JSON 转为 ASCII-safe 形式，避免中文、`㎡` 等字符在中转链路中被错误解析。curl fallback 只短暂写入不含密钥的请求体临时文件，调用后立即删除；API Key 仍只来自进程环境变量。

生成成功后，服务端还会维护一份脱敏归档索引：

```text
D:\codex002\project-card-tool\storage\generated\trace-index.json
```

索引只用于加速“我的生成”和生成码追溯，不保存原始文案、联系人或联系电话；该索引与单张图片 `.json` 元数据一样，不通过静态文件服务公开访问。

### 生成码追溯

每次真实生成都会写入本地元数据，包含：

- 生成码
- 图片路径
- 创建时间
- 模型
- 当前官网会员 / 公司权益上下文
- 生成 payload 摘要

可用生成码查询公开摘要：

```text
GET /api/trace-card?code=PC-xxxx
```

当前会员的服务端归档列表：

```text
POST /api/my-cards
```

前端“我的生成”会优先显示浏览器本地记录；如果本地没有记录，会按当前官网会员/公司上下文读取服务端归档摘要，便于换设备或清理浏览器后找回生成图片。

接口不会直接返回完整原始文案和 prompt；完整信息保留在图片同目录 `.json` 元数据中，供管理员本机排查。

出于客户资料保护，`storage/generated/**/*.json` 不通过静态文件服务公开访问；前端和管理端需要通过 `/api/trace-card` 查询脱敏摘要。

### 本地 smoke 检查

不消耗生图额度的本地检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\codex002\project-card-tool\scripts\smoke-local-api.ps1"
```

检查范围：

- 健康接口
- 官网注册临时 smoke 会员、签发 SSO ticket、交换工具会话 token
- 客户页联系人 / 联系电话字段
- 客户页 12 色配色按钮
- 生图等待阶段提示
- 生成码追溯
- 我的生成服务端归档鉴权
- `trace-index.json` 静态访问 403
- 单张图片 `.json` 元数据静态访问 403
- `/api/ready` 上线门禁
- 客户端不包含固定管理口令

### 上线运行门禁

生产环境启动前必须设置：

```powershell
$env:PROJECT_CARD_ENV="production"
$env:PROJECT_CARD_SSO_SECRET="官网与工具共同持有的随机密钥"
$env:IMAGE_API_BASE_URL="https://你的生图接口地址/v1"
$env:IMAGE_API_KEY="你的 API Key"
$env:IMAGE_API_MODEL="gpt-image-2"
```

生产模式下，如果缺少 `PROJECT_CARD_SSO_SECRET`、`IMAGE_API_BASE_URL` 或 `IMAGE_API_KEY`，工具服务会拒绝启动，避免出现“页面可打开但无法真实交付”的假上线。

切流前检查：

```text
GET /api/ready
```

要求返回 `ok: true`。该接口只返回配置状态和存储可写状态，不返回密钥、供应商地址或供应商品牌。

公开配置：

```text
GET /api/config
```

前端用它判断是否允许本地 demo session、是否显示管理端、是否配置了生图能力。该接口同样不返回密钥或供应商信息。

生产环境默认策略：

- 关闭本地 demo session
- 关闭工具内管理台
- 生成码查询默认要求当前账号会话
- 客户只能从官网会员中心进入并生成

## 客户侧界面范围

当前客户侧隐藏：

- 示例区
- 演示公司权益卡
- 生成规则说明卡
- 管理入口

底部导航只保留：

- 工作台
- 我的生成

## 官网会员接入

正式产品不在工具站内重复建设员工登录和注册。推荐流程：

```text
官网会员登录
  ↓
会员中心点击项目推荐卡工具
  ↓
官网签发一次性 SSO ticket
  ↓
工具站校验 ticket
  ↓
工具站创建自己的轻量 session
  ↓
用户继承公司权益
```

工具侧已实现接收端：

```text
POST /api/sso/exchange
```

交换成功后，工具服务会返回 `sessionToken`。客户前端调用以下接口时必须携带：

```text
X-Project-Card-Session: <sessionToken>
```

需要会话 token 的接口：

- `POST /api/generate-card`
- `POST /api/my-cards`

这样即使有人绕过前端直接请求生成接口，也不能伪造会员上下文消耗生图额度。

启动工具服务时增加：

```powershell
$env:PROJECT_CARD_SSO_SECRET="官网与工具共同持有的随机密钥"
```

接口契约见：

```text
D:\codex002\project-card-tool\docs\SSO_CONTRACT.md
```

当前边界：

- 无 `sso_ticket` 时，仍保留本地 demo 会员，方便开发验证
- 有合法 `sso_ticket` 时，工具会初始化官网会员、公司权益和当前会话
- 有无效或过期 `sso_ticket` 时，工具拒绝并提示从官网重新进入
- 已使用过的 `jti` 会记录到 `storage\sso-used-jti.json`，用于防重放

这一步会触碰现有 AI 官网项目边界，必须先确认接口方案、影响范围和回滚方式，再修改官网项目。

## 管理端范围

第一版只做平台管理员能力：

- 创建公司
- 配置权益：生成次数 / 30 天内免费使用
- 查看员工生成记录
- 输入生成码溯源
- 停用公司权益

当前公开试用版默认关闭工具内管理台，只保留客户生成链路和“我的生成”。正式上线后的管理端建议拆为独立后台路由或后台项目，并迁移到服务端管理员鉴权、操作审计和权限控制。

## 边界说明

本项目不复用 AI 官网项目的数据库、OSS prefix、端口、PM2、worker secret 或业务表。

真正接入官网 SSO ticket、部署到 ECS、配置域名或接入 OSS 前，需要先做只读盘点，并获得明确确认。
