# 项目推荐卡工具 ECS 部署阶段 1 记录

时间：2026-08-07 Asia/Shanghai

状态：工具服务与 HTTP Nginx 入口已部署，等待 DNS 与 HTTPS。未修改 AI 官网代码、生产 env、PM2 配置、数据库或 Feishu Codex 配置。

## 已执行变更

- 使用既有 ECS SSH 运维密钥登录 `8.138.148.34`。
- 创建独立系统用户：`projectcard`。
- 上传并解压 release：`/opt/project-card-tool/releases/20260807-deploy-ready-r2`。
- 创建软链：`/opt/project-card-tool/current`。
- 创建私密配置：`/etc/project-card-tool/project-card-tool.env`，权限 `0640 root:projectcard`。
- 创建运行数据：`/var/lib/project-card-tool`，包含 `generated` 与 `tmp`。
- 创建日志目录：`/var/log/project-card-tool`。
- 创建并启用：`project-card-tool.service`。
- 新增 Nginx 配置：`/etc/nginx/conf.d/project-card-tool.conf`。
- Nginx 语法检查通过并 reload。

## 验收结果

- `project-card-tool.service`：`active`、`enabled`。
- 运行用户：`projectcard`。
- 监听：`127.0.0.1:8773`，未对公网直接开放 Node 端口。
- `GET http://127.0.0.1:8773/api/ready`：`ok: true`。
- 生产 demo session：关闭。
- 工具内管理端：关闭。
- 生图配置：已配置，未在记录中保存供应商地址或密钥。
- SSO 配置：已配置，密钥仅保存在服务器私密 env。
- 生成元数据静态访问：`403`。
- 使用本机 Host 解析测试 Nginx：`card.xinyingst.com` HTTP 入口可反代到工具 readiness。
- 旧官网 `xinyingst.com`、登录页与 `bridge.xinyingst.com` 均保持 `HTTP 200`。
- AI 官网 PM2 `xinyingst-ai-site` 与 `feishu-codex.service` 保持在线。

## 尚未执行

- `card.xinyingst.com` 尚无 DNS A 记录。
- 尚未为 `card.xinyingst.com` 申请 HTTPS 证书。
- 尚未修改 AI 官网生产配置接入项目推荐卡 SSO 入口。
- 尚未执行公网真实生图端到端验收。

## 回滚

如需停止新工具，不影响旧项目：

```bash
systemctl disable --now project-card-tool.service
mv /etc/nginx/conf.d/project-card-tool.conf /etc/nginx/conf.d/project-card-tool.conf.disabled-<timestamp>
nginx -t && systemctl reload nginx
```

release、env、数据和日志默认保留，避免误删生成记录。需要删除时必须另行审批并先备份。

## 下一审批点

1. 在阿里云 DNS 新增 `card.xinyingst.com -> 8.138.148.34`。
2. DNS 生效后申请 HTTPS 并做公网验收。
3. 工具公网通过后，单独审批修改 AI 官网生产 env 与重启 PM2，实现会员中心 SSO 跳转。
