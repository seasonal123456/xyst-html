"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { isSiteContentEditingLocked, SITE_CONTENT_EDIT_LOCKED_MESSAGE } from "@/lib/site/site-edit-lock";
import type { CopyModule, CopyRange, CopyVersionDto, SiteJobDto } from "@/lib/site/site-types";

const copyCharLimit = 8000;
const generationWarning = "请注意！AI 生成中切勿关闭当前窗口！否则可能造成丢包，从而生成失败！";

type HighlightType = "lock" | "reject";
type HighlightSegment = { text: string; type?: HighlightType };

function sortModules(modules: CopyModule[]) {
  return modules.slice().sort((a, b) => a.order - b.order);
}

function toDraftModule(version?: CopyVersionDto): CopyModule | null {
  if (!version) return null;
  const modules = sortModules(version.contentJson);
  const fullCopy = modules.find((module) => module.moduleId === "full_copy");
  if (fullCopy) return { ...fullCopy, order: 1 };

  const content = modules.map((module) => `【${module.moduleName}】\n${module.content}`).join("\n\n");
  return {
    moduleId: "full_copy",
    moduleName: "官网文案稿",
    content,
    order: 1,
    lockedRanges: modules.flatMap((module) => module.lockedRanges || []),
    rejectedRanges: modules.flatMap((module) => module.rejectedRanges || []),
    manualEdited: modules.some((module) => module.manualEdited)
  };
}

function collectMatches(content: string, ranges: CopyRange[], type: HighlightType) {
  const matches: Array<{ start: number; end: number; type: HighlightType }> = [];

  for (const range of ranges) {
    const text = range.text?.trim();
    if (!text) continue;

    const directStart = range.startOffset;
    const directEnd = range.endOffset;
    if (
      typeof directStart === "number" &&
      typeof directEnd === "number" &&
      directStart >= 0 &&
      directEnd > directStart &&
      content.slice(directStart, directEnd) === range.text
    ) {
      matches.push({ start: directStart, end: directEnd, type });
      continue;
    }

    let start = content.indexOf(text);
    let count = 0;
    while (start >= 0 && count < 20) {
      matches.push({ start, end: start + text.length, type });
      start = content.indexOf(text, start + text.length);
      count += 1;
    }
  }

  return matches;
}

function highlightedSegments(draft: CopyModule): HighlightSegment[] {
  const content = draft.content;
  const matches = [
    ...collectMatches(content, draft.rejectedRanges, "reject"),
    ...collectMatches(content, draft.lockedRanges, "lock")
  ]
    .filter((item) => item.end <= content.length)
    .sort((a, b) => a.start - b.start || (a.type === "reject" ? -1 : 1));

  const accepted: typeof matches = [];
  for (const match of matches) {
    const overlaps = accepted.some((item) => match.start < item.end && match.end > item.start);
    if (!overlaps) accepted.push(match);
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const match of accepted) {
    if (match.start > cursor) segments.push({ text: content.slice(cursor, match.start) });
    segments.push({ text: content.slice(match.start, match.end), type: match.type });
    cursor = match.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  return segments.length ? segments : [{ text: content }];
}

function highlightClass(type?: HighlightType) {
  if (type === "lock") return "rounded bg-slate-950 px-1 py-0.5 font-black text-white shadow-sm";
  if (type === "reject") return "rounded bg-red-100 px-1 py-0.5 font-black text-red-700 ring-1 ring-red-200";
  return "";
}

function GenerationWarning() {
  return <p className="mt-6 text-center text-base font-black leading-7 text-red-600 md:text-lg">{generationWarning}</p>;
}

export default function SiteCopyPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [siteJob, setSiteJob] = useState<SiteJobDto | null>(null);
  const [draft, setDraft] = useState<CopyModule | null>(null);
  const [activeVersionId, setActiveVersionId] = useState("");
  const [selected, setSelected] = useState<{ start: number; end: number; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const segments = useMemo(() => (draft ? highlightedSegments(draft) : []), [draft]);
  const overLimit = Boolean(draft && draft.content.length > copyCharLimit);

  async function load() {
    const data = await fetch(`/api/site-jobs/${jobId}`, { cache: "no-store" }).then((res) => res.json());
    if (!data.success) return;
    setSiteJob(data.siteJob);
    const latest = data.siteJob.copyVersions[0] as CopyVersionDto | undefined;
    if (latest) {
      setActiveVersionId(latest.id);
      setDraft(toDraftModule(latest));
    }
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  useEffect(() => {
    if (!generating) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = generationWarning;
      return generationWarning;
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [generating]);

  async function save(nextDraft = draft) {
    if (!activeVersionId || !nextDraft) return;
    setSaving(true);
    await fetch(`/api/site-jobs/${jobId}/copy/${activeVersionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentJson: [nextDraft] })
    });
    setSaving(false);
  }

  async function generateNext() {
    const selectedMainStyle = siteJob?.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle);
    if (!selectedMainStyle && siteJob?.styleConcepts.length) {
      setError("请先在图片风格页选择一张官网风格图，再根据图片架构拓写文案。");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      await save();
      const data = await fetch(`/api/site-jobs/${jobId}/copy/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionInstruction: copyFeedback })
      }).then((res) => res.json());
      if (!data.success) {
        setError(data.error || "文案生成失败，请稍后重试。");
        return;
      }
      setSiteJob(data.siteJob);
      const latest = data.siteJob.copyVersions[0] as CopyVersionDto;
      setActiveVersionId(latest.id);
      setDraft(toDraftModule(latest));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "文案生成失败，请稍后重试。");
    } finally {
      setGenerating(false);
    }
  }

  function capture() {
    const el = editorRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    setSelected({ start: el.selectionStart, end: el.selectionEnd, text: el.value.slice(el.selectionStart, el.selectionEnd) });
  }

  function syncScroll() {
    if (!editorRef.current || !overlayRef.current) return;
    overlayRef.current.scrollTop = editorRef.current.scrollTop;
    overlayRef.current.scrollLeft = editorRef.current.scrollLeft;
  }

  function mark(type: "lock" | "reject") {
    if (!selected || !draft) return;
    const range = { text: selected.text, startOffset: selected.start, endOffset: selected.end };
    const next =
      type === "lock"
        ? {
            ...draft,
            lockedRanges: [...draft.lockedRanges, range],
            rejectedRanges: draft.rejectedRanges.filter((item) => item.text !== selected.text),
            manualEdited: true
          }
        : {
            ...draft,
            rejectedRanges: [...draft.rejectedRanges, range],
            lockedRanges: draft.lockedRanges.filter((item) => item.text !== selected.text),
            manualEdited: true
          };
    setDraft(next);
    void save(next);
  }

  function updateContent(content: string) {
    setDraft((current) => ({
      ...(current || {
        moduleId: "full_copy",
        moduleName: "官网文案稿",
        order: 1,
        lockedRanges: [],
        rejectedRanges: [],
        manualEdited: true
      }),
      content,
      manualEdited: true
    }));
  }

  async function finalize() {
    if (!activeVersionId) return;
    setFinalizing(true);
    setError("");
    try {
      if (draft) await save(draft);
      const finalized = await fetch(`/api/site-jobs/${jobId}/copy/${activeVersionId}/finalize`, {
        method: "POST",
        credentials: "same-origin"
      }).then((res) => res.json());
      if (!finalized.success) {
        setError(finalized.error || "确认最终文案失败，请稍后重试。");
        return;
      }

      const selectedMainStyle = finalized.siteJob?.styleConcepts?.find(
        (style: { id: string; isMainStyle: boolean }) => style.id === finalized.siteJob?.selectedMainStyleId || style.isMainStyle
      );
      const generated = await fetch(`/api/site-jobs/${jobId}/preview/generate`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleId: selectedMainStyle?.id })
      }).then((res) => res.json());
      if (!generated.success) {
        setError(generated.error || "最终文案已提交，但官网生成启动失败，请稍后重试。");
        if (generated.siteJob) setSiteJob(generated.siteJob);
        return;
      }

      router.push(`/site/result/${jobId}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "提交最终文案失败，请稍后重试。");
    } finally {
      setFinalizing(false);
    }
  }

  if (!siteJob) return <main className="p-8 text-sm font-bold text-slate-500">加载中...</main>;

  if (isSiteContentEditingLocked(siteJob)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">Copy Locked</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">文案修改已关闭</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{SITE_CONTENT_EDIT_LOCKED_MESSAGE}</p>
          <button
            type="button"
            onClick={() => router.push(`/site/result/${jobId}`)}
            className="mt-5 rounded-md bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            返回官网结果
          </button>
        </section>
      </main>
    );
  }

  const selectedMainStyle = siteJob.styleConcepts.find((style) => style.id === siteJob.selectedMainStyleId || style.isMainStyle);

  return (
    <main className="mx-auto grid max-w-[1480px] gap-5 px-4 py-6 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-xs font-black uppercase tracking-wide text-teal-700">Step 2 / Copy From Visual</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">根据图片架构拓写文案</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          AI 会先读取你选定的官网风格图，再按照它的首屏重心、板块节奏和视觉层级，把客户资料拓展成完整官网文案。
        </p>
        {selectedMainStyle ? (
          <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/50 p-3">
            <img src={selectedMainStyle.imageUrl} alt={selectedMainStyle.styleName} className="aspect-[3/2] w-full rounded-md border border-cyan-100 object-cover" />
            <b className="mt-2 block text-sm text-slate-950">{selectedMainStyle.emotionalDescription || selectedMainStyle.styleDescription || selectedMainStyle.styleName}</b>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-600">文案会顺着这张图的结构展开，而不是先写完再硬套模板。</p>
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-black leading-5 text-amber-800">尚未选择图片风格。建议先回到风格页选择一张图，再生成文案。</p>
            <button onClick={() => router.push(`/site/style/${jobId}`)} className="mt-3 rounded-md bg-amber-600 px-3 py-2 text-xs font-black text-white">
              返回选择图片风格
            </button>
          </div>
        )}
        <div className="mt-4 max-h-52 overflow-auto rounded-md bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-600">{siteJob.businessDescription}</div>

        <div className="mt-4 grid gap-2">
          {siteJob.copyVersions.map((version) => (
            <button
              key={version.id}
              onClick={() => {
                setActiveVersionId(version.id);
                setDraft(toDraftModule(version));
                setSelected(null);
              }}
              className={`rounded-md px-3 py-2 text-left text-sm font-bold ${activeVersionId === version.id ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              V{version.versionNumber}
              {version.isFinal ? " / 最终版" : ""}
            </button>
          ))}
        </div>

        <button
          onClick={() => router.push(`/site/style/${jobId}`)}
          className="mt-5 w-full rounded-md border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-900 hover:bg-cyan-100"
        >
          查看图片风格
        </button>

        <label className="mt-4 block">
          <span className="text-xs font-black tracking-wide text-slate-500">请概括性地提出文案拓写要求</span>
          <textarea
            value={copyFeedback}
            onChange={(event) => setCopyFeedback(event.target.value)}
            className="mt-2 min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            placeholder="可以写：希望更正式、更有成交感、突出某项服务、删除某些表达。若无特别想法，可不填写。"
            maxLength={1200}
          />
          <span className="mt-1 block text-right text-[11px] font-bold text-slate-400">{copyFeedback.length} / 1200</span>
        </label>

        <button onClick={generateNext} disabled={generating} className="mt-3 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-black text-white disabled:bg-slate-400">
          {generating ? "正在整理文案..." : draft ? "根据当前修改生成下一版" : "点击开始梳理拓写"}
        </button>
        {generating ? <GenerationWarning /> : null}
        <button onClick={finalize} disabled={finalizing || !activeVersionId || !draft || overLimit} className="mt-3 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">
          {finalizing ? "正在进入官网生成..." : "提交最终文案"}
        </button>
        {error ? <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-red-50 px-3 py-2 text-sm font-bold leading-6 text-red-700 [overflow-wrap:anywhere]">{error}</p> : null}
      </aside>

      <section className="grid gap-4">
        {!draft ? (
          <section className="rounded-lg border border-cyan-100 bg-white p-8 text-center shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-teal-700">Copy Draft</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">生成一篇完整官网文案稿</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          AI 会根据客户描述、原始资料、上传素材和已选图片风格的页面架构，整理成一篇可直接审阅和修改的官网文案。
            </p>
            <button onClick={generateNext} disabled={generating} className="mt-5 rounded-md bg-teal-700 px-5 py-3 text-sm font-black text-white disabled:bg-slate-400">
              {generating ? "正在整理文案..." : "点击开始梳理拓写"}
            </button>
            {generating ? <GenerationWarning /> : null}
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => mark("lock")} className="rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white">
                  锁定选中文字
                </button>
                <button onClick={() => mark("reject")} className="rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white">
                  标记选中文字重写
                </button>
                <button onClick={() => setSelected(null)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold">
                  取消选择
                </button>
                <button onClick={() => save()} disabled={saving || !activeVersionId || overLimit} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold disabled:text-slate-400">
                  {saving ? "保存中..." : "保存当前稿"}
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-2 text-xs font-black">
                  <span className="rounded-full bg-slate-950 px-2 py-1 text-white">锁定</span>
                  <span className="rounded-full bg-red-100 px-2 py-1 text-red-700 ring-1 ring-red-200">待重写</span>
                </div>
              </div>
              {selected ? <p className="mt-2 truncate text-xs font-bold text-slate-500">已选中：{selected.text}</p> : null}
            </section>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-black text-slate-950">官网文案稿</h2>
                <div className={`text-xs font-black ${overLimit ? "text-red-600" : "text-slate-500"}`}>
                  {draft.content.length} / {copyCharLimit} 字符
                </div>
              </div>
              {overLimit ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">当前文案超过字数上限，请适当精简后再保存或提交。</p> : null}
              <div className="relative mt-4 min-h-[720px] overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-teal-500">
                <div
                  ref={overlayRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap px-4 py-4 text-base leading-8 text-slate-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {segments.map((segment, index) => (
                    <span key={index} className={highlightClass(segment.type)}>
                      {segment.text}
                    </span>
                  ))}
                </div>
                <textarea
                  ref={editorRef}
                  onScroll={syncScroll}
                  onSelect={capture}
                  value={draft.content}
                  maxLength={copyCharLimit + 1000}
                  onChange={(event) => updateContent(event.target.value)}
                  className="relative min-h-[720px] w-full resize-y bg-transparent px-4 py-4 text-base leading-8 text-transparent caret-slate-950 outline-none selection:bg-cyan-200/70"
                  spellCheck={false}
                />
              </div>
            </article>
          </>
        )}
      </section>
    </main>
  );
}
