"use client";

import { CONTENT_TYPES } from "@/lib/constants";

type ContentTypeSelectorProps = {
  selected: string;
  onSelect: (value: string) => void;
};

export function ContentTypeSelector({ selected, onSelect }: ContentTypeSelectorProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-lg font-bold text-slate-950">出图类型</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {CONTENT_TYPES.map((item) => {
          const active = selected === item.label;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.label)}
              className={`min-h-32 rounded-lg border p-4 text-left transition ${
                active
                  ? "border-teal-600 bg-teal-50 ring-4 ring-teal-100"
                  : "border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-base font-extrabold text-slate-950">{item.label}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${active ? "bg-teal-700 text-white" : "bg-white text-slate-600"}`}>
                  {item.ratio}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
