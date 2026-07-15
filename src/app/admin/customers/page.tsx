"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin/AdminLogin";

type CustomerAccount = {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  status: "active" | "disabled";
  note: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RechargeRequest = {
  id: string;
  accountId: string;
  email: string;
  name: string | null;
  currentCredits: number;
  packageName: string;
  requestedCredits: number;
  amountYuan: number;
  contact: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  email: "",
  password: "",
  name: "",
  credits: 1,
  note: ""
};

export default function AdminCustomersPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pendingRechargeRequests = rechargeRequests.filter((request) => request.status === "pending");
  const pendingRechargeAmount = pendingRechargeRequests.reduce((sum, request) => sum + request.amountYuan, 0);

  async function check() {
    const data = await fetch("/api/admin/login", { cache: "no-store" }).then((res) => res.json());
    setAuthenticated(Boolean(data.authenticated));
    setChecked(true);
  }

  async function load() {
    const response = await fetch("/api/admin/customer-accounts", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      return;
    }
    const data = (await response.json()) as { success: boolean; accounts?: CustomerAccount[] };
    if (data.success) setAccounts(data.accounts || []);
  }

  async function loadRechargeRequests() {
    const response = await fetch("/api/admin/recharge-requests", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      return;
    }
    const data = (await response.json()) as { success: boolean; requests?: RechargeRequest[] };
    if (data.success) setRechargeRequests(data.requests || []);
  }

  async function createAccount() {
    setSaving(true);
    setError("");
    const response = await fetch("/api/admin/customer-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = (await response.json()) as { success: boolean; error?: string };
    setSaving(false);
    if (!data.success) {
      setError(data.error || "创建失败。");
      return;
    }
    setForm(emptyForm);
    await load();
    await loadRechargeRequests();
  }

  async function patchAccount(id: string, body: Partial<CustomerAccount> & { password?: string }) {
    setError("");
    const response = await fetch(`/api/admin/customer-accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await response.json()) as { success: boolean; error?: string };
    if (!data.success) {
      setError(data.error || "更新失败。");
      return;
    }
    await load();
    await loadRechargeRequests();
  }

  async function patchRechargeRequest(id: string, status: "approved" | "rejected") {
    setError("");
    const response = await fetch(`/api/admin/recharge-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const data = (await response.json()) as { success: boolean; error?: string };
    if (!data.success) {
      setError(data.error || "处理充值申请失败。");
      return;
    }
    await load();
    await loadRechargeRequests();
  }

  useEffect(() => {
    void check();
  }, []);

  useEffect(() => {
    if (authenticated) {
      void load();
      void loadRechargeRequests();
    }
  }, [authenticated]);

  if (!checked) return <main className="p-8 text-sm font-bold text-slate-500">正在检查管理员登录状态...</main>;
  if (!authenticated) return <AdminLogin onLoggedIn={() => { setAuthenticated(true); void load(); }} />;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-950">客户账号与次数</h1>
            <p className="mt-2 text-sm text-slate-500">后台创建客户登录账号，并设置可用官网生成次数。</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/site-jobs" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">
              官网任务
            </Link>
            <Link href="/admin" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">
              图片任务
            </Link>
          </div>
        </div>
      </header>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-lg font-black">创建客户账号</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="登录邮箱" />
          <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="初始密码" />
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="客户名称" />
          <input type="number" min={0} value={form.credits} onChange={(event) => setForm({ ...form, credits: Number(event.target.value) })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="次数" />
          <button onClick={createAccount} disabled={saving} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-400">
            {saving ? "创建中..." : "创建账号"}
          </button>
        </div>
        <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-3 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="备注，例如客户来源、套餐、沟通记录" />
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      </section>

      <section className="mt-5 rounded-lg border border-blue-100 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">充值申请</h2>
            <p className="mt-1 text-sm text-slate-500">客户扫码付款并提交申请后，会出现在这里。请先按账号、金额和备注核对微信到账记录，再确认加次数。</p>
          </div>
          <button onClick={() => void loadRechargeRequests()} className="rounded-md border border-blue-200 px-3 py-2 text-xs font-black text-blue-700">
            刷新申请
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md bg-amber-50 px-4 py-3">
            <p className="text-xs font-black text-amber-700">待核验充值</p>
            <b className="mt-1 block text-2xl font-black text-amber-800">{pendingRechargeRequests.length} 笔</b>
          </div>
          <div className="rounded-md bg-blue-50 px-4 py-3">
            <p className="text-xs font-black text-blue-700">待确认金额</p>
            <b className="mt-1 block text-2xl font-black text-blue-700">¥{pendingRechargeAmount}</b>
          </div>
          <div className="rounded-md bg-slate-50 px-4 py-3">
            <p className="text-xs font-black text-slate-600">核验口径</p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-600">微信到账金额为 ¥399，备注或昵称能对应客户账号后再点击确认。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {rechargeRequests.length ? (
            rechargeRequests.map((request) => (
              <article key={request.id} className={`rounded-md border p-4 ${request.status === "pending" ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm text-slate-950">{request.name || request.email}</b>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${request.status === "pending" ? "bg-amber-100 text-amber-700" : request.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {request.status === "pending" ? "待处理" : request.status === "approved" ? "已处理" : "已取消"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-600">
                      {request.packageName}：{request.requestedCredits} 次 / ¥{request.amountYuan}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs font-semibold text-slate-500 sm:grid-cols-2">
                      <p>账号邮箱：{request.email}</p>
                      <p>当前剩余：{request.currentCredits} 次</p>
                      <p>申请时间：{new Date(request.createdAt).toLocaleString("zh-CN")}</p>
                      <p>更新时间：{new Date(request.updatedAt).toLocaleString("zh-CN")}</p>
                    </div>
                    <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs font-bold text-slate-700">申请编号：{request.id}</p>
                    {request.contact ? <p className="mt-2 text-xs font-bold text-blue-700">联系方式：{request.contact}</p> : null}
                    {request.note ? <p className="mt-1 text-xs font-semibold text-slate-500">备注：{request.note}</p> : null}
                  </div>
                  {request.status === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void patchRechargeRequest(request.id, "approved")} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-black text-white">
                        确认充值并加次数
                      </button>
                      <button onClick={() => void patchRechargeRequest(request.id, "rejected")} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">
                        取消申请
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-md bg-slate-50 px-3 py-4 text-sm font-bold text-slate-500">暂无充值申请。</p>
          )}
        </div>
      </section>

      <section className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-500">
            <tr>
              <th className="p-3">客户</th>
              <th className="p-3">邮箱</th>
              <th className="p-3">剩余次数</th>
              <th className="p-3">状态</th>
              <th className="p-3">最近登录</th>
              <th className="p-3">备注</th>
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className="border-t border-slate-100">
                <td className="p-3 font-bold">{account.name || "-"}</td>
                <td className="p-3">{account.email}</td>
                <td className="p-3">
                  <input
                    type="number"
                    min={0}
                    defaultValue={account.credits}
                    onBlur={(event) => {
                      const nextCredits = Number(event.target.value);
                      if (Number.isFinite(nextCredits) && nextCredits !== account.credits) void patchAccount(account.id, { credits: nextCredits });
                    }}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm font-black"
                  />
                </td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${account.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {account.status === "active" ? "启用" : "停用"}
                  </span>
                </td>
                <td className="p-3 text-slate-500">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("zh-CN") : "-"}</td>
                <td className="max-w-xs truncate p-3 text-slate-500">{account.note || "-"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => void patchAccount(account.id, { status: account.status === "active" ? "disabled" : "active" })} className="rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white">
                      {account.status === "active" ? "停用" : "启用"}
                    </button>
                    <button onClick={() => void patchAccount(account.id, { credits: account.credits + 1 })} className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-black text-white">
                      +1 次
                    </button>
                    <button
                      onClick={() => {
                        const password = window.prompt("输入新密码，留空取消");
                        if (password) void patchAccount(account.id, { password });
                      }}
                      className="rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
                    >
                      改密码
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
