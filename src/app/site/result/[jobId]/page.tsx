import { FormattedCopyDraft } from "@/components/site/formatted-copy-draft";
import { QueuedSiteActions } from "@/components/site/queued-site-actions";
import { SiteRevisionPanel } from "@/components/site/site-revision-panel";
import { StandardDeliveryActions } from "@/components/site/standard-delivery-actions";
import { prisma } from "@/lib/db";
import { getSiteJobDeploymentNumber } from "@/lib/site/site-publisher";
import { getSiteJob } from "@/lib/site/site-job-service";
import type { CopyVersionDto, SiteJobDto } from "@/lib/site/site-types";

type PageProps = { params: Promise<{ jobId: string }> };
type QueueInfo = {
  rankLabel: string;
  estimatedTimeLabel: string;
};

const websiteGenerationWarning = "若关闭页面可能会导致生成失败，请保持当前页面打开。";

function copyDraft(version: CopyVersionDto) {
  const modules = version.contentJson.slice().sort((a, b) => a.order - b.order);
  const fullCopy = modules.find((module) => module.moduleId === "full_copy");
  if (fullCopy) return fullCopy.content;
  return modules.map((module) => `【${module.moduleName}】\n${module.content}`).join("\n\n");
}

function statusLabel(status: string) {
  if (status === "standard_delivery_ready") return "标准交付包已生成";
  if (status === "client_preview") return "客户预览中";
  if (status === "site_generation_queued") return "官网排队生成中";
  if (status === "site_generating") return "官网生成中";
  if (status === "failed") return "生成失败";
  return status;
}

function isWebsiteGeneratingStatus(status: string) {
  return status === "site_generation_queued" || status === "site_generating";
}

function publicFailureDescription(siteJob: SiteJobDto) {
  const note = siteJob.adminNote || "";
  const lower = note.toLowerCase();
  if (lower.includes("invalid token") || lower.includes("http 401")) {
    return "官网内容配图接口返回密钥无效，导致本次生成中断。系统已记录原始错误，管理员可检查模型 API key；你也可以点击重新生成官网。";
  }
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("http 504")) {
    return "模型接口本次响应超时，导致官网生成中断。可以点击重新生成官网；如果连续出现，请联系管理员调高模型网关超时时间。";
  }
  if (note) return note;
  return "生成过程中出现错误，可直接重新生成官网；如多次失败，请返回修改文案或风格后再试。";
}

function headerContent(siteJob: SiteJobDto) {
  if (siteJob.previewUrl) {
    return {
      eyebrow: "Website Ready",
      title: "你的官网初稿已生成",
      description: "这是根据你确认的文案、选择的官网方向和上传资料生成的真实网页。交付包可下载保存到 U 盘；如需网站公开上线，请联系客服协助部署。"
    };
  }
  if (siteJob.status === "site_generation_queued") {
    return {
      eyebrow: "Website Queue",
      title: "官网已进入生成队列",
      description: "任务已提交，请保持当前页面打开。如需停止生成，可取消排队并返回修改。"
    };
  }
  if (siteJob.status === "site_generating") {
    return {
      eyebrow: "Website Engine",
      title: "官网正在生成",
      description: "本机生成引擎正在制作官网，请保持 worker 和服务运行。生成完成后页面会自动刷新为预览结果。"
    };
  }
  if (siteJob.status === "failed") {
    return {
      eyebrow: "Generation Failed",
      title: "官网生成失败",
      description: publicFailureDescription(siteJob)
    };
  }
  return {
    eyebrow: "Website Draft",
    title: "官网尚未生成",
    description: "当前任务还没有官网预览结果。请先完成文案确认和风格选择，再生成官网初稿。"
  };
}

function WebsiteGenerationWarning() {
  return (
    <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-base font-black leading-7 text-red-700">
      {websiteGenerationWarning}
    </p>
  );
}

function generationStage(siteJob: SiteJobDto) {
  if (siteJob.status === "site_generation_queued") return "等待本机 worker 领取任务";
  if (siteJob.adminNote?.includes("发布官网预览")) return "发布官网预览并回写结果";
  if (siteJob.adminNote?.includes("Codex")) return "调用 Codex 生成官网代码";
  if (siteJob.adminNote?.includes("素材")) return "准备官网生成素材";
  if (siteJob.status === "site_generating") return "官网生成引擎正在制作页面";
  return "等待生成结果";
}

async function getQueueInfo(jobId: string): Promise<QueueInfo> {
  const queue = await prisma.siteJob.findMany({
    where: { status: { in: ["site_generation_queued", "site_generating"] } },
    select: {
      id: true,
      status: true,
      siteGenerationQueuedAt: true,
      siteGenerationStartedAt: true,
      updatedAt: true,
      createdAt: true
    }
  });

  const sorted = queue.sort((a, b) => {
    const aTime = (a.siteGenerationQueuedAt || a.siteGenerationStartedAt || a.updatedAt || a.createdAt).getTime();
    const bTime = (b.siteGenerationQueuedAt || b.siteGenerationStartedAt || b.updatedAt || b.createdAt).getTime();
    return aTime - bTime;
  });
  const index = sorted.findIndex((item) => item.id === jobId);
  const rank = index >= 0 ? index + 1 : sorted.length ? sorted.length : 1;
  const current = sorted[index];

  if (current?.status === "site_generating") {
    return { rankLabel: "正在制作", estimatedTimeLabel: "约 7-17 分钟" };
  }

  return {
    rankLabel: `第 ${rank} 位`,
    estimatedTimeLabel: rank <= 1 ? "约 13-20 分钟" : `约 ${rank * 17}-${rank * 20} 分钟`
  };
}

function WebsiteGenerationProgress({ siteJob, queueInfo }: { siteJob: SiteJobDto; queueInfo: QueueInfo }) {
  const stage = generationStage(siteJob);
  const steps = ["排队", "准备素材", "Codex 生成", "发布预览", "完成"];
  const activeIndex = siteJob.status === "site_generation_queued" ? 0 : stage.includes("素材") ? 1 : stage.includes("Codex") ? 2 : stage.includes("发布") ? 3 : 2;
  const progress = siteJob.status === "site_generation_queued" ? 12 : Math.min(88, 30 + activeIndex * 16);

  return (
    <section className="mt-5 rounded-lg border border-cyan-100 bg-white p-5 shadow-panel">
      <meta httpEquiv="refresh" content="15" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Website Engine</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">官网正在生成，请保持页面打开</h2>
          <p className="mt-4 max-w-2xl rounded-md border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm font-bold leading-7 text-cyan-950">
            我们充分重视每一次的官网制作，正在调用我们能力范围内最前沿的模型制作。这意味着这份完整的网站 + 代码包需要经历数十甚至数百次的迭代，才能送到您手上。请相信，每一分钟的等待都值得。
          </p>
        </div>
        <div className="grid gap-2 rounded-md bg-slate-950 px-4 py-3 text-right text-white sm:min-w-36">
          <div>
            <p className="text-xs font-bold text-cyan-100">当前排名</p>
            <p className="mt-1 text-xl font-black">{queueInfo.rankLabel}</p>
          </div>
          <div className="border-t border-white/10 pt-2">
            <p className="text-xs font-bold text-cyan-100">预计时间</p>
            <p className="mt-1 text-xl font-black">{queueInfo.estimatedTimeLabel}</p>
          </div>
          <div className="border-t border-white/10 pt-2">
            <p className="text-xs font-bold text-cyan-100">预估进度</p>
            <p className="mt-1 text-2xl font-black">{progress}%</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[280px_1fr]">
        <div className="grid aspect-[4/3] grid-cols-7 gap-1.5 rounded-lg border border-cyan-100 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-4">
          {Array.from({ length: 42 }, (_, index) => (
            <span
              key={index}
              className="h-full rounded-[3px] bg-cyan-300/80 shadow-[0_0_18px_rgba(34,211,238,.18)] animate-[tilePulse_1.9s_ease-in-out_infinite]"
              style={{ animationDelay: `${(index % 7) * 90}ms`, opacity: 0.24 + (index % 5) * 0.12 }}
            />
          ))}
        </div>
        <div className="grid content-center gap-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-cyan-500 transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            {steps.map((step, index) => (
              <div key={step} className={`rounded-md border px-3 py-3 text-xs font-black ${index <= activeIndex ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-white text-slate-400"}`}>
                <span className="block text-lg">{String(index + 1).padStart(2, "0")}</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function SiteResultPage({ params }: PageProps) {
  const { jobId } = await params;
  const siteJob = await getSiteJob(jobId);
  if (!siteJob) return <main className="p-8 text-sm font-bold text-slate-500">官网结果不存在。</main>;

  const mainStyle = siteJob.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle);
  const finalCopy = siteJob.copyVersions.find((version) => version.isFinal) || siteJob.copyVersions[0];
  const queueInfo = await getQueueInfo(siteJob.id);
  const deploymentNumber = await getSiteJobDeploymentNumber(siteJob);
  const header = headerContent(siteJob);
  const isGenerating = isWebsiteGeneratingStatus(siteJob.status);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-teal-700">{header.eyebrow}</p>
            <h1 className="mt-2 text-4xl font-black text-slate-950">{header.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {header.description}
            </p>
            {isGenerating ? <WebsiteGenerationWarning /> : null}
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{statusLabel(siteJob.status)}</span>
        </div>

        {siteJob.previewUrl ? null : isGenerating ? (
          <>
            <WebsiteGenerationProgress siteJob={siteJob} queueInfo={queueInfo} />
            <QueuedSiteActions jobId={siteJob.id} canCancel={siteJob.status === "site_generation_queued"} />
          </>
        ) : (
          <QueuedSiteActions jobId={siteJob.id} canCancel={false} canRegenerate={siteJob.status === "failed"} />
        )}
      </section>

      {siteJob.previewUrl ? (
        <>
          <StandardDeliveryActions
            jobId={siteJob.id}
            siteZipUrl={siteJob.siteZipUrl}
            publishedUrl={siteJob.publishedUrl}
            publishStatus={siteJob.publishStatus}
            netlifySiteId={siteJob.netlifySiteId}
            netlifySiteName={siteJob.netlifySiteName}
            deploymentNumber={deploymentNumber}
          />
        </>
      ) : null}

      {siteJob.deliveryNote ? (
        <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-panel">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Delivery Note</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">标准交付说明</h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-md bg-white p-3 text-sm leading-6 text-slate-700">{siteJob.deliveryNote}</pre>
        </section>
      ) : null}

      {finalCopy ? (
        <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50/70 p-5 shadow-panel">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-teal-700">Final Copy</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">最终文案摘要</h2>
            </div>
          </div>
          <FormattedCopyDraft content={copyDraft(finalCopy)} compact />
        </section>
      ) : null}

      {mainStyle ? <img src={mainStyle.imageUrl} alt={mainStyle.styleName} className="mt-5 w-full rounded-lg border border-slate-200 shadow-panel" /> : null}
      {siteJob.screenshotUrl && siteJob.screenshotUrl !== mainStyle?.imageUrl ? (
        <img src={siteJob.screenshotUrl} alt="官网截图" className="mt-5 w-full rounded-lg border border-slate-200 shadow-panel" />
      ) : null}

      {siteJob.previewUrl ? <SiteRevisionPanel jobId={siteJob.id} revisions={siteJob.revisions} /> : null}
    </main>
  );
}
