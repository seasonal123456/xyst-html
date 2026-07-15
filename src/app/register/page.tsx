"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/account";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = (await response.json()) as { success: boolean; error?: string };
    setLoading(false);

    if (!data.success) {
      setError(data.error || "注册失败。");
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#eef6ff,#ffffff_45%,#f8fbff)] px-4 py-10 text-slate-950">
      <section className="mx-auto grid max-w-5xl overflow-hidden rounded-lg border border-blue-100 bg-white shadow-[0_30px_90px_rgba(47,111,237,.16)] lg:grid-cols-[.95fr_1.05fr]">
        <div className="relative min-h-[560px] overflow-hidden bg-blue-600 p-8 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.35),transparent_28%),radial-gradient(circle_at_80%_72%,rgba(15,23,42,.24),transparent_35%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <a href="/" className="inline-flex items-center gap-3 font-black">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-white text-blue-600">新</span>
                <span>新颖数投</span>
              </a>
              <h1 className="mt-16 max-w-md text-4xl font-black leading-tight">注册会员账号，开始生成官网</h1>
              <p className="mt-5 max-w-md text-sm font-semibold leading-7 text-blue-50">
                注册后会自动登录。账号进入会员管理系统，生成次数由后台统一配置；如果当前没有赠送次数，可以联系管理员开通体验或充值。
              </p>
            </div>
            <div className="grid gap-3 text-sm font-bold text-blue-50">
              <p className="rounded-md bg-white/14 px-4 py-3 backdrop-blur">注册账号 → 后台开通次数 → 上传资料 → 生成官网</p>
              <p className="rounded-md bg-white/14 px-4 py-3 backdrop-blur">为了防止被刷爆模型额度，注册送次数可由管理员配置。</p>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10">
          <h2 className="text-2xl font-black">新会员注册</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">填写邮箱和密码后即可创建客户账号。</p>
          <div className="mt-8 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-700">姓名 / 企业名</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="例如：新颖数投"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-700">邮箱</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="customer@example.com"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-700">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="至少 8 位"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-700">确认密码</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="再次输入密码"
              />
            </label>
          </div>

          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          <button onClick={submit} disabled={loading} className="mt-6 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:bg-slate-400">
            {loading ? "注册中..." : "注册并进入工作台"}
          </button>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm font-black">
            <a href={`/login?next=${encodeURIComponent(next)}`} className="text-blue-700">
              已有账号，去登录
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

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm font-bold text-slate-500">正在加载注册页...</main>}>
      <RegisterForm />
    </Suspense>
  );
}
