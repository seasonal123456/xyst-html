"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function QueuedSiteActions({ jobId, canCancel = true, canRegenerate = false }: { jobId: string; canCancel?: boolean; canRegenerate?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function cancelQueue() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/site-jobs/${jobId}/queue`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    setLoading(false);

    if (!data.success) {
      setError(data.error || "取消排队失败，请稍后重试。");
      return;
    }

    router.push(`/site/style/${jobId}`);
    router.refresh();
  }

  async function regenerateWebsite() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/site-jobs/${jobId}/preview/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    setLoading(false);

    if (!data.success) {
      setError(data.error || "重新生成失败，请稍后重试。");
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {canRegenerate ? (
        <button
          type="button"
          onClick={regenerateWebsite}
          disabled={loading}
          className="rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-400"
        >
          {loading ? "正在重新提交..." : "重新生成官网"}
        </button>
      ) : null}
      {canCancel ? (
        <button
          type="button"
          onClick={cancelQueue}
          disabled={loading}
          className="rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-400"
        >
          {loading ? "正在取消..." : "取消排队并返回修改"}
        </button>
      ) : null}
      <a href={`/site/copy/${jobId}`} className="rounded-md border border-slate-300 px-5 py-3 text-sm font-black text-slate-700">
        返回修改文案
      </a>
      <a href={`/site/style/${jobId}`} className="rounded-md border border-cyan-200 px-5 py-3 text-sm font-black text-cyan-700">
        返回修改风格
      </a>
      {error ? <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
