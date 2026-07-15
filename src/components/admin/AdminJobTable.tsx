"use client";

import Link from "next/link";
import type { GenerateJob } from "@/types";
import { JobStatusBadge } from "@/components/admin/JobStatusBadge";

export function AdminJobTable({ jobs }: { jobs: GenerateJob[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-panel">
      <table className="min-w-[980px] w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-extrabold text-slate-500">
          <tr>
            <th className="px-4 py-3">创建时间</th>
            <th className="px-4 py-3">企业 / 项目</th>
            <th className="px-4 py-3">客户</th>
            <th className="px-4 py-3">联系方式</th>
            <th className="px-4 py-3">类型</th>
            <th className="px-4 py-3">风格</th>
            <th className="px-4 py-3">状态</th>
            <th className="px-4 py-3">模式</th>
            <th className="px-4 py-3">精修</th>
            <th className="px-4 py-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-t border-slate-100">
              <td className="px-4 py-3 text-slate-500">{new Date(job.createdAt).toLocaleString("zh-CN")}</td>
              <td className="px-4 py-3 font-extrabold text-slate-950">{job.input.name}</td>
              <td className="px-4 py-3">{job.input.customerName || "-"}</td>
              <td className="px-4 py-3">{job.input.customerContact || "-"}</td>
              <td className="px-4 py-3">{job.input.contentType}</td>
              <td className="px-4 py-3">{job.input.style}</td>
              <td className="px-4 py-3"><JobStatusBadge status={job.status} /></td>
              <td className="px-4 py-3">{job.mode}</td>
              <td className="px-4 py-3">{job.input.needManualRefine ? "需要" : "否"}</td>
              <td className="px-4 py-3">
                <Link href={`/admin/${job.id}`} className="rounded-md bg-slate-950 px-3 py-2 text-xs font-extrabold text-white">查看详情</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
