"use client";

import { useState } from "react";

type Props = {
  jobId: string;
  siteZipUrl?: string | null;
  publishedUrl?: string | null;
  publishStatus?: string | null;
  netlifySiteId?: string | null;
  netlifySiteName?: string | null;
  deploymentNumber: number;
};

function normalizeSiteName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

function siteNameValidationError(value: string) {
  if (!value) return "";
  if (value.length < 3) return "域名前缀至少需要 3 个字符。";
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) return "域名前缀只能使用小写英文字母、数字和中横线。";
  return "";
}

function composeSiteNamePreview(keyword: string, deploymentNumber: number) {
  const suffix = `xyst${Math.max(1, Math.floor(deploymentNumber))}`;
  if (!keyword) return `${suffix}.netlify.app`;
  const maxKeywordLength = Math.max(3, 63 - suffix.length - 1);
  return `${keyword.slice(0, maxKeywordLength).replace(/-+$/g, "")}-${suffix}.netlify.app`;
}

export function StandardDeliveryActions({ jobId, siteZipUrl, publishedUrl, publishStatus, netlifySiteId, netlifySiteName, deploymentNumber }: Props) {
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(siteZipUrl || "");
  const [publicUrl, setPublicUrl] = useState(publishedUrl || "");
  const [deploymentStatus, setDeploymentStatus] = useState(publishStatus || "");
  const [siteNameInput, setSiteNameInput] = useState(netlifySiteName || "");
  const [error, setError] = useState("");
  const [deploymentError, setDeploymentError] = useState("");

  const canPublish = Boolean(downloadUrl);
  const normalizedSiteName = normalizeSiteName(siteNameInput);
  const domainLocked = Boolean(netlifySiteId && netlifySiteName);
  const siteNamePreview = composeSiteNamePreview(normalizedSiteName, deploymentNumber);

  async function generateDeliveryPackage() {
    setLoading(true);
    setError("");
    setDeploymentError("");
    try {
      const response = await fetch(`/api/site-jobs/${jobId}/delivery`, { method: "POST", credentials: "same-origin" });
      const data = (await response.json()) as { success: boolean; siteJob?: { siteZipUrl?: string | null }; error?: string };
      if (!data.success) {
        setError(data.error || "生成标准交付包失败。");
        return;
      }
      setDownloadUrl(data.siteJob?.siteZipUrl || "");
      setDeploymentStatus("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成标准交付包失败。");
    } finally {
      setLoading(false);
    }
  }

  async function publishLightweightSite() {
    const siteNameError = siteNameValidationError(normalizedSiteName);
    if (siteNameInput.trim() && !normalizedSiteName) {
      setDeploymentError("域名前缀只能使用小写英文字母、数字和中横线。");
      return;
    }
    if (siteNameError) {
      setDeploymentError(siteNameError);
      return;
    }
    setPublishing(true);
    setDeploymentError("");
    setDeploymentStatus("publishing");
    try {
      const response = await fetch(`/api/site-jobs/${jobId}/publish`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteName: normalizedSiteName || undefined })
      });
      const data = (await response.json()) as {
        success: boolean;
        siteJob?: {
          publishedUrl?: string | null;
          publishStatus?: string | null;
          publishError?: string | null;
          netlifySiteName?: string | null;
        } | null;
        error?: string;
      };
      if (!data.success) {
        setDeploymentStatus("failed");
        setDeploymentError(response.status === 401 ? "请先登录客户账号，再发起轻量化部署。" : data.error || "轻量化部署失败，请联系管理员处理。");
        return;
      }
      setPublicUrl(data.siteJob?.publishedUrl || "");
      setDeploymentStatus(data.siteJob?.publishStatus || "published");
      setSiteNameInput(data.siteJob?.netlifySiteName || normalizedSiteName);
      setDeploymentError(data.siteJob?.publishError || "");
    } catch (requestError) {
      setDeploymentStatus("failed");
      setDeploymentError(requestError instanceof Error ? requestError.message : "轻量化部署失败，请联系管理员处理。");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Standard Delivery</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">生成标准交付包</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
            标准交付包包含官网静态文件、最终文案、风格说明和素材清单，可下载保存到 U 盘；确认无误后，也可以直接发起轻量化部署，生成公开访问链接。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {downloadUrl ? (
            <a href={downloadUrl} download className="rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white">
              下载标准交付包
            </a>
          ) : (
            <button
              onClick={generateDeliveryPackage}
              disabled={loading}
              className="rounded-md bg-teal-700 px-5 py-3 text-sm font-black text-white disabled:bg-slate-400"
            >
              {loading ? "正在生成交付包..." : "生成标准交付包"}
            </button>
          )}
          {publicUrl ? (
            <a href={publicUrl} target="_blank" rel="noreferrer" className="rounded-md bg-teal-700 px-5 py-3 text-sm font-black text-white">
              打开公开网站
            </a>
          ) : (
            <button
              onClick={publishLightweightSite}
              disabled={!canPublish || publishing || deploymentStatus === "publishing"}
              title={canPublish ? "生成公开访问链接" : "请先生成标准交付包"}
              className="rounded-md border border-teal-700 bg-white px-5 py-3 text-sm font-black text-teal-800 disabled:border-slate-300 disabled:text-slate-400"
            >
              {!canPublish ? "先生成交付包" : publishing || deploymentStatus === "publishing" ? "正在轻量化部署..." : "轻量化部署上线"}
            </button>
          )}
        </div>
      </div>
      {!publicUrl ? (
        <label className="mt-4 block max-w-xl text-xs font-black uppercase tracking-wide text-teal-700">
          公开域名前缀（可选）
          <span className="mt-2 flex overflow-hidden rounded-md border border-teal-200 bg-white text-sm font-bold normal-case tracking-normal text-slate-800">
            <input
              value={siteNameInput}
              onChange={(event) => setSiteNameInput(event.target.value)}
              disabled={publishing || domainLocked}
              placeholder="例如 smart-factory"
              className="min-w-0 flex-1 px-3 py-2 outline-none disabled:bg-slate-50"
            />
            <span className="border-l border-teal-100 bg-teal-50 px-3 py-2 text-teal-800">.netlify.app</span>
          </span>
          {domainLocked ? (
            <span className="mt-2 block text-xs font-bold normal-case tracking-normal text-slate-500">该任务已绑定 Netlify 站点，后续部署会复用此域名。</span>
          ) : normalizedSiteName ? (
            <span className="mt-2 block text-xs font-bold normal-case tracking-normal text-slate-500">预计生成：{siteNamePreview}</span>
          ) : (
            <span className="mt-2 block text-xs font-bold normal-case tracking-normal text-slate-500">不填写则自动生成：{siteNamePreview}</span>
          )}
        </label>
      ) : null}
      {downloadUrl ? <p className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-bold text-teal-800">标准交付包已生成：{downloadUrl}</p> : null}
      {publicUrl ? <p className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-bold text-teal-800">公开网站已上线：{publicUrl}</p> : null}
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      {deploymentError ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{deploymentError}</p> : null}
    </div>
  );
}
