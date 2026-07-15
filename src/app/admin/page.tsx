"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminJobTable } from "@/components/admin/AdminJobTable";
import { AdminLogin } from "@/components/admin/AdminLogin";
import type { GenerateJob, JobStatus } from "@/types";

const filters: Array<{ label: string; value: "all" | JobStatus }> = [
  { label: "全部", value: "all" },
  { label: "待处理", value: "pending" },
  { label: "生成中", value: "generating" },
  { label: "已生成", value: "completed" },
  { label: "待人工审核", value: "review" },
  { label: "已交付", value: "delivered" },
  { label: "失败", value: "failed" }
];

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);
  const [jobs, setJobs] = useState<GenerateJob[]>([]);
  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");

  async function checkAuth() {
    const response = await fetch("/api/admin/login", { cache: "no-store" });
    const data = (await response.json()) as { authenticated?: boolean };
    setAuthenticated(Boolean(data.authenticated));
    setChecked(true);
  }

  const loadJobs = useCallback(async (nextStatus = status) => {
    const params = new URLSearchParams({ status: nextStatus, keyword });
    const response = await fetch(`/api/admin/jobs?${params.toString()}`, { cache: "no-store" });

    if (response.status === 401) {
      setAuthenticated(false);
      return;
    }

    const data = (await response.json()) as { success: boolean; jobs?: GenerateJob[] };
    if (data.success) setJobs(data.jobs || []);
  }, [keyword, status]);

  useEffect(() => {
    void checkAuth();
  }, []);

  useEffect(() => {
    if (authenticated) void loadJobs();
  }, [authenticated, loadJobs]);

  if (!checked) {
    return <main className="p-8 text-sm font-bold text-slate-500">正在检查管理员登录状态...</main>;
  }

  if (!authenticated) {
    return <AdminLogin onLoggedIn={() => { setAuthenticated(true); void loadJobs(); }} />;
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-950">管理员后台</h1>
            <p className="mt-2 text-sm text-slate-500">查看客户提交、Prompt、素材、生成结果和交付状态。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/customers" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-black text-white">
              会员管理
            </Link>
            <Link href="/admin/site-jobs" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">
              官网任务
            </Link>
          </div>
        </div>
      </header>
      <div className="my-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                setStatus(filter.value);
                void loadJobs(filter.value);
              }}
              className={`rounded-full px-3 py-2 text-xs font-extrabold ${status === filter.value ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索企业、客户、联系方式" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button onClick={() => loadJobs()} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-extrabold text-white">搜索</button>
      </div>
      <AdminJobTable jobs={jobs} />
    </main>
  );
}
