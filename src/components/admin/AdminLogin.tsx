"use client";

import { useState } from "react";

export function AdminLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = (await response.json()) as { success: boolean; error?: string };
    setLoading(false);

    if (!data.success) {
      setError(data.error || "登录失败。");
      return;
    }

    onLoggedIn();
  }

  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
      <h1 className="text-xl font-black text-slate-950">管理员登录</h1>
      <p className="mt-2 text-sm text-slate-500">这里是运营后台入口，用于管理客户会员、次数和生成任务。</p>
      <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-900">
        客户注册/登录请使用公开会员入口；管理员登录后可在“客户账号与次数”中开通会员、充值次数、停用账号或重置密码。
      </div>
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void login();
        }}
        className="mt-5 w-full rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
        placeholder="输入 ADMIN_PASSWORD"
      />
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      <button onClick={login} disabled={loading} className="mt-5 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-extrabold text-white disabled:bg-slate-400">
        {loading ? "登录中..." : "登录"}
      </button>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-black">
        <a href="/login" className="text-blue-700">
          客户会员登录
        </a>
        <a href="/register" className="text-slate-500">
          注册新会员
        </a>
      </div>
    </div>
  );
}
