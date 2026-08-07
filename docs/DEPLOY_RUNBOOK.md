# 生产部署 Runbook

目标边界：

- 域名：`card.xinyingst.com`
- Node：`127.0.0.1:8773`
- 服务：`project-card-tool.service`
- 代码：`/opt/project-card-tool/releases/<release-id>`
- 当前版本：`/opt/project-card-tool/current`
- 私密配置：`/etc/project-card-tool/project-card-tool.env`
- 数据：`/var/lib/project-card-tool`
- 日志：`/var/log/project-card-tool`
- Nginx：`/etc/nginx/conf.d/project-card-tool.conf`

上述资源均为本工具独立资源，不得复用或覆盖 AI 官网与 Feishu Codex 的目录、端口、服务、配置和数据。

## 发布顺序

1. 重新执行 ECS 只读盘点，确认 `8773` 未被其他服务占用，旧站 `3000` 和 Feishu Codex `8765` 正常。
2. 上传干净 release zip 和 `scripts/deploy/install-release.sh` 到 ECS 临时目录。
3. 以 root 运行安装脚本。首次运行只创建独立用户、目录、release 和 env 模板，然后停止。
4. 通过 `scripts/deploy/configure-production-env.py` 的标准输入写入生图地址和密钥；脚本自动生成 SSO 密钥，并保持权限 `0640 root:projectcard`。不要把秘密放进命令行参数、代码或部署包。
5. 再次运行安装脚本，启动 `project-card-tool.service`，要求本机 `/api/ready` 返回 `ok: true`。
6. 新增 DNS A 记录：`card.xinyingst.com -> 8.138.148.34`。
7. 安装独立 Nginx 配置，执行 `nginx -t` 后 reload。
8. DNS 生效后使用 Certbot 为 `card.xinyingst.com` 申请 HTTPS，并再次执行 `nginx -t`。
9. 运行 `scripts/deploy/verify-production.sh https://card.xinyingst.com`。
10. 工具公网验收通过后，另行审批 AI 官网的 SSO 生产接入；这一步会触碰旧官网边界，不与工具首发部署混做。

## 发布命令形态

```bash
bash /tmp/install-project-card-tool.sh /tmp/project-card-tool-release.zip <release-id>
```

首次执行返回状态码 `2` 表示 env 模板已创建、等待填写，并非服务故障。完成 env 后原命令再次执行即可。

## 回滚

安装脚本在新版本未通过 `/api/ready` 时，会自动把 `current` 指回上一 release 并重启服务。

需要人工指定回滚时：

```bash
bash /opt/project-card-tool/current/scripts/deploy/rollback-release.sh <旧release-id>
```

回滚只切换代码软链，不删除 release，不修改 `/var/lib/project-card-tool` 中的生成记录。

## 验收门禁

- `systemctl is-active project-card-tool.service`
- `ss -ltn` 仅看到 `127.0.0.1:8773`
- `curl http://127.0.0.1:8773/api/ready` 返回 `ok: true`
- `nginx -t` 通过
- `https://card.xinyingst.com/api/ready` 返回 `ok: true`
- 旧官网 `xinyingst.com` 和 `bridge.xinyingst.com` 保持正常
- 生成图片可展示，旁边 `.json` 元数据公网访问返回 `403`
