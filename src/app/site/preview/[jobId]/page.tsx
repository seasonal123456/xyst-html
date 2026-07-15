import { getSiteJob } from "@/lib/site/site-job-service";

type PageProps = { params: Promise<{ jobId: string }> };

export default async function SitePreviewPage({ params }: PageProps) {
  const { jobId } = await params;
  const siteJob = await getSiteJob(jobId);

  if (!siteJob) {
    return <main className="p-8 text-sm font-bold text-slate-500">官网预览不存在。</main>;
  }

  if (!siteJob.previewUrl) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Preview</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">官网还在生成中</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">请稍后返回结果页刷新，生成完成后这里会显示在线浏览页面。</p>
          <a href={`/site/result/${siteJob.id}`} className="mt-5 inline-block rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white">
            返回结果页
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-teal-700">Online Preview</p>
            <h1 className="mt-1 text-lg font-black text-slate-950">官网在线预览</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/site/result/${siteJob.id}`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700">
              返回结果页
            </a>
            <a href={siteJob.previewUrl} target="_blank" rel="noreferrer" className="rounded-md bg-slate-950 px-4 py-2 text-xs font-black text-white">
              全屏浏览
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-4">
        <div className="mb-3 rounded-md bg-white px-3 py-2 text-xs font-bold text-slate-500">
          当前为在线预览模式。下载交付文件请返回结果页生成标准交付包。
        </div>
        <iframe
          title="官网在线预览"
          src={siteJob.previewUrl}
          className="min-h-[calc(100vh-150px)] flex-1 rounded-lg border border-slate-200 bg-white shadow-panel"
        />
      </section>
    </main>
  );
}
