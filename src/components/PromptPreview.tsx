"use client";

type PromptPreviewProps = {
  prompt: string;
  onCopy: () => void;
  copied: boolean;
};

export function PromptPreview({ prompt, onCopy, copied }: PromptPreviewProps) {
  return (
    <section className="rounded-lg border-2 border-teal-600 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-slate-950">Prompt 预览</h2>
        <button
          type="button"
          onClick={onCopy}
          disabled={!prompt}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {copied ? "Prompt 已复制" : "复制 Prompt"}
        </button>
      </div>
      <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-4 text-sm leading-7 text-slate-100">
        {prompt || "点击生成后，这里会显示结构化中文 Prompt。"}
      </pre>
    </section>
  );
}
