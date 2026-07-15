import * as nextEnvModule from "@next/env";
import { generateFinalWebsitePreview } from "../src/lib/site/final-site-generator";
import { runSiteQualityCheck, siteQualityGateMode, type SiteQualityCheckResult } from "../src/lib/site/site-quality-checker";
import type { SiteJobDto, StyleConceptDto } from "../src/lib/site/site-types";

const nextEnv = nextEnvModule as typeof nextEnvModule & {
  default?: typeof nextEnvModule;
  "module.exports"?: typeof nextEnvModule;
};
const loadEnvConfig = nextEnv.loadEnvConfig || nextEnv.default?.loadEnvConfig || nextEnv["module.exports"]?.loadEnvConfig;
if (!loadEnvConfig) throw new Error("Unable to load @next/env loadEnvConfig.");

loadEnvConfig(process.cwd());

type ClaimResponse =
  | { success: true; claimed: false }
  | { success: true; claimed: true; siteJob: SiteJobDto; mainStyle: StyleConceptDto | null }
  | { success: false; error?: string };

type WorkerConfig = {
  serverBaseUrl: string;
  sharedSecret: string;
  workerId: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  once: boolean;
  dryRun: boolean;
};

function config(): WorkerConfig {
  const serverBaseUrl = process.env.WORKER_SERVER_BASE_URL?.trim() || process.env.PUBLIC_SITE_BASE_URL?.trim() || "";
  const sharedSecret = process.env.WORKER_SHARED_SECRET?.trim() || "";
  if (!serverBaseUrl) throw new Error("缺少 WORKER_SERVER_BASE_URL，例如 https://xinyingst.com");
  if (!sharedSecret) throw new Error("缺少 WORKER_SHARED_SECRET。ECS 与本机 worker 必须一致。");

  return {
    serverBaseUrl: serverBaseUrl.replace(/\/+$/, ""),
    sharedSecret,
    workerId: process.env.WORKER_ID?.trim() || `local-${process.env.COMPUTERNAME || process.env.HOSTNAME || "site-worker"}`,
    pollIntervalMs: Math.max(3000, Number(process.env.WORKER_POLL_INTERVAL_MS || 8000)),
    leaseSeconds: Math.max(60, Number(process.env.WORKER_LEASE_SECONDS || 900)),
    once: process.argv.includes("--once"),
    dryRun: process.argv.includes("--dry-run")
  };
}

function defaultStyle(): StyleConceptDto {
  return {
    id: "default",
    styleName: "自动官网风格",
    styleDescription: "根据客户资料和最终文案自动生成完整官网。",
    suitableFor: "企业官网",
    schemeType: null,
    layoutStyle: null,
    colorTendency: null,
    visualTechniques: [],
    emotionalDescription: null,
    imageUrl: "",
    generationBatch: 0,
    mode: "fallback",
    isFavorite: false,
    isMainStyle: false,
    createdAt: new Date().toISOString()
  };
}

async function workerFetch<T>(cfg: WorkerConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${cfg.serverBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.sharedSecret}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function claimJob(cfg: WorkerConfig) {
  return workerFetch<ClaimResponse>(cfg, "/api/worker/site-jobs/claim", {
    method: "POST",
    body: JSON.stringify({ workerId: cfg.workerId, leaseSeconds: cfg.leaseSeconds })
  });
}

async function heartbeat(cfg: WorkerConfig, jobId: string, stage = "官网生成中") {
  await workerFetch(cfg, `/api/worker/site-jobs/${jobId}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({ leaseSeconds: cfg.leaseSeconds, workerId: cfg.workerId, stage })
  });
}

async function completeJob(
  cfg: WorkerConfig,
  jobId: string,
  result: {
    previewUrl: string;
    screenshotUrl?: string;
    generator: string;
    fallbackReason?: string;
    revisionId?: string;
    qualityCheck?: SiteQualityCheckResult;
  }
) {
  await workerFetch(cfg, `/api/worker/site-jobs/${jobId}/complete`, {
    method: "POST",
    body: JSON.stringify({ ...result, workerId: cfg.workerId })
  });
}

async function failJob(cfg: WorkerConfig, jobId: string, error: unknown, revisionId?: string) {
  const message = error instanceof Error ? error.message : String(error);
  await workerFetch(cfg, `/api/worker/site-jobs/${jobId}/fail`, {
    method: "POST",
    body: JSON.stringify({ workerId: cfg.workerId, error: message, revisionId })
  });
}

async function runOne(cfg: WorkerConfig) {
  const claimed = await claimJob(cfg);
  if (!claimed.success) throw new Error(claimed.error || "领取任务失败。");
  if (!claimed.claimed) {
    console.log(`[${new Date().toISOString()}] 暂无官网生成任务。`);
    return false;
  }

  const { siteJob, mainStyle } = claimed;
  const activeRevision = siteJob.revisions.find((revision) => revision.status === "generating" || revision.status === "queued");
  console.log(`[${new Date().toISOString()}] 已领取任务 ${siteJob.id}，开始本机生成。`);

  let currentStage = "准备官网生成素材";
  await heartbeat(cfg, siteJob.id, currentStage).catch(() => undefined);

  const heartbeatMs = Math.max(30000, Math.floor((cfg.leaseSeconds * 1000) / 3));
  const timer = setInterval(() => {
    void heartbeat(cfg, siteJob.id, currentStage).catch((error) => {
      console.warn(`[${new Date().toISOString()}] 续租失败：${error instanceof Error ? error.message : String(error)}`);
    });
  }, heartbeatMs);

  try {
    currentStage = "调用 Codex 生成官网代码";
    await heartbeat(cfg, siteJob.id, currentStage).catch(() => undefined);
    const result = await generateFinalWebsitePreview(
      siteJob,
      mainStyle || defaultStyle(),
      activeRevision ? { revisionInstruction: activeRevision.revisionInstruction } : {}
    );
    currentStage = "发布官网预览并回写任务";
    await heartbeat(cfg, siteJob.id, currentStage).catch(() => undefined);
    currentStage = "自动检查官网成品质量";
    await heartbeat(cfg, siteJob.id, currentStage).catch(() => undefined);
    const qualityCheck = await runSiteQualityCheck({ url: result.previewUrl, jobId: siteJob.id });
    const gateMode = siteQualityGateMode();
    console.log(`[${new Date().toISOString()}] 自检结果 ${siteJob.id}: ${qualityCheck.summary}`);
    if (gateMode === "strict" && qualityCheck.status === "failed") {
      const reportHint = qualityCheck.reportPath ? ` 报告：${qualityCheck.reportPath}` : "";
      throw new Error(`自动成品自检未通过：${qualityCheck.summary}${reportHint}`);
    }
    await completeJob(cfg, siteJob.id, { ...result, revisionId: activeRevision?.id, qualityCheck });
    console.log(`[${new Date().toISOString()}] 任务 ${siteJob.id} 已完成：${result.previewUrl}`);
    return true;
  } catch (error) {
    await failJob(cfg, siteJob.id, error, activeRevision?.id).catch((callbackError) => {
      console.error(`[${new Date().toISOString()}] 回写失败状态失败：${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);
    });
    console.error(`[${new Date().toISOString()}] 任务 ${siteJob.id} 生成失败：${error instanceof Error ? error.message : String(error)}`);
    return true;
  } finally {
    clearInterval(timer);
  }
}

async function main() {
  const cfg = config();
  console.log(`[${new Date().toISOString()}] site worker 启动：${cfg.workerId} -> ${cfg.serverBaseUrl}`);

  if (cfg.dryRun) {
    console.log(`[${new Date().toISOString()}] site worker dry-run OK; no job claimed.`);
    return;
  }

  do {
    await runOne(cfg).catch((error) => {
      console.error(`[${new Date().toISOString()}] worker 轮询失败：${error instanceof Error ? error.message : String(error)}`);
    });
    if (!cfg.once) {
      await new Promise((resolve) => setTimeout(resolve, cfg.pollIntervalMs));
    }
  } while (!cfg.once);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
