"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const purposes = ["展示公司", "展示产品", "展示项目", "招商获客", "收集咨询", "AI 帮我判断"];
const maxBusinessUploadFiles = 60;
const maxBusinessUploadMB = 200;
const qrCodeFileAccept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const businessFileAccept = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".txt",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".rar",
  ".7z",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/vnd.rar"
].join(",");

type FileWithPath = File & { webkitRelativePath?: string };
type CustomerAccount = {
  email: string;
  name: string | null;
  credits: number;
};

export default function SiteStartPage() {
  const router = useRouter();
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [businessDescription, setBusinessDescription] = useState("");
  const [sourceCopy, setSourceCopy] = useState("");
  const [websitePurpose, setWebsitePurpose] = useState("AI 帮我判断");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [qrCodeFiles, setQrCodeFiles] = useState<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [materialConsent, setMaterialConsent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/login", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; account?: CustomerAccount }) => {
        setAccount(data.authenticated && data.account ? data.account : null);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  function mergeBusinessFiles(nextFiles: File[]) {
    const merged = [...files];
    const seen = new Set(files.map((file) => `${(file as FileWithPath).webkitRelativePath || file.name}-${file.size}-${file.lastModified}`));
    for (const file of nextFiles) {
      const key = `${(file as FileWithPath).webkitRelativePath || file.name}-${file.size}-${file.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(file);
    }
    setFiles(merged.slice(0, maxBusinessUploadFiles));
  }

  function fileDisplayName(file: File) {
    return (file as FileWithPath).webkitRelativePath || file.name;
  }

  async function submit() {
    if (!account) {
      router.push("/login?next=/site/start");
      return;
    }
    if (account.credits <= 0) {
      setError("当前账号可用次数不足，请联系管理员充值。");
      return;
    }
    if (!businessDescription.trim()) {
      setError("请先用一句话描述你的业务。");
      return;
    }
    if (!materialConsent) {
      setError("请先确认素材授权。");
      return;
    }

    const formData = new FormData();
    formData.append("businessDescription", businessDescription);
    formData.append("sourceCopy", sourceCopy);
    formData.append("websitePurpose", websitePurpose);
    formData.append("customerName", customerName);
    formData.append("customerContact", customerContact);
    formData.append("materialConsent", String(materialConsent));
    qrCodeFiles.forEach((file) => formData.append("qrCodeFiles", file, file.name));
    files.forEach((file) => formData.append("files", file, fileDisplayName(file)));

    setLoading(true);
    setError("");
    const response = await fetch("/api/site-jobs", { method: "POST", body: formData });
    const data = (await response.json()) as { success: boolean; siteJob?: { id: string }; error?: string };
    setLoading(false);

    if (!data.success || !data.siteJob) {
      setError(data.error || "创建官网任务失败。");
      return;
    }
    router.push(`/site/style/${data.siteJob.id}`);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAccount(null);
    router.push("/login?next=/site/start");
  }

  if (!authChecked) {
    return <main className="p-8 text-sm font-bold text-slate-500">正在检查登录状态...</main>;
  }

  if (!account) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-panel">
          <h1 className="text-2xl font-black text-slate-950">请先登录客户账号</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            官网生成已启用次数卡。登录后才能上传资料并开始生成，后台会为每个客户账号设置可用次数。
          </p>
          <a href="/login?next=/site/start" className="mt-6 inline-block rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white">
            登录后开始生成
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-100 bg-white px-4 py-3 shadow-panel">
        <div>
          <p className="text-sm font-black text-slate-950">{account.name || account.email}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">剩余官网生成次数：<span className="text-cyan-700">{account.credits}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => router.push("/account")} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-black text-white">
            会员中心
          </button>
          <button onClick={logout} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">
            退出登录
          </button>
        </div>
      </div>
      <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
        <h1 className="text-3xl font-black text-slate-950">
          上传资料，先看 3 个未来官网，再把选中的做成真实网站
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          客户不需要先写完整需求。系统会根据有限资料生成 3 张整站设计参考图，选中最有感觉的一张后，再由大模型整理文案逻辑、拓写内容，并生成可打开、可分享、可继续精修的官网初稿。
        </p>
      </header>

      <section className="mt-5 grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <label>
          <span className="text-sm font-extrabold text-slate-700">一句话描述业务 *</span>
          <textarea
            value={businessDescription}
            onChange={(event) => setBusinessDescription(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="例如：我做佛山工业地产推荐，想展示产业园和厂房项目，让客户加微信咨询。"
          />
        </label>

        <label>
          <span className="text-sm font-extrabold text-slate-700">已有文案 / 原始资料文字</span>
          <p className="mt-1 rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold leading-5 text-cyan-900">
            若无特别要求，可不填写。后续会由大模型梳理业务逻辑、重组网站结构，并进行文案拓展；这里不是必须项，只是有现成公司介绍、产品说明、朋友圈文案、宣传册文字时可作为参考。
          </p>
          <textarea
            value={sourceCopy}
            onChange={(event) => setSourceCopy(event.target.value)}
            className="mt-2 min-h-40 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-7"
            placeholder="可粘贴现有介绍、产品说明、服务内容、项目资料、客户案例等。没有也可以留空。"
          />
        </label>

        <div>
          <span className="text-sm font-extrabold text-slate-700">网站主要用途</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {purposes.map((purpose) => (
              <button
                key={purpose}
                type="button"
                onClick={() => setWebsitePurpose(purpose)}
                className={`rounded-full px-3 py-2 text-xs font-extrabold ${
                  websitePurpose === purpose ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {purpose}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="联系人 / 品牌名"
          />
          <input
            value={customerContact}
            onChange={(event) => setCustomerContact(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="电话 / 微信"
          />
        </div>

        <div>
          <span className="text-sm font-extrabold text-slate-700">上传资料</span>
          <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-600">
            若无特别要求，可不上传。支持图片、PDF、Office 文档、TXT/CSV、ZIP/RAR/7Z 压缩包，也可以直接选择一个资料文件夹批量上传；系统可以先根据业务描述生成方案，上传资料只是为了让大模型更准确地理解你的产品、项目和品牌细节。
          </p>
          <div className="mt-3 grid gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 md:grid-cols-2">
            <label className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm font-bold text-slate-700">
              <span>选择文件 / 压缩包</span>
              <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">可多选，适合上传产品图、介绍文档、PDF 或 ZIP 资料包。</span>
              <input
                type="file"
                multiple
                accept={businessFileAccept}
                onChange={(event) => mergeBusinessFiles(Array.from(event.target.files || []))}
                className="mt-3 block w-full text-sm"
              />
            </label>
            <label className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm font-bold text-slate-700">
              <span>选择整个文件夹</span>
              <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">适合客户把图片、文档、报价表放在同一个资料文件夹里一次上传。</span>
              <input
                type="file"
                multiple
                ref={(input) => {
                  input?.setAttribute("webkitdirectory", "");
                  input?.setAttribute("directory", "");
                }}
                onChange={(event) => mergeBusinessFiles(Array.from(event.target.files || []))}
                className="mt-3 block w-full text-sm"
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
            <span>最多 {maxBusinessUploadFiles} 个文件 / 图片</span>
            <span>总大小上限 {maxBusinessUploadMB}MB</span>
            {files.length ? (
              <button type="button" onClick={() => setFiles([])} className="text-red-600">
                清空已选资料
              </button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => (
              <div key={`${fileDisplayName(file)}-${file.size}-${file.lastModified}`} className="rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                <span className="block truncate">{fileDisplayName(file)}</span>
                <span className="mt-1 block text-slate-400">{Math.max(1, Math.round(file.size / 1024))}KB</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
          <span className="text-sm font-extrabold text-slate-700">上传微信 / 联系二维码</span>
          <p className="mt-1 text-xs font-bold leading-5 text-emerald-900">
            可选，仅上传 1 张。二维码会作为联系转化素材，只允许出现在联系区或微信卡片，不会作为英雄页背景、画廊图片或装饰图。
          </p>
          <input
            type="file"
            accept={qrCodeFileAccept}
            onChange={(event) => setQrCodeFiles(Array.from(event.target.files || []).slice(0, 1))}
            className="mt-3 block w-full text-sm"
          />
          {qrCodeFiles.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold text-emerald-800">
              <span>{qrCodeFiles[0].name}</span>
              <button type="button" onClick={() => setQrCodeFiles([])} className="text-red-600">
                移除二维码
              </button>
            </div>
          ) : null}
        </div>

        <label className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-3">
          <input
            type="checkbox"
            checked={materialConsent}
            onChange={(event) => setMaterialConsent(event.target.checked)}
            className="mt-1 h-4 w-4 accent-teal-700"
          />
          <span className="text-sm font-bold text-teal-900">
            我确认上传的素材可用于本次官网风格、文案和网站初稿生成测试。
          </span>
        </label>

        {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
        <button
          onClick={submit}
          disabled={loading}
          className="rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-400"
        >
          {loading ? "提交中..." : "下一步：生成整站设计参考图"}
        </button>
      </section>
    </main>
  );
}
