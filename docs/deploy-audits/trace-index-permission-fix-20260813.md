# 推荐卡索引权限修复 - 2026-08-13

## 故障

真实图片已由 `gpt-image-2` 生成并保存，但服务在归档时返回：

```text
EACCES: permission denied, open '/var/lib/project-card-tool/generated/trace-index.json'
```

## 根因

`project-card-tool.service` 使用 `projectcard:projectcard` 运行，而此前 E2E 清理脚本以 root 身份原子替换了 `trace-index.json`，导致文件属主变成 `root:root`、权限为 `0640`。服务可以创建图片和元数据，但无法更新索引。

## 修复

- 将生产索引恢复为 `projectcard:projectcard`、`0640`。
- 从已有元数据重建索引，补回故障期间已经生成的 `PC-260813-27VTY-001`。
- 将索引写入改为同目录临时文件加原子替换，临时文件由服务账号创建，避免部分写入并保持正确属主。
- 发布 release：`/opt/project-card-tool/releases/20260813-trace-index-permission-fix-r1`。
- 原 release 保留：`/opt/project-card-tool/releases/20260807-deploy-ready-r2`。

## 验收

- 服务账号可实际写入并恢复索引文件。
- `/api/ready` 返回 200 且全部检查通过。
- 工具首页返回 200。
- 索引静态访问仍返回 403。
- 官网会员 SSO 交换成功，`/api/my-cards` 正常返回。
- `project-card-tool.service`、`feishu-codex.service` 和官网 PM2 进程均在线。
