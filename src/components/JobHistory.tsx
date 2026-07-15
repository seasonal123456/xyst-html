"use client";

import type { GenerateJob } from "@/types";

type JobHistoryProps = {
  jobs: GenerateJob[];
  activeJobId?: string;
  onViewJob: (id: string) => void;
};

const statusText: Record<GenerateJob["status"], string> = {
  pending: "等待处理",
  uploading: "素材保存中",
  prompt_ready: "Prompt 已生成",
  generating: "图片生成中",
  completed: "已完成",
  review: "待人工审核",
  delivered: "已交付",
  archived: "已归档",
  failed: "失败"
};

const modeText: Record<GenerateJob["mode"], string> = {
  mock: "Mock",
  real: "Real",
  fallback: "兜底"
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function JobHistory({ jobs, activeJobId, onViewJob }: JobHistoryProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-lg font-bold text-slate-950">最近生成记录</h2>
      <div className="mt-4 grid gap-3">
        {jobs.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            暂无生成记录。
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className={`rounded-lg border p-3 ${
                activeJobId === job.id ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-950">{job.input.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatTime(job.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onViewJob(job.id)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:border-teal-600 hover:text-teal-700"
                >
                  查看
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-white px-2 py-1 text-slate-600">{job.input.contentType}</span>
                <span className="rounded-full bg-white px-2 py-1 text-slate-600">{job.input.style}</span>
                <span className="rounded-full bg-white px-2 py-1 text-slate-600">{modeText[job.mode]}</span>
                <span className="rounded-full bg-white px-2 py-1 text-slate-600">{statusText[job.status]}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
