"use client";

import { ChangeEvent, useRef, useState } from "react";
import { MATERIAL_HINTS, MAX_FILE_SIZE, MAX_UPLOAD_FILES } from "@/lib/constants";
import type { UploadedAsset } from "@/types";

type UploadPanelProps = {
  files: UploadedAsset[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
};

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadPanel({ files, onAddFiles, onRemoveFile }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const validFiles: File[] = [];
    const rejected: string[] = [];

    selected.forEach((file) => {
      if (files.length + validFiles.length >= MAX_UPLOAD_FILES) {
        rejected.push(`最多只能上传 ${MAX_UPLOAD_FILES} 张图片`);
        return;
      }

      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        rejected.push(`${file.name} 格式不支持`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} 超过 10MB`);
        return;
      }

      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      onAddFiles(validFiles);
    }

    setMessage(rejected.length > 0 ? rejected.join("；") : validFiles.length > 0 ? "素材已加入本地预览" : "");
    event.target.value = "";
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">上传素材</h2>
          <p className="mt-1 text-sm text-slate-600">阶段 1 仅用于本地验证，不会上传到云端。</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
        >
          选择图片
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFiles}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {MATERIAL_HINTS.map((item) => (
          <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {item}
          </span>
        ))}
      </div>

      {message ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p> : null}

      <div className="mt-4 grid gap-3">
        {files.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            暂无素材，支持多图上传并即时生成缩略图。
          </div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
              <img src={file.url} alt={file.name} className="h-16 w-16 rounded-md object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{file.name}</p>
                <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(file.id)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
