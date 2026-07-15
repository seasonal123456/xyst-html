import { prisma } from "@/lib/db";
import { createStoredZip } from "@/lib/zip-store";
import { websiteEntriesFromPreviewUrl } from "@/lib/site/standard-delivery-generator";
import { syncGeneratedSiteToSupabase } from "@/lib/site/supabase-generated-sites";
import type { SiteJobDto } from "@/lib/site/site-types";

type NetlifySite = {
  id?: string;
  name?: string;
  url?: string;
  ssl_url?: string;
  admin_url?: string;
};

type NetlifyDeploy = {
  id?: string;
  site_id?: string;
  name?: string;
  state?: string;
  error_message?: string | null;
  url?: string;
  ssl_url?: string;
  deploy_url?: string;
  deploy_ssl_url?: string;
};

type NetlifyBuild = {
  id?: string;
  deploy_id?: string;
  error?: string;
  message?: string;
};

type PublishResult = {
  provider: "netlify";
  publishedUrl: string;
  netlifySiteId: string;
  netlifySiteName?: string;
  netlifyDeployId?: string;
};

type PublishOptions = {
  netlifySiteName?: string;
};

export type NetlifyCreditUsage = {
  accountSlug?: string;
  accountName?: string;
  planName?: string;
  included: number;
  used: number;
  remaining: number;
  currentUsagePeriodStart?: string | null;
  nextUsagePeriodStart?: string | null;
};

function publishProvider() {
  return process.env.SITE_PUBLISH_PROVIDER?.trim().toLowerCase() || "none";
}

function netlifyApiBaseUrl() {
  return (process.env.NETLIFY_API_BASE_URL?.trim() || "https://api.netlify.com/api/v1").replace(/\/+$/, "");
}

function netlifyToken() {
  return process.env.NETLIFY_AUTH_TOKEN?.trim() || "";
}

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function normalizeNetlifySiteName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

export function validateNetlifySiteName(value: string) {
  if (!value) return "请填写轻量化部署域名前缀。";
  if (value.length < 3) return "域名前缀至少需要 3 个字符。";
  if (value.length > 63) return "域名前缀最多 63 个字符。";
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
    return "域名前缀只能包含小写英文字母、数字和中横线，且不能以中横线开头或结尾。";
  }
  return null;
}

export async function getSiteJobDeploymentNumber(job: Pick<SiteJobDto, "id" | "createdAt">) {
  const createdAt = new Date(job.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return prisma.siteJob.count();
  }
  const earlierCount = await prisma.siteJob.count({
    where: {
      OR: [
        { createdAt: { lt: createdAt } },
        { createdAt, id: { lte: job.id } }
      ]
    }
  });
  return Math.max(1, earlierCount);
}

export function composeNetlifySiteName(preferredName: string, deploymentNumber: number) {
  const suffix = `xyst${Math.max(1, Math.floor(deploymentNumber))}`;
  const preferred = normalizeNetlifySiteName(preferredName);
  if (preferredName) {
    const maxPreferredLength = Math.max(3, 63 - suffix.length - 1);
    const middle = preferred.slice(0, maxPreferredLength).replace(/-+$/g, "");
    return [middle, suffix].filter(Boolean).join("-").slice(0, 63);
  }
  return suffix;
}

async function netlifySiteName(job: Pick<SiteJobDto, "id" | "customerName" | "businessDescription" | "netlifySiteName" | "createdAt">, preferredName?: string) {
  if (job.netlifySiteName) return normalizeNetlifySiteName(job.netlifySiteName);
  const deploymentNumber = await getSiteJobDeploymentNumber(job);
  return composeNetlifySiteName(preferredName || safeSlug(job.customerName || job.businessDescription || ""), deploymentNumber);
}

function flattenNetlifyErrors(value: unknown, prefix = ""): string[] {
  if (!value) return [];
  if (typeof value === "string") return [prefix ? `${prefix} ${value}` : value];
  if (Array.isArray(value)) return value.flatMap((item) => flattenNetlifyErrors(item, prefix));
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const label = prefix ? `${prefix}.${key}` : key;
      return flattenNetlifyErrors(item, label);
    });
  }
  return [String(value)];
}

function netlifyErrorMessage(status: number, text: string, data: unknown) {
  const payload = data as { message?: string; error?: string; errors?: unknown };
  const details = [
    payload?.message,
    payload?.error,
    ...flattenNetlifyErrors(payload?.errors)
  ].filter(Boolean);
  if (details.length) return `Netlify API HTTP ${status}: ${details.join("; ")}`;
  if (text) return `Netlify API HTTP ${status}: ${text.slice(0, 500)}`;
  return `Netlify API HTTP ${status}`;
}

async function netlifyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = netlifyToken();
  if (!token) {
    throw new Error("NETLIFY_AUTH_TOKEN is not configured.");
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`
  };
  if (!(init.body instanceof FormData)) {
    headers["Content-Type"] = init.body instanceof Blob && init.body.type ? init.body.type : "application/json";
  }

  const response = await fetch(`${netlifyApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(netlifyErrorMessage(response.status, text, data));
  }
  return data as T;
}

type NetlifyAccount = {
  slug?: string;
  name?: string;
  type_name?: string;
  current_usage_period_start?: string | null;
  next_usage_period_start?: string | null;
  capabilities?: {
    credits?: {
      included?: number | string | null;
      used?: number | string | null;
    };
  };
};

function numberFromNetlify(value: number | string | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function getNetlifyCreditUsage(): Promise<NetlifyCreditUsage | null> {
  if (publishProvider() !== "netlify" || !netlifyToken()) return null;

  const configuredAccount = process.env.NETLIFY_ACCOUNT_SLUG?.trim() || process.env.NETLIFY_ACCOUNT_ID?.trim();
  const account = configuredAccount
    ? await netlifyFetch<NetlifyAccount>(`/accounts/${encodeURIComponent(configuredAccount)}`)
    : (await netlifyFetch<NetlifyAccount[]>("/accounts"))[0];

  if (!account) return null;
  const included = numberFromNetlify(account.capabilities?.credits?.included);
  const used = numberFromNetlify(account.capabilities?.credits?.used);
  return {
    accountSlug: account.slug,
    accountName: account.name,
    planName: account.type_name,
    included,
    used,
    remaining: Math.max(0, included - used),
    currentUsagePeriodStart: account.current_usage_period_start || null,
    nextUsagePeriodStart: account.next_usage_period_start || null
  };
}

async function createNetlifySite(job: SiteJobDto, preferredName?: string): Promise<NetlifySite> {
  const configuredSiteId = process.env.NETLIFY_SITE_ID?.trim();
  if (configuredSiteId) {
    return { id: configuredSiteId };
  }

  const name = await netlifySiteName(job, preferredName);
  try {
    return await netlifyFetch<NetlifySite>("/sites", {
      method: "POST",
      body: JSON.stringify({ name })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/422|taken|exists|name/i.test(message)) {
      throw new Error(`域名前缀 ${name}.netlify.app 已被占用，请换一个关键词后重试。`);
    }
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNetlifySite(siteId: string): Promise<NetlifySite> {
  return netlifyFetch<NetlifySite>(`/sites/${encodeURIComponent(siteId)}`);
}

async function getNetlifyDeploy(deployId: string): Promise<NetlifyDeploy> {
  return netlifyFetch<NetlifyDeploy>(`/deploys/${encodeURIComponent(deployId)}`);
}

async function waitForNetlifyDeploy(deployId: string): Promise<NetlifyDeploy> {
  let lastDeploy: NetlifyDeploy | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const deploy = await getNetlifyDeploy(deployId);
    lastDeploy = deploy;
    if (deploy.state === "ready") return deploy;
    if (deploy.state === "error") {
      throw new Error(deploy.error_message || "Netlify deploy failed.");
    }
    await sleep(2000);
  }

  throw new Error(`Netlify deploy did not become ready in time. Last state: ${lastDeploy?.state || "unknown"}.`);
}

function netlifyRootEntries(entries: Array<{ name: string; data: Buffer }>) {
  return entries.map((entry) => ({
    name: entry.name.startsWith("website/") ? entry.name.slice("website/".length) : entry.name,
    data: entry.data
  }));
}

async function deployToNetlify(job: SiteJobDto, options: PublishOptions = {}): Promise<PublishResult> {
  if (!job.previewUrl) {
    throw new Error("Site preview URL is required before Netlify publishing.");
  }

  const site = job.netlifySiteId ? { id: job.netlifySiteId, name: job.netlifySiteName || undefined } : await createNetlifySite(job, options.netlifySiteName);
  if (!site.id) {
    throw new Error("Netlify did not return a site id.");
  }
  if (!job.netlifySiteId) {
    await prisma.siteJob.update({
      where: { id: job.id },
      data: {
        netlifySiteId: site.id,
        netlifySiteName: site.name || await netlifySiteName(job, options.netlifySiteName)
      }
    }).catch(() => undefined);
  }

  const website = await websiteEntriesFromPreviewUrl(job.previewUrl);
  if (website.missingAssets.length) {
    const missing = website.missingAssets.map((asset) => `${asset.sourceUrl} (${asset.reason})`).join(", ");
    throw new Error(`Refusing Netlify publish because required website assets are missing: ${missing}`);
  }

  const zip = createStoredZip(netlifyRootEntries(website.entries));
  const deploy = await netlifyFetch<NetlifyDeploy>(`/sites/${encodeURIComponent(site.id)}/deploys`, {
    method: "POST",
    body: new Blob([Uint8Array.from(zip)], { type: "application/zip" })
  });
  if (!deploy.id) {
    throw new Error(deploy.error_message || "Netlify deploy completed without a deploy id.");
  }

  const readyDeploy = deploy.state === "ready" ? deploy : await waitForNetlifyDeploy(deploy.id);
  const publishedSite = await getNetlifySite(readyDeploy.site_id || site.id).catch(() => site);

  const publishedUrl =
    readyDeploy.ssl_url || publishedSite.ssl_url || readyDeploy.url || publishedSite.url || readyDeploy.deploy_ssl_url || readyDeploy.deploy_url;
  if (!publishedUrl) {
    throw new Error("Netlify deploy completed but no public URL was returned.");
  }

  return {
    provider: "netlify",
    publishedUrl,
    netlifySiteId: readyDeploy.site_id || site.id,
    netlifySiteName: publishedSite.name || site.name || readyDeploy.name,
    netlifyDeployId: readyDeploy.id
  };
}

export async function publishSiteJobIfEnabled(job: SiteJobDto | null, options: PublishOptions = {}): Promise<SiteJobDto | null> {
  if (!job) return null;
  if (publishProvider() !== "netlify") return job;
  if (!job.previewUrl) return job;

  const requestedSiteName = options.netlifySiteName ? normalizeNetlifySiteName(options.netlifySiteName) : "";
  const siteNameError = requestedSiteName ? validateNetlifySiteName(requestedSiteName) : null;
  if (siteNameError) {
    throw new Error(siteNameError);
  }

  await prisma.siteJob.update({
    where: { id: job.id },
    data: {
      publishProvider: "netlify",
      publishStatus: "publishing",
      publishError: null
    }
  });

  try {
    const result = await deployToNetlify(job, { netlifySiteName: requestedSiteName || undefined });
    let updated = await prisma.siteJob.update({
      where: { id: job.id },
      data: {
        publishProvider: result.provider,
        publishStatus: "published",
        publishError: null,
        publishedUrl: result.publishedUrl,
        netlifySiteId: result.netlifySiteId,
        netlifySiteName: result.netlifySiteName || job.netlifySiteName || null,
        netlifyDeployId: result.netlifyDeployId || null,
        publishedAt: new Date()
      },
      include: {
        assets: true,
        styleConcepts: { orderBy: [{ generationBatch: "desc" }, { createdAt: "asc" }] },
        copyVersions: { orderBy: { versionNumber: "desc" } },
        revisions: { orderBy: { versionNumber: "desc" } }
      }
    });
    const { toSiteJobDto } = await import("@/lib/site/site-job-service");
    let dto = toSiteJobDto(updated);
    try {
      await syncGeneratedSiteToSupabase(dto);
    } catch (error) {
      updated = await prisma.siteJob.update({
        where: { id: job.id },
        data: {
          publishError: error instanceof Error ? error.message : "Supabase sync failed."
        },
        include: {
          assets: true,
          styleConcepts: { orderBy: [{ generationBatch: "desc" }, { createdAt: "asc" }] },
          copyVersions: { orderBy: { versionNumber: "desc" } },
          revisions: { orderBy: { versionNumber: "desc" } }
        }
      });
      dto = toSiteJobDto(updated);
    }
    return dto;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Netlify publish failed.";
    const updated = await prisma.siteJob.update({
      where: { id: job.id },
      data: {
        publishProvider: "netlify",
        publishStatus: "failed",
        publishError: message
      },
      include: {
        assets: true,
        styleConcepts: { orderBy: [{ generationBatch: "desc" }, { createdAt: "asc" }] },
        copyVersions: { orderBy: { versionNumber: "desc" } },
        revisions: { orderBy: { versionNumber: "desc" } }
      }
    });
    const { toSiteJobDto } = await import("@/lib/site/site-job-service");
    return toSiteJobDto(updated);
  }
}
