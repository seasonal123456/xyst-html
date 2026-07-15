"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteRevisionDto } from "@/lib/site/site-types";

type Props = {
  jobId: string;
  revisions: SiteRevisionDto[];
};

export function SiteRevisionPanel({ jobId, revisions }: Props) {
  const router = useRouter();
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const sortedRevisions = useMemo(
    () => revisions.slice().sort((a, b) => b.versionNumber - a.versionNumber),
    [revisions]
  );
  const nextRevisionIsFree = revisions.length === 0;
  const remainingCharacters = 1200 - revisionInstruction.length;

  async function submitRevision() {
    const trimmed = revisionInstruction.trim();
    if (trimmed.length < 4) {
      setError("请至少写 4 个字的修改意见。");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/site-jobs/${jobId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionInstruction: trimmed })
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        queued?: boolean;
        chargedCreditAmount?: number;
        remainingCredits?: number;
      };
      if (!data.success) {
        setError(data.error || "生成修改版官网失败。");
        return;
      }
      setRevisionInstruction("");
      if (data.queued) {
        setMessage(
          data.chargedCreditAmount
            ? `修改任务已进入生成队列，本次消耗 ${data.chargedCreditAmount} 次，剩余 ${data.remainingCredits ?? "-"} 次。`
            : "修改任务已进入生成队列。本次为首次修改，未消耗次数。"
        );
      } else {
        setMessage(
          data.chargedCreditAmount
            ? `修改版已生成，本次消耗 ${data.chargedCreditAmount} 次，剩余 ${data.remainingCredits ?? "-"} 次。`
            : "修改版已生成。本次为首次修改，未消耗次数。"
        );
      }
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成修改版官网失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Revision</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">提交修改意见，生成新版官网</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            写清楚希望调整的视觉、板块、文案或图片方向。首次修改免费，第二次及以后每次消耗 1 次。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
          {nextRevisionIsFree ? "下一次修改免费" : "下一次修改消耗 1 次"}
        </span>
      </div>

      <textarea
        value={revisionInstruction}
        onChange={(event) => setRevisionInstruction(event.target.value.slice(0, 1200))}
        className="mt-4 min-h-32 w-full rounded-md border border-slate-300 p-3 text-sm leading-6 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        placeholder="例如：首屏希望更有冲击力；服务板块不要太像卡片；整体更接近参考图的曲线和渐变；联系方式放得更明显。"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-xs font-bold ${remainingCharacters < 80 ? "text-amber-700" : "text-slate-500"}`}>
          最多 1200 字，还可输入 {remainingCharacters} 字
        </p>
        <button
          onClick={submitRevision}
          disabled={loading}
          className="rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:bg-slate-400 disabled:shadow-none"
        >
          {loading ? "正在生成修改版，请稍候..." : "提交修改意见并生成新版"}
        </button>
      </div>

      {loading ? (
        <div className="mt-4 overflow-hidden rounded-md border border-teal-100 bg-teal-50 p-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-teal-600" />
          </div>
          <p className="mt-2 text-xs font-bold text-teal-800">官网生成引擎正在重新排版与生成页面，通常需要 3-10 分钟。</p>
        </div>
      ) : null}
      {message ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

      {sortedRevisions.length ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-black text-slate-950">历史修改版本</h3>
          <div className="mt-3 grid gap-3">
            {sortedRevisions.map((revision) => (
              <article key={revision.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-sm text-slate-950">第 {revision.versionNumber} 次修改</b>
                  <span className="text-xs font-bold text-slate-500">{new Date(revision.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{revision.revisionInstruction}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-black">
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">状态：{revision.status}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">消耗：{revision.chargedCreditAmount} 次</span>
                  {revision.previewUrl ? (
                    <a href={revision.previewUrl} target="_blank" rel="noreferrer" className="rounded-full bg-teal-700 px-3 py-1 text-white">
                      打开该版本
                    </a>
                  ) : null}
                </div>
                {revision.error ? <p className="mt-2 text-xs font-bold text-amber-700">{revision.error}</p> : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
