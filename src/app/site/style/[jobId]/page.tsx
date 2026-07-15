"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import type { SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

const estimatedStyleSeconds = 600;
const estimatedWebsiteSeconds = 1000;
const styleReferenceAccept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

const styleLoadingSteps = ["分析行业类型", "规划整站结构", "设计首屏视觉", "设计下方板块", "保存参考图"];
const websiteLoadingSteps = ["读取文案与风格", "分析参考图构图", "生成官网代码", "整理素材路径", "发布交付页面"];

function styleModeLabel(mode: string) {
  if (mode === "real") return "真实生图";
  if (mode === "fallback") return "兜底生成";
  return "Mock";
}

function styleModeClass(mode: string) {
  if (mode === "real") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (mode === "fallback") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function safeDownloadName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "website-style";
}

function publicStyleDescription(style: StyleConceptDto) {
  return style.emotionalDescription || style.styleDescription || "更适合当前客户资料的官网方向";
}

function styleAppraisal(style: StyleConceptDto) {
  const layout = style.layoutStyle || "当前版式";
  const color = style.colorTendency || "整体配色";
  const techniques = style.visualTechniques.length ? style.visualTechniques.slice(0, 3).join("、") : "层次化排版";
  const schemeTone =
    style.schemeType === "转化增长型整站方案"
      ? "更利于突出咨询入口和行动路径"
      : style.schemeType === "项目展示型整站方案"
        ? "更利于展示项目、案例和业务实力"
        : "更利于建立品牌可信感与专业气质";

  return [
    `${layout}结合${color}，画面气质与客户业务的第一印象匹配度较高。`,
    `${techniques}让页面更有节奏，${schemeTone}。`
  ];
}

function ProgressPanel({
  elapsed,
  estimatedSeconds,
  steps,
  title,
  description,
  tone = "cyan"
}: {
  elapsed: number;
  estimatedSeconds: number;
  steps: string[];
  title: string;
  description: string;
  tone?: "cyan" | "teal";
}) {
  const progress = Math.min(96, Math.round((elapsed / estimatedSeconds) * 100));
  const activeStep = Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length));
  const remaining = Math.max(0, estimatedSeconds - elapsed);
  const accent = tone === "teal" ? "bg-teal-500" : "bg-cyan-400";
  const activeClass = tone === "teal" ? "border-teal-200 bg-teal-50 text-teal-700" : "border-cyan-200 bg-cyan-50 text-cyan-700";

  return (
    <section className="rounded-lg border border-cyan-100 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Generating</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
          <div className="rounded-md bg-cyan-50 px-4 py-3">
            <b className="text-lg text-cyan-600">{formatTime(elapsed)}</b>
            <p className="mt-1 text-[11px] font-black text-slate-500">已用时间</p>
          </div>
          <div className="rounded-md bg-slate-50 px-4 py-3">
            <b className="text-lg text-slate-950">{formatTime(remaining)}</b>
            <p className="mt-1 text-[11px] font-black text-slate-500">预计剩余</p>
          </div>
          <div className="col-span-2 rounded-md bg-slate-950 px-4 py-3 text-white sm:col-span-1">
            <b className="text-lg">{progress}%</b>
            <p className="mt-1 text-[11px] font-black text-slate-300">制作进度</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="relative overflow-hidden rounded-lg border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-slate-50 p-5">
          <div className="mx-auto grid aspect-[4/3] w-full max-w-[280px] grid-cols-6 gap-1.5 rounded-lg border border-cyan-100 bg-white p-3 shadow-[0_18px_45px_rgba(8,145,178,.12)]">
            {Array.from({ length: 36 }, (_, index) => (
              <span
                key={index}
                className="h-full rounded-[3px] bg-cyan-400/80 shadow-sm animate-[tilePulse_1.9s_ease-in-out_infinite]"
                style={{
                  animationDelay: `${(index % 9) * 90}ms`,
                  opacity: 0.28 + ((index + elapsed) % 6) * 0.1,
                  transform: `scale(${0.74 + ((index + elapsed) % 5) * 0.055})`
                }}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,.26),transparent_42%)]" />
        </div>

        <div className="grid content-center gap-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${accent} transition-all duration-700`} style={{ width: `${progress}%` }} />
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {steps.map((step, index) => (
              <div key={step} className={`rounded-md border px-3 py-3 text-xs font-black ${index <= activeStep ? activeClass : "border-slate-200 bg-white text-slate-400"}`}>
                <span className="block text-lg">{String(index + 1).padStart(2, "0")}</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function preserveImageUsage(next: SiteJobDto | null | undefined, current: SiteJobDto | null): SiteJobDto | null {
  if (!next) return current;
  return {
    ...next,
    imageGenerationUsage: next.imageGenerationUsage || current?.imageGenerationUsage
  };
}

export default function SiteStylePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [siteJob, setSiteJob] = useState<SiteJobDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [websiteElapsed, setWebsiteElapsed] = useState(0);
  const [generatingSiteId, setGeneratingSiteId] = useState("");
  const [styleReferenceFiles, setStyleReferenceFiles] = useState<File[]>([]);
  const [styleReferenceMode, setStyleReferenceMode] = useState<"has" | "none">("none");
  const [preferUploadedStyleReference, setPreferUploadedStyleReference] = useState(false);
  const [savingStyleReferences, setSavingStyleReferences] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const data = await fetch(`/api/site-jobs/${jobId}`, { cache: "no-store" }).then((res) => res.json());
    if (data.success) setSiteJob((current) => preserveImageUsage(data.siteJob, current));
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  useEffect(() => {
    if (siteJob) {
      setPreferUploadedStyleReference(siteJob.preferUploadedStyleReference);
      setStyleReferenceMode(siteJob.preferUploadedStyleReference ? "has" : "none");
    }
  }, [siteJob?.id, siteJob?.preferUploadedStyleReference]);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!generatingSiteId) {
      setWebsiteElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setWebsiteElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generatingSiteId]);

  async function generate() {
    const imageUsage = siteJob?.imageGenerationUsage;
    if (imageUsage && imageUsage.remaining < 3) {
      setError(`本次建站最多生成 ${imageUsage.limit} 张图片，当前已使用 ${imageUsage.used}/${imageUsage.limit}，剩余 ${imageUsage.remaining} 张，不足以新增 3 张风格参考图。`);
      return;
    }

    setLoading(true);
    setElapsed(0);
    setError("");
    try {
      const data = await fetch(`/api/site-jobs/${jobId}/style-concepts/generate`, { method: "POST", credentials: "same-origin" }).then((res) => res.json());
      if (data.success) {
        setSiteJob((current) => preserveImageUsage(data.siteJob, current));
      } else {
        if (data.siteJob) {
          setSiteJob((current) => preserveImageUsage(data.siteJob, current));
        }
        if (data.imageGenerationUsage) {
          setSiteJob((current) => (current ? { ...current, imageGenerationUsage: data.imageGenerationUsage } : current));
        }
        setError(data.error || "生成整站设计参考图失败。");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成整站设计参考图失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function saveStyleReferenceSettings() {
    setSavingStyleReferences(true);
    setError("");
    const formData = new FormData();
    const useUploadedReference = styleReferenceMode === "has" && preferUploadedStyleReference;
    formData.append("preferUploadedStyleReference", String(useUploadedReference));
    if (styleReferenceMode === "has") {
      styleReferenceFiles.forEach((file) => formData.append("styleReferenceFiles", file));
    }

    const data = await fetch(`/api/site-jobs/${jobId}/style-references`, {
      method: "POST",
      body: formData
    }).then((res) => res.json());
    setSavingStyleReferences(false);

    if (!data.success) {
      setError(data.error || "保存参考设置失败。");
      return;
    }

    setStyleReferenceFiles([]);
    setSiteJob((current) => preserveImageUsage(data.siteJob, current));
  }

  async function patchStyle(styleId: string, patch: { isFavorite?: boolean; isMainStyle?: boolean }) {
    const data = await fetch(`/api/site-jobs/${jobId}/style-concepts/${styleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }).then((res) => res.json());
    if (data.success) setSiteJob((current) => preserveImageUsage(data.siteJob, current));
  }

  async function selectStyleForCopy(styleId: string) {
    setError("");
    const data = await fetch(`/api/site-jobs/${jobId}/style-concepts/${styleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMainStyle: true })
    }).then((res) => res.json());
    if (!data.success) {
      setError(data.error || "选择官网风格失败，请稍后重试。");
      return;
    }
    setSiteJob((current) => preserveImageUsage(data.siteJob, current));
    router.push(`/site/copy/${jobId}`);
  }

  async function generateWebsite(styleId: string) {
    const hasFinalCopy = Boolean(siteJob?.finalCopyVersionId || siteJob?.copyVersions.some((version) => version.isFinal));
    if (!hasFinalCopy) {
      setError("请先点击“第一步：生成并确认文案”，完成文案整理 / 拓写并确认最终文案后，再生成官网初稿。");
      return;
    }

    setGeneratingSiteId(styleId);
    setWebsiteElapsed(0);
    setError("");
    const data = await fetch(`/api/site-jobs/${jobId}/preview/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleId })
    }).then((res) => res.json());
    setGeneratingSiteId("");

    if (!data.success) {
      setError(data.error || "生成官网失败，请换一张参考图再试。");
      if (data.siteJob) setSiteJob((current) => preserveImageUsage(data.siteJob, current));
      return;
    }

    router.push(`/site/result/${jobId}`);
  }

  async function downloadStyleAsJpg(styleId: string, styleName: string) {
    try {
      const response = await fetch(`/api/site-jobs/${jobId}/style-concepts/${styleId}/image`, { cache: "no-store" });
      if (!response.ok) throw new Error("download failed");
      const blobUrl = URL.createObjectURL(await response.blob());
      const image = new Image();
      image.src = blobUrl;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 1200;
      canvas.height = image.naturalHeight || 760;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const jpgBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((file) => (file ? resolve(file) : reject(new Error("jpg export failed"))), "image/jpeg", 0.92);
      });
      URL.revokeObjectURL(blobUrl);

      const link = document.createElement("a");
      link.href = URL.createObjectURL(jpgBlob);
      link.download = `${safeDownloadName(styleName)}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      setError("下载 JPG 失败，请稍后重试。");
    }
  }

  if (!siteJob) return <main className="p-8 text-sm font-bold text-slate-500">加载中...</main>;

  if (isSiteContentEditingLocked(siteJob)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Style Locked</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">风格修改已关闭</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{SITE_CONTENT_EDIT_LOCKED_MESSAGE}</p>
          <button
            type="button"
            onClick={() => router.push(`/site/result/${jobId}`)}
            className="mt-5 rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            返回官网结果
          </button>
        </section>
      </main>
    );
  }

  const favoriteStyles = siteJob.styleConcepts.filter((style) => style.isFavorite);
  const styleReferenceAssets = siteJob.assets.filter((asset) => asset.assetRole === "style_reference");
  const styleReferenceEnabled = styleReferenceMode === "has";
  const imageUsage = siteJob.imageGenerationUsage || { limit: 9, used: 0, remaining: 9 };
  const canGenerateStyleImages = imageUsage.remaining >= 3;
  const usagePercent = Math.min(100, Math.round((imageUsage.used / imageUsage.limit) * 100));
  const hasBusinessImages = siteJob.assets.some((asset) => asset.mimeType.startsWith("image/") && asset.assetRole !== "style_reference");
  const hasFinalCopy = Boolean(siteJob.finalCopyVersionId || siteJob.copyVersions.some((version) => version.isFinal));

  return (
    <main className="mx-auto grid max-w-[1480px] items-start gap-5 px-4 py-6 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
        <p className="text-xs font-black uppercase tracking-wide text-teal-700">Step 1 / Visual Direction</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">先选择未来官网的样子</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          系统先生成整站视觉参考图。选中一张后，AI 会根据这张图的版式架构、首屏重心和板块节奏拓写官网文案。
        </p>
        <div className="mt-4 max-h-28 overflow-auto rounded-md bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
          <b className="mb-1 block text-slate-900">业务摘要</b>
          {siteJob.businessDescription}
        </div>
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-600">用途：{siteJob.websitePurpose}</div>
        <section className={`mt-4 rounded-lg border p-3 transition ${styleReferenceEnabled ? "border-cyan-100 bg-cyan-50/40" : "border-slate-200 bg-slate-100 opacity-80"}`}>
          <div className="flex items-start justify-between gap-3">
            <h2 className={`text-sm font-black ${styleReferenceEnabled ? "text-slate-950" : "text-slate-500"}`}>是否有希望复刻的官网风格？</h2>
            <div className="grid shrink-0 gap-1 text-xs font-black">
              <label className="flex items-center gap-1.5 text-slate-700">
                <input
                  type="radio"
                  name="style-reference-mode"
                  checked={styleReferenceMode === "has"}
                  onChange={() => setStyleReferenceMode("has")}
                  className="h-3.5 w-3.5 accent-cyan-700"
                />
                有
              </label>
              <label className="flex items-center gap-1.5 text-slate-700">
                <input
                  type="radio"
                  name="style-reference-mode"
                  checked={styleReferenceMode === "none"}
                  onChange={() => {
                    setStyleReferenceMode("none");
                    setPreferUploadedStyleReference(false);
                    setStyleReferenceFiles([]);
                  }}
                  className="h-3.5 w-3.5 accent-slate-500"
                />
                无
              </label>
            </div>
          </div>
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-black leading-5 text-red-700">
            如有，可上传客户喜欢的官网截图并勾选下方选项；若无，无需上传或勾选，直接使用系统生成的风格参考图。
          </p>
          <input
            type="file"
            multiple
            accept={styleReferenceAccept}
            disabled={!styleReferenceEnabled}
            onChange={(event) => setStyleReferenceFiles(Array.from(event.target.files || []).slice(0, 8))}
            className={`mt-3 block w-full rounded-md border border-dashed px-3 py-3 text-xs font-bold ${styleReferenceEnabled ? "border-cyan-300 bg-white text-slate-600" : "cursor-not-allowed border-slate-300 bg-slate-200 text-slate-400"}`}
          />
          {styleReferenceFiles.length ? (
            <div className="mt-2 grid gap-2">
              {styleReferenceFiles.map((file) => (
                <div key={`${file.name}-${file.size}-${file.lastModified}`} className="truncate rounded-md bg-white px-3 py-2 text-xs font-bold text-cyan-800">
                  待上传：{file.name}
                </div>
              ))}
            </div>
          ) : null}
          {styleReferenceAssets.length ? (
            <div className={`mt-3 grid gap-2 ${styleReferenceEnabled ? "" : "pointer-events-none grayscale"}`}>
              {styleReferenceAssets.slice(0, 8).map((asset) => (
                <div key={asset.id} className={`grid grid-cols-[48px_1fr] items-center gap-2 rounded-md p-2 ${styleReferenceEnabled ? "bg-white" : "bg-slate-200"}`}>
                  <img src={asset.url} alt={asset.originalName} className="h-10 w-full rounded object-cover" />
                  <span className={`truncate text-xs font-bold ${styleReferenceEnabled ? "text-slate-600" : "text-slate-400"}`}>{asset.originalName}</span>
                </div>
              ))}
            </div>
          ) : null}
          <label className={`mt-3 flex items-start gap-2 rounded-md p-3 ${styleReferenceEnabled ? "bg-white" : "cursor-not-allowed bg-slate-200"}`}>
            <input
              type="checkbox"
              checked={preferUploadedStyleReference}
              disabled={!styleReferenceEnabled}
              onChange={(event) => setPreferUploadedStyleReference(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cyan-700"
            />
            <span className={`text-xs font-bold leading-5 ${styleReferenceEnabled ? "text-slate-700" : "text-slate-400"}`}>使用上传截图作为最终官网风格依据</span>
          </label>
          <button
            type="button"
            onClick={saveStyleReferenceSettings}
            disabled={savingStyleReferences || loading || Boolean(generatingSiteId)}
            className="mt-3 w-full rounded-md bg-cyan-700 px-3 py-2 text-xs font-black text-white disabled:bg-slate-400"
          >
            {savingStyleReferences ? "保存中..." : "保存参考设置"}
          </button>
        </section>
        <div className="mt-4 grid gap-2">
          {siteJob.assets.slice(0, 6).map((asset) => (
            <div key={asset.id} className="truncate rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              {asset.originalName}
            </div>
          ))}
        </div>
        {siteJob.selectedMainStyleId ? (
          <a href={`/site/copy/${jobId}`} className="mt-5 block rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-black text-white shadow-[0_14px_28px_rgba(37,99,235,.18)] transition hover:-translate-y-0.5 hover:bg-blue-700">
            下一步：根据已选风格拓写文案
          </a>
        ) : (
          <p className="mt-5 rounded-md bg-blue-50 px-3 py-3 text-xs font-black leading-5 text-blue-800">
            请先在右侧选择一张风格图，再进入文案拓写。
          </p>
        )}
        <button
          onClick={generate}
          disabled={loading || Boolean(generatingSiteId) || !canGenerateStyleImages}
          className="mt-3 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-[0_14px_28px_rgba(37,99,235,.18)] transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-80 disabled:hover:translate-y-0"
        >
          {loading ? "正在新增 3 张风格参考图..." : canGenerateStyleImages ? "新增 3 张风格参考图" : "生图次数已达上限"}
        </button>
        <div className="mt-3 rounded-md border border-cyan-100 bg-cyan-50/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-black text-slate-600">本次建站生图额度</span>
            <b className="text-sm text-cyan-700">
              {imageUsage.used}/{imageUsage.limit}
            </b>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${usagePercent}%` }} />
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-600">
            剩余 {imageUsage.remaining} 张。每次新增风格参考图消耗 3 张；{hasBusinessImages ? "已上传业务图片，官网生成通常不再补图。" : "未上传业务图片时，官网生成最多会用剩余额度自动补图 3 张。"}
          </p>
        </div>
        <a href="/site/start" className="mt-3 block rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-black text-slate-700">
          返回上传资料
        </a>
        <section className="mt-5 rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-slate-950">已收藏风格</h2>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-cyan-700">{favoriteStyles.length}</span>
          </div>
          {favoriteStyles.length ? (
            <div className="mt-3 grid gap-3">
              {favoriteStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => (hasFinalCopy ? generateWebsite(style.id) : selectStyleForCopy(style.id))}
                  disabled={Boolean(generatingSiteId)}
                  className="grid grid-cols-[76px_1fr] items-center gap-3 rounded-md bg-white p-2 text-left shadow-sm disabled:opacity-60"
                >
                  <img src={style.imageUrl} alt={style.styleName} className="h-14 w-full rounded object-cover" />
                  <span className="min-w-0">
                    <b className="block truncate text-xs text-slate-950">{publicStyleDescription(style)}</b>
                    <span className="mt-1 block text-[11px] font-bold text-cyan-700">{hasFinalCopy ? "用收藏风格生成官网" : "选定后拓写文案"}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs font-bold leading-5 text-slate-500">点击参考图上的“收藏”，这里会汇总客户喜欢的方向，后续生成官网时也会参考。</p>
          )}
        </section>
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p> : null}
      </aside>

      <section className="grid gap-4">
        {loading ? (
          <ProgressPanel
            elapsed={elapsed}
            estimatedSeconds={estimatedStyleSeconds}
            steps={styleLoadingSteps}
            title="正在制作 3 张整站设计参考图"
            description="风格很重要！我们调用了 image 2 生图模型，优点是漂亮，缺点是慢。可以先喝杯咖啡，稍后再回来查看结果。"
          />
        ) : null}
        {generatingSiteId ? (
          <ProgressPanel
            elapsed={websiteElapsed}
            estimatedSeconds={estimatedWebsiteSeconds}
            steps={websiteLoadingSteps}
            title="正在制作官网初稿"
            description="官网生成引擎正在根据选中的风格图、客户素材和最终文案生成真实可访问的官网。页面生成通常需要 11-15 分钟，请保持当前页面打开。"
            tone="teal"
          />
        ) : null}
        <div className="grid items-start gap-4 md:grid-cols-2">
          {siteJob.styleConcepts.map((style) => {
            const isGenerating = generatingSiteId === style.id;
            const appraisal = styleAppraisal(style);
            return (
              <article key={style.id} className={`self-start rounded-lg border bg-white p-4 shadow-panel ${style.isMainStyle ? "border-teal-600 ring-4 ring-teal-100" : "border-slate-200"}`}>
                <img src={style.imageUrl} alt={style.styleName} className="aspect-[3/2] w-full rounded-md border border-slate-200 object-cover" />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-black text-slate-950">{publicStyleDescription(style)}</h2>
                  {style.mode !== "real" ? <span className={`rounded-full px-2 py-1 text-[11px] font-black ring-1 ${styleModeClass(style.mode)}`}>{styleModeLabel(style.mode)}</span> : null}
                </div>
                <div className="mt-3 rounded-md bg-slate-50 px-3 py-3">
                  <p className="text-xs font-black text-slate-500">鉴赏评语</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{appraisal[0]}</p>
                  <p className="mt-1 text-sm font-bold leading-6 text-slate-700">{appraisal[1]}</p>
                </div>
                {style.mode !== "real" ? (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                    这张不是正式生图结果，只适合临时演示。正式交付建议重新生成真实整站设计参考图后再制作官网。
                  </p>
                ) : null}
                <div className="mt-4 grid grid-cols-[1fr_1.4fr_auto] gap-2">
                  <button onClick={() => patchStyle(style.id, { isFavorite: !style.isFavorite })} disabled={Boolean(generatingSiteId)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold disabled:text-slate-400">
                    {style.isFavorite ? "已收藏" : "收藏"}
                  </button>
                  <button onClick={() => (hasFinalCopy ? generateWebsite(style.id) : selectStyleForCopy(style.id))} disabled={Boolean(generatingSiteId)} className="rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-400">
                    {isGenerating ? "正在制作官网..." : hasFinalCopy ? "用这张生成官网" : style.isMainStyle ? "已选定，去拓写文案" : "选定这张并拓写文案"}
                  </button>
      <button type="button" onClick={() => downloadStyleAsJpg(style.id, style.styleName)} className="rounded-md border border-slate-300 px-3 py-2 text-center text-xs font-bold">
        下载 JPG
      </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
