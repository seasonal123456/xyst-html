import type { JobStatus } from "@/types";

export const statusText: Record<JobStatus, string> = {
  pending: "待处理",
  uploading: "素材保存中",
  prompt_ready: "Prompt 已生成",
  generating: "图片生成中",
  completed: "已生成",
  review: "待人工审核",
  delivered: "已交付",
  failed: "失败",
  archived: "已归档"
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const tone = status === "failed" ? "bg-red-100 text-red-700" : status === "delivered" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-700";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${tone}`}>{statusText[status]}</span>;
}
