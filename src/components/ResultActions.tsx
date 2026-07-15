"use client";

type ResultActionsProps = {
  canAct: boolean;
  copied: boolean;
  isBusy?: boolean;
  regeneratedCount?: number;
  onDownload: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
};

export function ResultActions({ canAct, copied, isBusy = false, regeneratedCount = 0, onDownload, onCopy, onRegenerate }: ResultActionsProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-slate-950">操作</h2>
        <span className="text-xs font-bold text-slate-500">已重新生成 {regeneratedCount} 次</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onDownload}
          disabled={!canAct || isBusy}
          className="rounded-md bg-teal-700 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          下载生成图片
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={!canAct || isBusy}
          className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {copied ? "Prompt 已复制" : "复制 Prompt"}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={!canAct || isBusy}
          className="rounded-md bg-orange-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isBusy ? "重新生成中..." : "重新生成"}
        </button>
      </div>
    </section>
  );
}
