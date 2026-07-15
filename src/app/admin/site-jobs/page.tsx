"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin/AdminLogin";
import type { LaunchReadinessIssue } from "@/lib/launch/production-readiness";
import type { SiteJobDto } from "@/lib/site/site-types";

const filters = [
  ["all", "全部"],
  ["materials_uploaded", "已上传资料"],
  ["style_generated", "风格已生成"],
  ["style_selected", "已选主风格"],
  ["copy_reviewing", "文案审核中"],
  ["copy_confirmed", "最终文案已确认"],
  ["codex_prompt_ready", "任务包已生成"],
  ["site_generation_queued", "官网排队中"],
  ["site_generating", "官网生成中"],
  ["client_preview", "客户预览中"],
  ["standard_delivery_ready", "标准交付包已生成"],
  ["delivered", "已交付"],
  ["failed", "失败"]
];

type ReadinessResponse = {
  success: boolean;
  ready?: boolean;
  issues?: LaunchReadinessIssue[];
};

type NetlifyCreditUsage = {
  accountSlug?: string;
  accountName?: string;
  planName?: string;
  included: number;
  used: number;
  remaining: number;
  currentUsagePeriodStart?: string | null;
  nextUsagePeriodStart?: string | null;
};

type NetlifyCreditResponse = {
  success: boolean;
  usage?: NetlifyCreditUsage | null;
  error?: string;
};

const severityText = {
  blocker: "必须处理",
  warning: "上线前建议处理"
};

function formatNetlifyTime(value?: string | null) {
  if (!value) return "以 Netlify Billing 为准";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminSiteJobsPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);
  const [siteJobs, setSiteJobs] = useState<SiteJobDto[]>([]);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [netlifyCredits, setNetlifyCredits] = useState<NetlifyCreditResponse | null>(null);
  const [netlifyCreditsLoading, setNetlifyCreditsLoading] = useState(false);
  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");

  async function check() {
    const data = await fetch("/api/admin/login", { cache: "no-store" }).then((res) => res.json());
    setAuthenticated(Boolean(data.authenticated));
    setChecked(true);
  }

  async function load(nextStatus = status) {
    const params = new URLSearchParams({ status: nextStatus, keyword });
    const response = await fetch(`/api/admin/site-jobs?${params}`, { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      return;
    }
    const data = await response.json();
    if (data.success) setSiteJobs(data.siteJobs);
  }

  async function loadReadiness() {
    setReadinessLoading(true);
    const response = await fetch("/api/admin/launch-readiness", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      setReadinessLoading(false);
      return;
    }
    const data = (await response.json()) as ReadinessResponse;
    setReadiness(data);
    setReadinessLoading(false);
  }

  async function loadNetlifyCredits() {
    setNetlifyCreditsLoading(true);
    const response = await fetch("/api/admin/netlify-credits", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      setNetlifyCreditsLoading(false);
      return;
    }
    const data = (await response.json()) as NetlifyCreditResponse;
    setNetlifyCredits(data);
    setNetlifyCreditsLoading(false);
  }

  useEffect(() => {
    void check();
  }, []);

  useEffect(() => {
    if (authenticated) {
      void load();
      void loadReadiness();
      void loadNetlifyCredits();
    }
  }, [authenticated]);

  if (!checked) return <main className="p-8 text-sm font-bold text-slate-500">正在检查登录状态...</main>;
  if (!authenticated) return <AdminLogin onLoggedIn={() => { setAuthenticated(true); void load(); }} />;

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-950">官网生成任务</h1>
            <p className="mt-2 text-sm text-slate-500">查看客户资料、风格图、文案版本、官网预览和交付状态。</p>
          </div>
          <button
            onClick={loadReadiness}
            disabled={readinessLoading}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-400"
          >
            {readinessLoading ? "检查中..." : "重新检查上线状态"}
          </button>
        </div>
      </header>

      {readiness ? (
        <section className={`mt-5 rounded-lg border p-5 shadow-panel ${readiness.ready ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Launch Readiness</p>
              <h2 className={`mt-2 text-xl font-black ${readiness.ready ? "text-emerald-800" : "text-red-800"}`}>
                {readiness.ready ? "当前检查项已通过，可进入发布前复核" : "暂不建议公开上线"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                上线前重点确认数据库、OSS/CDN、管理员密码、模型密钥、mock fallback 和 Codex 公开生成开关。
              </p>
            </div>
            <div className="rounded-md bg-white/80 px-4 py-3 text-right">
              <p className="text-xs font-bold text-slate-500">待处理</p>
              <p className="text-2xl font-black text-slate-950">{readiness.issues?.length || 0}</p>
            </div>
          </div>
          {readiness.issues?.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {readiness.issues.map((issue) => (
                <div key={issue.code} className="rounded-md border border-white/80 bg-white/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-black text-white ${issue.severity === "blocker" ? "bg-red-700" : "bg-amber-600"}`}>
                      {severityText[issue.severity]}
                    </span>
                    <code className="text-xs font-bold text-slate-500">{issue.code}</code>
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-950">{issue.message}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{issue.fix}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Netlify Credits</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">轻量化部署额度</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              仅管理员可见。生产部署会消耗 Netlify credits，客户前端不会显示这些运营额度。
            </p>
          </div>
          <button
            onClick={loadNetlifyCredits}
            disabled={netlifyCreditsLoading}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:text-slate-400"
          >
            {netlifyCreditsLoading ? "刷新中..." : "刷新额度"}
          </button>
        </div>

        {netlifyCredits?.success && netlifyCredits.usage ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">套餐</p>
              <p className="mt-1 text-lg font-black text-slate-950">{netlifyCredits.usage.planName || "未知"}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{netlifyCredits.usage.accountSlug || netlifyCredits.usage.accountName || "Netlify"}</p>
            </div>
            <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-bold text-emerald-700">剩余额度</p>
              <p className="mt-1 text-2xl font-black text-emerald-800">{netlifyCredits.usage.remaining}</p>
              <p className="mt-1 text-xs font-bold text-emerald-700">/ {netlifyCredits.usage.included} credits</p>
            </div>
            <div className="rounded-md border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-bold text-amber-700">已用额度</p>
              <p className="mt-1 text-2xl font-black text-amber-800">{netlifyCredits.usage.used}</p>
              <p className="mt-1 text-xs font-bold text-amber-700">本用量周期</p>
            </div>
            <div className="rounded-md border border-cyan-100 bg-cyan-50 p-4">
              <p className="text-xs font-bold text-cyan-700">下次刷新</p>
              <p className="mt-1 text-sm font-black leading-6 text-cyan-950">{formatNetlifyTime(netlifyCredits.usage.nextUsagePeriodStart)}</p>
              <p className="mt-1 text-xs font-bold text-cyan-700">当前周期：{formatNetlifyTime(netlifyCredits.usage.currentUsagePeriodStart)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
            {netlifyCreditsLoading ? "正在读取 Netlify 额度..." : netlifyCredits?.error || "暂未读取 Netlify 额度。"}
          </p>
        )}
      </section>

      <div className="my-5 flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setStatus(value);
              void load(value);
            }}
            className={`rounded-full px-3 py-2 text-xs font-black ${status === value ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`}
          >
            {label}
          </button>
        ))}
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="搜索客户/业务"
        />
        <button onClick={() => load()} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-black text-white">
          搜索
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-500">
            <tr>
              <th className="p-3">创建时间</th>
              <th className="p-3">客户</th>
              <th className="p-3">联系方式</th>
              <th className="p-3">业务描述</th>
              <th className="p-3">用途</th>
              <th className="p-3">状态</th>
              <th className="p-3">主风格</th>
              <th className="p-3">最终文案</th>
              <th className="p-3">交付包</th>
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {siteJobs.map((job) => (
              <tr key={job.id} className="border-t border-slate-100">
                <td className="p-3 text-slate-500">{new Date(job.createdAt).toLocaleString("zh-CN")}</td>
                <td className="p-3">{job.customerName || "-"}</td>
                <td className="p-3">{job.customerContact || "-"}</td>
                <td className="max-w-xs truncate p-3 font-bold">{job.businessDescription}</td>
                <td className="p-3">{job.websitePurpose}</td>
                <td className="p-3">{job.status}</td>
                <td className="p-3">{job.selectedMainStyleId ? "已选" : "未选"}</td>
                <td className="p-3">{job.finalCopyVersionId ? "已确认" : "未确认"}</td>
                <td className="p-3">{job.siteZipUrl ? "已生成" : "未生成"}</td>
                <td className="p-3">
                  <Link href={`/admin/site-jobs/${job.id}`} className="rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white">
                    查看详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
