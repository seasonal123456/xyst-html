# Project Card Tool

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
