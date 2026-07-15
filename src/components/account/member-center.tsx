"use client";

import { useEffect, useState } from "react";

type Account = {
  email: string;
  name: string | null;
  credits: number;
};

type RechargeRequest = {
  id: string;
  packageName: string;
  requestedCredits: number;
  amountYuan: number;
  contact: string | null;
  note: string | null;
  status: string;
  createdAt: string;
};

const packages = [
  { packageName: "单次建站包", requestedCredits: 1, amountYuan: 399, description: "适合购买 1 次官网生成额度，提交后由管理员确认开通。" }
];

function statusLabel(status: string) {
  if (status === "approved") return "已处理";
  if (status === "rejected") return "已取消";
  return "待处理";
}

export function MemberCenter({ account }: { account: Account }) {
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [selectedPackage, setSelectedPackage] = useState(packages[0].packageName);
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedRechargePackage = packages.find((item) => item.packageName === selectedPackage) || packages[0];

  async function loadRequests() {
    const response = await fetch("/api/account/recharge-requests", { cache: "no-store" });
    const data = (await response.json()) as { success: boolean; requests?: RechargeRequest[] };
    if (data.success) setRequests(data.requests || []);
  }

  async function submitRechargeRequest() {
    setLoading(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/account/recharge-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageName: selectedPackage, contact, note })
    });
    const data = (await response.json()) as { success: boolean; error?: string };
    setLoading(false);
    if (!data.success) {
      setError(data.error || "提交充值申请失败。");
      return;
    }
    setMessage("充值申请已提交，管理员处理后次数会自动增加。");
    setNote("");
    await loadRequests();
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  const lowCredits = account.credits <= 2;
  const noCredits = account.credits <= 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#eef6ff,#ffffff_44%,#f8fbff)] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-lg border border-blue-100 bg-white p-6 shadow-[0_20px_70px_rgba(47,111,237,.10)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-600">Member Center</p>
              <h1 className="mt-2 text-3xl font-black">会员中心</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">{account.name || account.email}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-5 py-4 text-center">
              <p className="text-xs font-black text-blue-700">剩余生成次数</p>
              <b className="mt-1 block text-4xl font-black text-blue-600">{account.credits}</b>
            </div>
          </div>

          {noCredits ? (
            <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700">
              当前账号暂无可用次数。请先提交充值申请或联系管理员开通体验次数，再开始生成官网。
            </div>
          ) : lowCredits ? (
            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
              剩余次数较少，建议提前充值，避免官网生成或二次修改时中断。
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/site/start" className="rounded-md bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700">
              开始生成官网
            </a>
            <a href="/login" className="rounded-md border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-700">
              切换账号
            </a>
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-lg border border-blue-100 bg-white p-6 shadow-[0_20px_70px_rgba(47,111,237,.08)]">
            <h2 className="text-xl font-black">充值套餐</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              当前为人工审核充值。提交申请后，管理员确认收款或授权后会在后台为你增加次数。
            </p>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_220px]">
              <div className="grid gap-4">
                {packages.map((item) => (
                  <button
                    key={item.packageName}
                    onClick={() => setSelectedPackage(item.packageName)}
                    className={`rounded-lg border p-4 text-left transition hover:-translate-y-1 ${
                      selectedPackage === item.packageName ? "border-blue-500 bg-blue-50 shadow-[0_16px_46px_rgba(47,111,237,.14)]" : "border-slate-200 bg-white"
                    }`}
                  >
                    <b className="text-base text-slate-950">{item.packageName}</b>
                    <p className="mt-3 text-3xl font-black text-blue-600">{item.requestedCredits} 次</p>
                    <p className="mt-1 text-sm font-black text-slate-700">¥{item.amountYuan}</p>
                    <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{item.description}</p>
                  </button>
                ))}
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-900">
                  为避免生成失败造成的损失，请在备注处填写账号信息以便管理员回溯：{account.email}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                <p className="text-xs font-black text-emerald-700">微信收款码</p>
                <img src="/payments/wechat-recharge-qr.jpg" alt="微信收款码" className="mt-3 aspect-square w-full rounded-md bg-white object-cover" />
                <p className="mt-3 text-sm font-black text-slate-950">应付 ¥{selectedRechargePackage.amountYuan}</p>
                <p className="mt-1 text-xs font-bold text-slate-600">{selectedRechargePackage.requestedCredits} 次官网生成额度</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="联系方式，例如微信 / 手机号"
              />
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-24 rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="付款备注，例如：已于 14:35 微信支付 399 元，付款昵称/备注为 xxx，需要开通到当前账号。"
              />
              <button onClick={submitRechargeRequest} disabled={loading} className="rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-400">
                {loading ? "提交中..." : "提交充值申请"}
              </button>
            </div>
            {message ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
            {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          </div>

          <div className="rounded-lg border border-blue-100 bg-white p-6 shadow-[0_20px_70px_rgba(47,111,237,.08)]">
            <h2 className="text-xl font-black">充值申请记录</h2>
            <div className="mt-5 grid gap-3">
              {requests.length ? (
                requests.map((item) => (
                  <article key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <b className="text-sm text-slate-950">{item.packageName}</b>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${item.status === "pending" ? "bg-amber-100 text-amber-700" : item.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-600">
                      {item.requestedCredits} 次 / ¥{item.amountYuan}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  </article>
                ))
              ) : (
                <p className="rounded-md bg-slate-50 px-3 py-4 text-sm font-bold text-slate-500">暂无充值申请。</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
