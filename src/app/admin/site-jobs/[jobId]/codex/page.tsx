"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { copyTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/download-text";
import type { SiteJobDto } from "@/lib/site/site-types";

export default function AdminSiteCodexPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<SiteJobDto | null>(null);
  const [copyState, setCopyState] = useState("");
  useEffect(() => { void fetch(`/api/admin/site-jobs/${jobId}`).then((res) => res.json()).then((data) => data.success && setJob(data.siteJob)); }, [jobId]);
  async function generate() {
    const data = await fetch(`/api/site-jobs/${jobId}/codex-prompt/generate`, { method: "POST" }).then((res) => res.json());
    if (data.success) setJob(data.siteJob);
  }
  async function copy() {
    if (!job?.codexPrompt) {
      setCopyState("暂无任务包，请先重新生成。");
      return;
    }
    const ok = await copyTextToClipboard(job.codexPrompt);
    setCopyState(ok ? "已复制到剪贴板。" : "复制失败，请手动选中文本复制。");
    window.setTimeout(() => setCopyState(""), 2200);
  }
  function download() {
    if (!job?.codexPrompt) {
      setCopyState("暂无任务包，请先重新生成。");
      return;
    }
    downloadTextFile(job.codexPrompt, `Codex建站任务包-${job.customerName || job.id}`);
    setCopyState("TXT 任务包已开始下载。");
    window.setTimeout(() => setCopyState(""), 2200);
  }
  if (!job) return <main className="p-8 text-sm font-bold text-slate-500">加载中...</main>;
  return <main className="mx-auto max-w-6xl px-4 py-6"><section className="rounded-lg bg-white p-5 shadow-panel"><h1 className="text-2xl font-black">Codex 任务包</h1><div className="mt-4 flex gap-3"><button onClick={generate} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-black text-white">重新生成任务包</button><button onClick={copy} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white">复制任务包</button><button onClick={download} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-black">下载 TXT</button></div>{copyState ? <p className="mt-3 text-sm font-bold text-teal-700">{copyState}</p> : null}</section><pre className="mt-5 max-h-[720px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-5 text-sm leading-7 text-white">{job.codexPrompt || "暂无任务包"}</pre></main>;
}
