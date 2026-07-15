"use client";

import { STYLE_OPTIONS } from "@/lib/constants";

type StyleSelectorProps = {
  selected: string;
  onSelect: (value: string) => void;
};

export function StyleSelector({ selected, onSelect }: StyleSelectorProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-lg font-bold text-slate-950">设计风格</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {STYLE_OPTIONS.map((item) => {
          const active = selected === item.label;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.label)}
              className={`min-h-32 rounded-lg border p-4 text-left transition ${
                active
                  ? "border-orange-500 bg-orange-50 ring-4 ring-orange-100"
                  : "border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white"
              }`}
            >
              <span className="text-base font-extrabold text-slate-950">{item.label}</span>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
