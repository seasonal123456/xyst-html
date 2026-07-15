import type { GenerateJob } from "@/types";

function sellingPoints(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

export function ResultSharePage({ job }: { job: GenerateJob }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-sm font-extrabold text-teal-700">小规模试用结果页</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">{job.input.name}</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1">{job.input.contentType}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">{job.input.style}</span>
        </div>
      </section>

      {job.generatedImageUrl ? <img src={job.generatedImageUrl} alt={job.input.name} className="mt-5 w-full rounded-lg border border-slate-200 bg-white shadow-panel" /> : null}

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-lg font-bold text-slate-950">核心卖点</h2>
        <div className="mt-3 grid gap-2">
          {sellingPoints(job.input.sellingPoints).map((point) => (
            <div key={point} className="rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{point}</div>
          ))}
        </div>
        {job.generatedImageUrl ? <a href={job.generatedImageUrl} download className="mt-5 inline-block rounded-md bg-teal-700 px-4 py-3 text-sm font-extrabold text-white">下载结果图</a> : null}
      </section>
    </main>
  );
}
