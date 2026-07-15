"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function AdminSiteDeliveryPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [siteZipUrl, setSiteZipUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [message, setMessage] = useState("");
  async function save(status = "client_preview") {
    const data = await fetch(`/api/site-jobs/${jobId}/delivery`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewUrl, siteZipUrl, screenshotUrl, deliveryNote, status }) }).then((res) => res.json());
    setMessage(data.success ? "已保存交付信息。" : "保存失败。");
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h1 className="text-2xl font-black">填写官网交付信息</h1>
        <div className="mt-5 grid gap-3">
          <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} className="rounded-md border px-3 py-2 text-sm" placeholder="网站预览地址 previewUrl" />
          <input value={siteZipUrl} onChange={(e) => setSiteZipUrl(e.target.value)} className="rounded-md border px-3 py-2 text-sm" placeholder="网站 ZIP 地址 siteZipUrl" />
          <input value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} className="rounded-md border px-3 py-2 text-sm" placeholder="官网截图地址 screenshotUrl" />
          <textarea value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} className="min-h-28 rounded-md border px-3 py-2 text-sm" placeholder="交付说明 deliveryNote" />
          <div className="grid gap-3 sm:grid-cols-3"><button onClick={() => save("site_generated")} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white">标记官网已生成</button><button onClick={() => save("client_preview")} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-black text-white">标记客户预览</button><button onClick={() => save("delivered")} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-black text-white">标记已交付</button></div>
          {message ? <p className="text-sm font-bold text-teal-700">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}
