"use client";

import { useState } from "react";
import type { GenerateJob, JobStatus } from "@/types";

export function AdminActions({ job, onUpdated }: { job: GenerateJob; onUpdated: (job: GenerateJob) => void }) {
  const [adminNote, setAdminNote] = useState(job.adminNote || "");
  const [loading, setLoading] = useState("");

  async function patch(patch: { status?: JobStatus; adminNote?: string }) {
    setLoading(patch.status || "note");
    const response = await fetch(`/api/admin/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const data = (await response.json()) as { success: boolean; job?: GenerateJob; error?: string };
    setLoading("");
    if (data.success && data.job) onUpdated(data.job);
  }

  async function regenerate() {
    setLoading("regenerate");
    const response = await fetch(`/api/regenerate/${job.id}`, { method: "POST" });
    const data = (await response.json()) as { success: boolean; job?: GenerateJob };
    setLoading("");
    if (data.job) onUpdated(data.job);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-lg font-bold text-slate-950">管理员操作</h2>
      <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className="mt-4 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="管理员备注" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={() => navigator.clipboard.writeText(job.prompt)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-extrabold">复制 Prompt</button>
        <button onClick={regenerate} disabled={Boolean(loading)} className="rounded-md bg-orange-600 px-3 py-2 text-sm font-extrabold text-white disabled:bg-slate-400">重新生成</button>
        <button onClick={() => patch({ status: "review" })} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-extrabold text-white">标记待审核</button>
        <button onClick={() => patch({ status: "delivered" })} className="rounded-md bg-teal-700 px-3 py-2 text-sm font-extrabold text-white">标记已交付</button>
        <button onClick={() => patch({ status: "failed" })} className="rounded-md bg-red-600 px-3 py-2 text-sm font-extrabold text-white">标记失败</button>
        <button onClick={() => patch({ adminNote })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-extrabold">保存备注</button>
      </div>
      {job.generatedImageUrl ? <a href={job.generatedImageUrl} download className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-extrabold text-white">下载结果图</a> : null}
    </section>
  );
}
