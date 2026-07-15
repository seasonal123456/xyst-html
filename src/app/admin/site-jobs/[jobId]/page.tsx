import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getSiteJob } from "@/lib/site/site-job-service";
import type { CopyVersionDto, DeliveryIntegrityReportDto, SiteAssetDto, SiteJobDto, StyleConceptDto } from "@/lib/site/site-types";

type PageProps = { params: Promise<{ jobId: string }> };

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function assetRoleLabel(role?: string | null) {
  if (role === "style_reference") return "风格参考";
  if (role === "qr_code") return "联系二维码";
  return "客户素材";
}

function isImage(asset: SiteAssetDto) {
  return asset.mimeType.startsWith("image/");
}

function finalCopyVersion(job: SiteJobDto) {
  return job.copyVersions.find((version) => version.id === job.finalCopyVersionId || version.isFinal) || null;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-6 text-slate-950">{value || "-"}</p>
    </div>
  );
}

function DownloadLink({ href, label = "下载" }: { href?: string | null; label?: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" download className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">
      {label}
    </a>
  );
}

function DeliveryIntegrityCard({ report, hasPackage }: { report?: DeliveryIntegrityReportDto | null; hasPackage: boolean }) {
  const missingCount = (report?.missingWebsiteAssets.length || 0) + (report?.missingArchivedSourceAssets.length || 0);

  if (!report) {
    return hasPackage ? (
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-black text-amber-900">交付包完整性：暂无结构化报告</p>
        <p className="mt-1 text-xs font-bold leading-5 text-amber-800">旧交付包可能只包含 ZIP 内的 delivery-integrity-report.json，重新生成后会在这里显示图片数量和缺失项。</p>
      </div>
    ) : null;
  }

  const issueRows = [
    ...report.missingWebsiteAssets.map((issue) => ({ ...issue, scope: "website" })),
    ...report.missingArchivedSourceAssets.map((issue) => ({ ...issue, scope: "source-assets" }))
  ];

  return (
    <div className={`mt-4 rounded-md border p-4 ${missingCount ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-black ${missingCount ? "text-red-900" : "text-emerald-900"}`}>交付包完整性：{missingCount ? "存在缺失项" : "通过"}</p>
          <p className="mt-1 text-xs font-bold text-slate-600">生成时间：{formatDate(report.generatedAt)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md bg-white px-3 py-2">
            <p className="text-[11px] font-bold text-slate-500">网站图片</p>
            <p className="text-lg font-black text-slate-950">{report.websiteAssetCount}</p>
          </div>
          <div className="rounded-md bg-white px-3 py-2">
            <p className="text-[11px] font-bold text-slate-500">归档素材</p>
            <p className="text-lg font-black text-slate-950">{report.archivedSourceAssetCount}</p>
          </div>
        </div>
      </div>
      {issueRows.length ? (
        <div className="mt-3 grid gap-2">
          {issueRows.slice(0, 8).map((issue, index) => (
            <p key={`${issue.scope}-${index}`} className="break-all rounded-md bg-white px-3 py-2 text-xs font-bold leading-5 text-red-800">
              {issue.scope} / {issue.reason}: {issue.sourceUrl}
            </p>
          ))}
          {issueRows.length > 8 ? <p className="text-xs font-bold text-red-800">还有 {issueRows.length - 8} 个缺失项，请下载 ZIP 内报告查看完整清单。</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function AssetCard({ asset }: { asset: SiteAssetDto }) {
  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <a href={asset.url} target="_blank" className="block bg-slate-50">
        {isImage(asset) ? (
          <img src={asset.url} alt={asset.originalName} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="grid aspect-[4/3] place-items-center px-4 text-center text-sm font-black text-slate-500">
            {asset.mimeType || "文件素材"}
          </div>
        )}
      </a>
      <div className="grid gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-black text-cyan-700">{assetRoleLabel(asset.assetRole)}</span>
          <span className="text-[11px] font-bold text-slate-400">{formatSize(asset.size)}</span>
        </div>
        <p className="truncate text-sm font-black text-slate-950" title={asset.originalName}>
          {asset.originalName}
        </p>
        <p className="text-xs font-bold text-slate-400">{formatDate(asset.createdAt)}</p>
        <div className="flex flex-wrap gap-2">
          <a href={asset.url} target="_blank" className="rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white">
            预览
          </a>
          <DownloadLink href={asset.url} />
        </div>
      </div>
    </article>
  );
}

function StyleCard({ style, mainStyleId }: { style: StyleConceptDto; mainStyleId?: string | null }) {
  const isMain = style.id === mainStyleId || style.isMainStyle;
  return (
    <article className={`overflow-hidden rounded-md border bg-white ${isMain ? "border-teal-500 ring-4 ring-teal-50" : "border-slate-200"}`}>
      <a href={style.imageUrl} target="_blank" className="block">
        <img src={style.imageUrl} alt={style.styleName} className="aspect-[3/2] w-full object-cover" />
      </a>
      <div className="grid gap-2 p-3">
        <div className="flex flex-wrap gap-2">
          {isMain ? <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-700">主风格</span> : null}
          {style.isFavorite ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">客户收藏</span> : null}
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{style.mode}</span>
        </div>
        <p className="font-black text-slate-950">{style.styleName}</p>
        <p className="line-clamp-3 text-xs font-bold leading-5 text-slate-500">{style.emotionalDescription || style.styleDescription}</p>
        <p className="text-xs font-bold text-slate-400">生成时间：{formatDate(style.createdAt)}</p>
        <div className="flex flex-wrap gap-2">
          <a href={style.imageUrl} target="_blank" className="rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white">
            预览
          </a>
          <DownloadLink href={style.imageUrl} label="下载图片" />
        </div>
      </div>
    </article>
  );
}

function CopyArchive({ version }: { version: CopyVersionDto }) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-slate-950">
          V{version.versionNumber}
          {version.isFinal ? " / 最终版" : ""}
        </h3>
        <span className="text-xs font-bold text-slate-400">{formatDate(version.createdAt)}</span>
      </div>
      <div className="mt-3 grid gap-3">
        {version.contentJson.map((module) => (
          <div key={module.moduleId} className="rounded-md bg-white p-3">
            <p className="text-xs font-black text-teal-700">{module.moduleName}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-7 text-slate-700">{module.content}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

export default async function AdminSiteJobDetailPage({ params }: PageProps) {
  if (!(await isAdminAuthenticated())) {
    return (
      <main className="p-8">
        <Link href="/admin/site-jobs" className="font-bold">
          请先登录管理员后台
        </Link>
      </main>
    );
  }

  const { jobId } = await params;
  const job = await getSiteJob(jobId);
  if (!job) return <main className="p-8 text-sm font-bold text-slate-500">任务不存在。</main>;

  const mainStyle = job.styleConcepts.find((style) => style.id === job.selectedMainStyleId || style.isMainStyle);
  const finalCopy = finalCopyVersion(job);
  const uploadedImages = job.assets.filter(isImage);
  const uploadedFiles = job.assets.filter((asset) => !isImage(asset));

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Customer Case Archive</p>
            <h1 className="mt-2 max-w-5xl text-2xl font-black leading-9 text-slate-950">客户案例档案</h1>
            <p className="mt-2 max-w-5xl truncate text-sm font-bold text-slate-500">{job.businessDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/site-jobs/${job.id}/codex`} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white">
              查看 Codex 任务包
            </Link>
            <Link href={`/admin/site-jobs/${job.id}/delivery`} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-black text-white">
              填写交付信息
            </Link>
            <Link href={`/site/result/${job.id}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-black">
              客户结果页
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <StatCard label="客户/品牌" value={job.customerName || "-"} />
          <StatCard label="联系方式" value={job.customerContact || "-"} />
          <StatCard label="生成任务时间" value={formatDate(job.createdAt)} />
          <StatCard label="当前状态" value={job.status} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <h2 className="text-lg font-black text-slate-950">客户上传原始文案</h2>
          <p className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm font-bold leading-7 text-slate-700">
            {job.businessDescription}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <h2 className="text-lg font-black text-slate-950">最终发布与交付</h2>
          <div className="mt-3 grid gap-3">
            <StatCard label="最终发布域名" value={job.publishedUrl || "-"} />
            <StatCard label="发布时间" value={formatDate(job.publishedAt)} />
            <StatCard label="Netlify 站点" value={job.netlifySiteName || job.netlifySiteId || "-"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {job.publishedUrl ? (
              <a href={job.publishedUrl} target="_blank" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-black text-white">
                打开已发布网站
              </a>
            ) : null}
            {job.previewUrl ? (
              <a href={job.previewUrl} target="_blank" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-black text-slate-700">
                预览最终官网
              </a>
            ) : null}
            <DownloadLink href={job.siteZipUrl} label="下载官网交付包" />
          </div>
          {job.deliveryNote ? <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-4 text-xs leading-6 text-white">{job.deliveryNote}</pre> : null}
          <DeliveryIntegrityCard report={job.deliveryIntegrityReport} hasPackage={Boolean(job.siteZipUrl)} />
          {job.publishError ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{job.publishError}</p> : null}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">客户上传图片与资料</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">图片可缩略图预览，所有文件都保留下载入口，方便后续整理客户案例。</p>
          </div>
          <p className="text-xs font-bold text-slate-400">图片 {uploadedImages.length} 张 / 文件 {uploadedFiles.length} 个</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{job.assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}</div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">官网风格图片</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">保留全部风格候选图，并标记主风格和客户收藏方向。</p>
          </div>
          <p className="text-xs font-bold text-slate-400">主风格：{mainStyle?.styleName || "-"}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {job.styleConcepts.map((style) => (
            <StyleCard key={style.id} style={style} mainStyleId={mainStyle?.id} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">生成的最终文案</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">最终版优先展示；历史版本也保留，便于复盘客户案例迭代过程。</p>
          </div>
          <p className="text-xs font-bold text-slate-400">最终版：{finalCopy ? `V${finalCopy.versionNumber}` : "-"}</p>
        </div>
        <div className="mt-4 grid gap-4">
          {finalCopy ? <CopyArchive version={finalCopy} /> : <p className="rounded-md bg-slate-50 p-4 text-sm font-bold text-slate-500">暂未生成最终文案。</p>}
          {job.copyVersions.filter((version) => version.id !== finalCopy?.id).map((version) => (
            <CopyArchive key={version.id} version={version} />
          ))}
        </div>
      </section>

      {job.codexPrompt || job.adminNote || job.revisions.length ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <h2 className="text-lg font-black text-slate-950">生成记录与运营备注</h2>
          {job.adminNote ? <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-950 p-4 text-sm leading-7 text-white">{job.adminNote}</pre> : null}
          {job.revisions.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {job.revisions.map((revision) => (
                <div key={revision.id} className="rounded-md bg-slate-50 p-3 text-sm">
                  <p className="font-black text-slate-950">修订 V{revision.versionNumber} / {revision.status}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">{formatDate(revision.createdAt)}</p>
                  <p className="mt-2 whitespace-pre-wrap font-bold leading-6 text-slate-600">{revision.revisionInstruction}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {revision.previewUrl ? <a href={revision.previewUrl} target="_blank" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black">预览</a> : null}
                    {revision.screenshotUrl ? <DownloadLink href={revision.screenshotUrl} label="下载截图" /> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {job.codexPrompt ? <pre className="mt-4 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-5 text-xs leading-6 text-white">{job.codexPrompt}</pre> : null}
        </section>
      ) : null}
    </main>
  );
}
