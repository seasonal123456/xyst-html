"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormattedCopyDraft } from "@/components/site/formatted-copy-draft";
import type { CopyVersionDto, SiteJobDto } from "@/lib/site/site-types";

const estimatedBuildSeconds = 420;
const buildSteps = ["确认最终文案", "整理页面结构", "生成官网代码", "适配移动端", "发布预览页面"];

function copyDraft(version: CopyVersionDto) {
  const modules = version.contentJson.slice().sort((a, b) => a.order - b.order);
  const fullCopy = modules.find((module) => module.moduleId === "full_copy");
  if (fullCopy) return fullCopy.content;
  return modules.map((module) => `【${module.moduleName}】\n${module.content}`).join("\n\n");
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function WebsiteBuildLoader({ elapsed }: { elapsed: number }) {
  const progress = Math.min(96, Math.round((elapsed / estimatedBuildSeconds) * 100));
  const remaining = Math.max(0, estimatedBuildSeconds - elapsed);
  const activeStep = Math.min(buildSteps.length - 1, Math.floor((progress / 100) * buildSteps.length));

  return (
    <section className="rounded-lg border border-cyan-100 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Website Engine</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">官网生成引擎正在制作页面</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">生成完整官网通常需要 7 分钟左右，请保持当前页面打开。</p>
        </div>
        <div className="rounded-md bg-slate-950 px-4 py-3 text-right text-white">
          <p className="text-xs font-bold text-cyan-100">预计剩余</p>
          <p className="mt-1 text-2xl font-black">{remaining > 0 ? formatTime(remaining) : "即将完成"}</p>
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-teal-600 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]">
        <div className="grid aspect-[4/3] grid-cols-8 gap-1 rounded-lg border border-slate-200 bg-slate-950 p-3">
          {Array.from({ length: 48 }, (_, index) => (
            <span
              key={index}
              className="h-full rounded-[3px] bg-cyan-400/80 shadow-sm animate-[tilePulse_1.9s_ease-in-out_infinite]"
              style={{
                animationDelay: `${(index % 8) * 95}ms`,
                opacity: 0.24 + ((index + elapsed) % 6) * 0.11
              }}
            />
          ))}
        </div>
        <div className="grid content-center gap-2">
          {buildSteps.map((step, index) => (
            <div key={step} className={`rounded-md px-3 py-2 text-sm font-bold ${index <= activeStep ? "bg-cyan-50 text-teal-800" : "bg-slate-50 text-slate-500"}`}>
              {index + 1}. {step}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function SiteConfirmPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [siteJob, setSiteJob] = useState<SiteJobDto | null>(null);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/site-jobs/${jobId}`)
      .then((res) => res.json())
      .then((data) => data.success && setSiteJob(data.siteJob));
  }, [jobId]);

  useEffect(() => {
    if (!generating) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const latest = siteJob?.copyVersions[0];
  const draft = useMemo(() => (latest ? copyDraft(latest) : ""), [latest]);

  async function generateSite() {
    if (!latest || generating) return;
    setGenerating(true);
    setError("");
    try {
      const finalized = await fetch(`/api/site-jobs/${jobId}/copy/${latest.id}/finalize`, { method: "POST" }).then((res) => res.json());
      if (!finalized.success) {
        setError(finalized.error || "确认文案失败。");
        return;
      }
      const generated = await fetch(`/api/site-jobs/${jobId}/preview/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }).then((res) => res.json());
      if (!generated.success) {
        setError(generated.error || "生成官网失败。");
        return;
      }
      router.push(`/site/result/${jobId}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成官网失败，请稍后重试。");
    } finally {
      setGenerating(false);
    }
  }

  if (!siteJob || !latest) return <main className="p-8 text-sm font-bold text-slate-500">请先生成官网文案。</main>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
        <h1 className="text-2xl font-black text-slate-950">确认最终文案</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          以下整篇文案将作为官网生成的最终内容。确认后，系统会调用官网生成引擎，为你生成真实可访问的官网初稿。
        </p>
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      </section>

      {generating ? <div className="mt-5"><WebsiteBuildLoader elapsed={elapsed} /></div> : null}

      <article className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">官网文案稿</h2>
          <span className="text-xs font-bold text-slate-500">V{latest.versionNumber}</span>
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-4">
          <FormattedCopyDraft content={draft} compact />
        </div>
      </article>

      <div className="mt-5 grid gap-3">
        <button onClick={() => router.push(`/site/copy/${jobId}`)} disabled={generating} className="rounded-md border border-slate-300 px-4 py-3 text-sm font-black disabled:text-slate-400">
          返回继续修改
        </button>
        <button onClick={generateSite} disabled={generating} className="rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:bg-slate-400">
          {generating ? "官网生成中，请稍候..." : "确认文案并一键生成官网"}
        </button>
      </div>
    </main>
  );
}
