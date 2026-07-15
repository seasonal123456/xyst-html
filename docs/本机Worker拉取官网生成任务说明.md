# 本机 Worker 拉取官网生成任务说明

## 目标

公开网站部署在 ECS，客户提交官网生成后只进入队列。本机 worker 主动拉取任务，在本机调用 Codex 生成官网，并把 HTML/素材上传到 OSS 后回写 ECS。

这样 ECS 不需要直接访问你的本机，本机也不需要暴露公网端口。

## ECS 环境变量

```env
SITE_GENERATION_MODE=worker_queue
WORKER_SHARED_SECRET=换成一段足够长的随机密钥
```

ECS 仍然需要数据库、OSS、登录、客户次数等配置。

## 本机 worker 环境变量

```env
WORKER_SERVER_BASE_URL=https://你的正式域名
WORKER_SHARED_SECRET=与ECS完全一致
WORKER_ID=local-codex-worker-01

STORAGE_PROVIDER=aliyun-oss
ALIYUN_OSS_REGION=...
ALIYUN_OSS_ACCESS_KEY_ID=...
ALIYUN_OSS_ACCESS_KEY_SECRET=...
ALIYUN_OSS_GENERATED_BUCKET=...
ALIYUN_OSS_GENERATED_PUBLIC_BASE_URL=...

SITE_GENERATOR_PROVIDER=codex
CODEX_CLI_PATH=codex
CODEX_SITE_MODEL=...
CODEX_PUBLIC_GENERATION_ENABLED=true
```

本机必须能访问 Codex CLI、OpenAI/模型接口和 OSS。

## 启动 worker

```bash
npm run worker:site
```

只跑一次用于测试：

```bash
npm run worker:site -- --once
```

## 流程

1. 客户点击生成官网。
2. ECS 将任务状态改为 `site_generation_queued`。
3. 本机 worker 调用 `/api/worker/site-jobs/claim` 领取任务。
4. worker 本机调用官网生成引擎。
5. 生成结果通过 OSS/存储发布。
6. worker 调用 `/api/worker/site-jobs/[id]/complete` 回写预览地址。
7. 客户结果页进入 `client_preview` 状态，可生成交付包。

## 注意

- `WORKER_SHARED_SECRET` 不能泄露。
- 早期试用建议本机 worker 常驻运行。
- 如果 worker 停止，客户任务会停留在“官网排队生成中”，不会消耗额外模型费用。
- worker 领取任务后会定期 heartbeat；如果 worker 异常退出，租约过期后任务可以被再次领取。
- 自检默认关闭时，不由 worker 自动拦截交付；但交付、部署或排查时，Codex 可以按需打开助理浏览器截图目检，检查首屏、移动端、图片加载、文字遮挡、异常换行和按钮/表单状态。
