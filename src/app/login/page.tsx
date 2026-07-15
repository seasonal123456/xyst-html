"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/account";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = (await response.json()) as { success: boolean; error?: string };
    setLoading(false);

    if (!data.success) {
      setError(data.error || "登录失败。");
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-950">
      <section className="mx-auto grid max-w-5xl overflow-hidden rounded-lg bg-white shadow-[0_30px_90px_rgba(15,23,42,.35)] lg:grid-cols-[1.05fr_.95fr]">
        <div className="relative min-h-[520px] overflow-hidden bg-cyan-500 p-8 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,.38),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(15,23,42,.3),transparent_32%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <a href="/" className="inline-flex items-center gap-3 font-black">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-cyan-600">新</span>
                <span>新颖数投工作台</span>
              </a>
              <h1 className="mt-16 max-w-md text-4xl font-black leading-tight">登录后开始生成你的官网初稿</h1>
              <p className="mt-5 max-w-md text-sm font-semibold leading-7 text-cyan-50">
                已有账号可直接登录；新客户可以先注册会员账号，再由后台开通体验次数或充值次数。
              </p>
            </div>
            <div className="grid gap-3 text-sm font-bold text-cyan-50">
              <p className="rounded-md bg-white/14 px-4 py-3 backdrop-blur">上传资料 → 生成 3 张风格图 → 确认文案 → 生成官网</p>
              <p className="rounded-md bg-white/14 px-4 py-3 backdrop-blur">每个官网任务第一次生成风格图时扣 1 次，后续文案、官网初稿和交付包不重复扣次。</p>
            </div>
          </div>
        </div>
        <div className="p-8 lg:p-10">
          <h2 className="text-2xl font-black">客户登录</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">请输入会员邮箱和密码。没有账号可以先注册，次数由后台统一管理。</p>
          <div className="mt-8 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-700">邮箱</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                placeholder="customer@example.com"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-700">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                placeholder="请输入密码"
              />
            </label>
          </div>
          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          <button onClick={submit} disabled={loading} className="mt-6 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:bg-slate-400">
            {loading ? "登录中..." : "登录并开始生成"}
          </button>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm font-black">
            <a href={`/register?next=${encodeURIComponent(next)}`} className="text-cyan-700">
              没有账号？注册新会员
            </a>
            <a href="/" className="text-slate-500">
              返回首页
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm font-bold text-slate-500">正在加载登录页...</main>}>
      <LoginForm />
    </Suspense>
  );
}
