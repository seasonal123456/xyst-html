"use client";

import { useState } from "react";
import type { GenerateJob } from "@/types";
import { AdminActions } from "@/components/admin/AdminActions";
import { JobStatusBadge } from "@/components/admin/JobStatusBadge";

export function AdminJobDetail({ initialJob }: { initialJob: GenerateJob }) {
  const [job, setJob] = useState(initialJob);

  return (
    <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">{job.input.name}</h1>
            <p className="mt-1 text-sm text-slate-500">客户：{job.input.customerName || "-"} / {job.input.customerContact || "-"}</p>
          </div>
          <JobStatusBadge status={job.status} />
        </div>
        <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md bg-slate-50 p-3"><b>出图类型</b><br />{job.input.contentType}</div>
          <div className="rounded-md bg-slate-50 p-3"><b>设计风格</b><br />{job.input.style}</div>
          <div className="rounded-md bg-slate-50 p-3"><b>模式</b><br />{job.mode}</div>
          <div className="rounded-md bg-slate-50 p-3"><b>重新生成</b><br />{job.regeneratedCount || 0} 次</div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-lg font-bold text-slate-950">上传素材</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {job.uploadedFiles.map((file) => (
            <a key={file.id || file.storedName} href={file.url} target="_blank" className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <img src={file.url} alt={file.originalName} className="aspect-video w-full rounded object-cover" />
              <p className="mt-2 truncate text-xs font-bold text-slate-700">{file.originalName}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-lg font-bold text-slate-950">Prompt</h2>
        <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-4 text-sm leading-7 text-white">{job.prompt}</pre>
      </section>

      {job.generatedImageUrl ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <h2 className="text-lg font-bold text-slate-950">生成结果</h2>
          <img src={job.generatedImageUrl} alt="生成结果" className="mt-4 w-full rounded-lg border border-slate-200" />
          <p className="mt-3 break-all text-sm font-bold text-slate-600">公开结果页：{job.publicResultUrl || `/result/${job.id}`}</p>
        </section>
      ) : null}

      <AdminActions job={job} onUpdated={setJob} />
    </div>
  );
}
