"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { copyTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/download-text";
import type { SiteJobDto } from "@/lib/site/site-types";

export default function SiteCodexPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [siteJob, setSiteJob] = useState<SiteJobDto | null>(null);
  const [copyState, setCopyState] = useState("");
  useEffect(() => { void fetch(`/api/site-jobs/${jobId}`).then((res) => res.json()).then((data) => data.success && setSiteJob(data.siteJob)); }, [jobId]);
  async function copy() {
    if (!siteJob?.codexPrompt) {
      setCopyState("任务包尚未生成。");
      return;
    }
    const ok = await copyTextToClipboard(siteJob.codexPrompt);
    setCopyState(ok ? "已复制到剪贴板。" : "复制失败，请手动选中文本复制。");
    window.setTimeout(() => setCopyState(""), 2200);
  }
  function download() {
    if (!siteJob?.codexPrompt) {
      setCopyState("任务包尚未生成。");
      return;
    }
    downloadTextFile(siteJob.codexPrompt, `Codex建站任务包-${siteJob.customerName || siteJob.id}`);
    setCopyState("TXT 任务包已开始下载。");
    window.setTimeout(() => setCopyState(""), 2200);
  }
  if (!siteJob) return <main className="p-8 text-sm font-bold text-slate-500">加载中...</main>;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h1 className="text-2xl font-black text-slate-950">Codex 建站任务包</h1>
        <p className="mt-2 text-sm text-slate-600">您的最终文案已确认，管理员将基于该任务包生成官网初稿。</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={copy} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-black text-white">复制任务包</button>
          <button onClick={download} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white">下载 TXT</button>
        </div>
        {copyState ? <p className="mt-3 text-sm font-bold text-teal-700">{copyState}</p> : null}
      </section>
      <pre className="mt-5 max-h-[680px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-5 text-sm leading-7 text-white">{siteJob.codexPrompt || "任务包尚未生成。"}</pre>
    </main>
  );
}
