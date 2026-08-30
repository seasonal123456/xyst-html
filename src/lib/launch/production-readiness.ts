export type LaunchReadinessSeverity = "blocker" | "warning";

export type LaunchReadinessIssue = {
  code: string;
  severity: LaunchReadinessSeverity;
  message: string;
  fix: string;
};

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function isEnabled(name: string): boolean {
  return env(name).toLowerCase() === "true";
}

export function getLaunchReadinessIssues(): LaunchReadinessIssue[] {
  const issues: LaunchReadinessIssue[] = [];
  const databaseUrl = env("DATABASE_URL");
  const storageProvider = env("STORAGE_PROVIDER") || "local";
  const siteGeneratorProvider = (env("SITE_GENERATOR_PROVIDER") || "codex").toLowerCase();
  const siteGenerationMode = (env("SITE_GENERATION_MODE") || "sync").toLowerCase();
  const allowSqliteMvpTesting = isEnabled("ALLOW_SQLITE_MVP_TESTING");

  if (!databaseUrl) {
    issues.push({
      code: "database_url_missing",
      severity: "blocker",
      message: "缺少 DATABASE_URL。",
      fix: "公开上线前必须配置生产数据库连接。"
    });
  } else if (databaseUrl.startsWith("file:") && allowSqliteMvpTesting) {
    issues.push({
      code: "sqlite_mvp_testing_accepted",
      severity: "warning",
      message: "MVP 测试期已显式接受 SQLite 文件数据库风险。",
      fix: "这不代表正式运营通过；请保持低并发、启用队列、部署前后备份 prod.db，并在稳定收客前迁移到 RDS MySQL 或 PostgreSQL。"
    });
  } else if (databaseUrl.startsWith("file:")) {
    issues.push({
      code: "sqlite_in_production",
      severity: "blocker",
      message: "当前仍在使用 SQLite 文件数据库。",
      fix: "迁移到 RDS MySQL 或 PostgreSQL，并同步更新 Prisma datasource 配置。"
    });
  }

  if (!env("ADMIN_PASSWORD") || env("ADMIN_PASSWORD") === "change-me") {
    issues.push({
      code: "weak_admin_password",
      severity: "blocker",
      message: "管理员密码还不是生产级配置。",
      fix: "上线前设置足够长、随机、不可猜测的 ADMIN_PASSWORD，并妥善保存。"
    });
  }

  if (storageProvider === "local") {
    issues.push({
      code: "local_storage",
      severity: "blocker",
      message: "上传文件和生成资产仍存储在服务器本地。",
      fix: "将客户上传、风格图、官网预览和交付包切换到 OSS 或其他对象存储。"
    });
  }

  if (storageProvider === "aliyun-oss") {
    const required = ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_SECRET"];
    for (const name of required) {
      if (!env(name)) {
        issues.push({
          code: `missing_${name.toLowerCase()}`,
          severity: "blocker",
          message: `缺少 ${name}。`,
          fix: "切换公开流量前，请补齐阿里云 OSS 配置并完成真实上传测试。"
        });
      }
    }
    if (!env("ALIYUN_OSS_BUCKET") && (!env("ALIYUN_OSS_UPLOAD_BUCKET") || !env("ALIYUN_OSS_GENERATED_BUCKET"))) {
      issues.push({
        code: "missing_aliyun_oss_buckets",
        severity: "blocker",
        message: "缺少 OSS Bucket 配置。",
        fix: "单 Bucket 模式填写 ALIYUN_OSS_BUCKET；双 Bucket 模式填写 ALIYUN_OSS_UPLOAD_BUCKET 和 ALIYUN_OSS_GENERATED_BUCKET。"
      });
    }
  }

  if (!env("OPENAI_API_KEY") && (!env("STYLE_IMAGE_API_KEY") || !env("COPY_API_KEY"))) {
    issues.push({
      code: "model_keys_missing",
      severity: "blocker",
      message: "模型 API Key 尚未配置完整。",
      fix: "在服务端环境变量中配置风格图生成、文案生成和官网生成需要的模型密钥。"
    });
  }

  if (env("ENABLE_MOCK_FALLBACK").toLowerCase() !== "false") {
    issues.push({
      code: "mock_fallback_enabled",
      severity: "warning",
      message: "mock fallback 仍处于开启状态。",
      fix: "生产环境建议关闭 mock fallback，让真实生成失败可以被记录、追踪和重试。"
    });
  }

  if (siteGeneratorProvider === "codex" && siteGenerationMode !== "worker_queue" && !isEnabled("CODEX_PUBLIC_GENERATION_ENABLED")) {
    issues.push({
      code: "codex_public_generation_locked",
      severity: "blocker",
      message: "Codex 最终官网生成尚未对公开生产流量开放。",
      fix: "只有在队列、隔离运行、超时清理和滥用控制完成后，才设置 CODEX_PUBLIC_GENERATION_ENABLED=true。"
    });
  }

  if (siteGeneratorProvider === "remote_html") {
    if (siteGenerationMode !== "worker_queue") {
      issues.push({
        code: "remote_html_worker_queue_required",
        severity: "blocker",
        message: "远程 AI 官网生成未使用后台任务队列。",
        fix: "设置 SITE_GENERATION_MODE=worker_queue，并由服务器后台 worker 执行流式生成。"
      });
    }
    for (const name of ["REMOTE_SITE_API_BASE_URL", "REMOTE_SITE_API_KEY", "REMOTE_SITE_MODEL"]) {
      if (!env(name)) {
        issues.push({
          code: `missing_${name.toLowerCase()}`,
          severity: "blocker",
          message: `缺少 ${name}。`,
          fix: "在服务器环境变量中补齐远程官网生成配置；密钥只保存在服务端。"
        });
      }
    }
  }

  if (!env("PUBLIC_SITE_BASE_URL")) {
    issues.push({
      code: "public_site_base_url_missing",
      severity: "warning",
      message: "尚未配置 PUBLIC_SITE_BASE_URL。",
      fix: "设置正式访问域名，用于生成预览链接、交付链接和后续通知。"
    });
  }

  return issues;
}

export function assertCodexPublicGenerationAllowed() {
  if (process.env.NODE_ENV !== "production") return;
  if ((process.env.SITE_GENERATOR_PROVIDER?.trim().toLowerCase() || "codex") !== "codex") return;
  if (process.env.CODEX_PUBLIC_GENERATION_ENABLED?.trim().toLowerCase() === "true") return;

  throw new Error(
    "Codex public generation is disabled in production. Enable CODEX_PUBLIC_GENERATION_ENABLED only after sandboxing and queue controls are ready."
  );
}
