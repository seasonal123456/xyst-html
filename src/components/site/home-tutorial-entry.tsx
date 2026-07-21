"use client";

import { useEffect, useRef, useState } from "react";
import { tutorialVideoConfig } from "@/lib/site/tutorial-video-config";

function PlayMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "grid shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_14px_34px_rgba(5,150,105,.28)]",
        compact ? "h-9 w-9" : "h-14 w-14"
      ].join(" ")}
    >
      <span
        className={[
          "ml-0.5 block h-0 w-0 border-y-transparent",
          compact ? "border-y-[6px] border-l-[10px]" : "border-y-[8px] border-l-[13px]",
          "border-l-white"
        ].join(" ")}
      />
    </span>
  );
}

export function HomeTutorialEntry() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
      videoRef.current?.pause();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mt-7 flex w-full max-w-xl items-center gap-3 rounded-lg border border-slate-200 bg-white/88 p-3 text-left shadow-[0_18px_48px_rgba(15,23,42,.1)] backdrop-blur transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_24px_60px_rgba(15,23,42,.14)] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 sm:gap-4 sm:p-4"
        aria-haspopup="dialog"
      >
        <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:w-36">
          <img
            src={tutorialVideoConfig.posterUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <span className="absolute inset-0 bg-slate-950/10 transition group-hover:bg-slate-950/0" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <PlayMark compact />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-black text-emerald-700">{tutorialVideoConfig.eyebrow}</span>
          <span className="mt-1 block text-[17px] font-black leading-snug text-slate-950 sm:text-lg">
            {tutorialVideoConfig.title}
          </span>
          <span className="mt-1 block text-xs font-bold leading-5 text-slate-500 sm:text-sm">
            {tutorialVideoConfig.helperText}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tutorialVideoConfig.modalTitle}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-[0_28px_100px_rgba(0,0,0,.34)]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div>
                <div className="text-sm font-black text-slate-950">{tutorialVideoConfig.modalTitle}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500">{tutorialVideoConfig.description}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-2xl leading-none text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                aria-label="关闭教程视频"
              >
                ×
              </button>
            </div>
            <div className="bg-slate-950">
              <video
                ref={videoRef}
                src={tutorialVideoConfig.videoUrl}
                poster={tutorialVideoConfig.posterUrl}
                className="aspect-video w-full bg-slate-950"
                controls
                preload="metadata"
                playsInline
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
