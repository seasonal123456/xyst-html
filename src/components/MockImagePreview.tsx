"use client";

type MockImagePreviewProps = {
  imageUrl: string;
};

export function MockImagePreview({ imageUrl }: MockImagePreviewProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-lg font-bold text-slate-950">Mock 图片预览</h2>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        {imageUrl ? (
          <img src={imageUrl} alt="AI MOCK PREVIEW" className="h-auto w-full" />
        ) : (
          <div className="flex aspect-video items-center justify-center px-6 text-center text-sm font-semibold text-slate-500">
            点击生成后，这里会显示本地 SVG Mock 宣传图。
          </div>
        )}
      </div>
    </section>
  );
}
