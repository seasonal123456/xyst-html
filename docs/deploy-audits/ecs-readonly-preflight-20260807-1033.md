# 项目推荐卡工具 ECS 只读盘点

时间：2026-08-07 10:33 Asia/Shanghai

范围：只读盘点阿里云 ECS 现状，为 `project-card-tool` 独立上线做边界判断。未上传文件、未创建目录、未修改 Nginx、未重启服务、未改 DNS、未申请证书、未读私钥内容、未读取生产 `.env` 密钥值。

## ECS 基础信息

- 公网 IP：`8.138.148.34`
- 系统：Ubuntu 22.04.5 LTS
- Kernel：`5.15.0-181-generic`
- Node：`v22.23.1`
- npm：`10.9.8`
- Nginx：`1.18.0`，active
- Certbot：`1.21.0`
- 磁盘：40G 总量，已用约 31G，可用约 6.9G，使用率约 82%
- 内存：1.6GiB，总可用约 790MiB，Swap 2.0GiB 未使用

## 当前监听端口

- `127.0.0.1:3000`：AI 官网 Next.js，PM2 进程 `xinyingst-ai-site`
- `127.0.0.1:8765`：Feishu Codex API，systemd 服务 `feishu-codex`
- `0.0.0.0:80` / `0.0.0.0:443`：Nginx
- `0.0.0.0:22`：SSH

## 已有项目边界

AI 官网制作项目：

- 目录：`/opt/xinyingst`
- 当前 symlink：`/opt/xinyingst/current`
- PM2：`xinyingst-ai-site`
- 本机端口：`127.0.0.1:3000`
- Nginx 站点：`/etc/nginx/sites-available/xinyingst`
- 域名：`xinyingst.com`、`www.xinyingst.com`
- HTTPS 证书：`/etc/letsencrypt/live/xinyingst.com`

Feishu Codex：

- 目录：`/opt/feishu-codex`
- env 目录：`/etc/feishu-codex`
- 数据目录：`/var/lib/feishu-codex`
- 日志目录：`/var/log/feishu-codex`
- systemd：`feishu-codex.service`
- 本机端口：`127.0.0.1:8765`
- Nginx 站点：`/etc/nginx/conf.d/feishu-codex.conf`
- 域名：`bridge.xinyingst.com`
- HTTPS 证书：`/etc/letsencrypt/live/bridge.xinyingst.com`

## 项目推荐卡目标资源现状

以下目标路径当前不存在，可作为独立部署边界：

- `/opt/project-card-tool`
- `/etc/project-card-tool`
- `/var/lib/project-card-tool`
- `/var/log/project-card-tool`

以下候选子域名当前本地 DNS 查询未返回解析记录：

- `card.xinyingst.com`
- `project-card.xinyingst.com`
- `tool.xinyingst.com`

## Nginx 现状

- `xinyingst.com` / `www.xinyingst.com` 反代到 `127.0.0.1:3000`
- `bridge.xinyingst.com` 静态托管 PWA，并将 `/api/` 反代到 `127.0.0.1:8765/api/`
- `nginx -t` 只读检查通过
- 默认站点仍将未知 HTTP Host 反代到 `127.0.0.1:3000`

## 风险判断

- 磁盘余量只有约 6.9G。项目推荐卡会持续生成 PNG，若先放本机磁盘，需要上线前设置容量预警、清理策略或尽快接入 OSS。
- 不能复用 `/opt/xinyingst`、PM2 `xinyingst-ai-site`、`127.0.0.1:3000`、旧站 Nginx server block、旧站 SQLite 或旧站 OSS prefix。
- 不能复用 `/opt/feishu-codex`、`127.0.0.1:8765`、`bridge.xinyingst.com` 或 `feishu-codex.service`。
- 生产环境必须使用独立 env 文件，并且 `PROJECT_CARD_SSO_SECRET` 要与官网侧一致；不得写入源码、README、审计报告或包内。

## 推荐部署边界

建议生产入口：

- 域名：`card.xinyingst.com`
- 本机服务端口：`127.0.0.1:8773`
- 服务名：`project-card-tool.service`
- Linux 用户：`projectcard`
- 代码目录：`/opt/project-card-tool/releases/<release-id>`
- 当前版本软链：`/opt/project-card-tool/current`
- env 文件：`/etc/project-card-tool/project-card-tool.env`
- 数据目录：`/var/lib/project-card-tool/generated`
- 日志目录：`/var/log/project-card-tool`
- Nginx 配置：`/etc/nginx/conf.d/project-card-tool.conf`

推荐 Nginx 行为：

- HTTP 80：保留 ACME challenge，其余跳转 HTTPS
- HTTPS 443：反代到 `http://127.0.0.1:8773`
- `client_max_body_size 12m`，对应前端 8MB 单图和 JSON 开销
- `proxy_read_timeout` 至少 420s，给 Image 2 慢生成留空间

## 下一步审批点

继续上线前需要用户逐步确认：

1. 是否采用 `card.xinyingst.com` 作为公开入口。
2. 是否允许在阿里云 DNS 新增 `card.xinyingst.com -> 8.138.148.34` 的 A 记录。
3. 是否允许在 ECS 创建独立用户、目录、env 文件、systemd 服务和 Nginx 配置。
4. 是否先用本机磁盘存生成图，还是上线前先接独立 OSS prefix。
5. 是否允许修改 AI 官网生产 `.env`，加入 `PROJECT_CARD_TOOL_URL` 与共享 SSO secret，让官网会员中心跳转到公网工具。

