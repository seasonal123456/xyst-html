import { parseCopyDraftSections } from "@/lib/site/copy-draft-format";

type FormattedCopyDraftProps = {
  content: string;
  compact?: boolean;
};

export function FormattedCopyDraft({ content, compact = false }: FormattedCopyDraftProps) {
  const sections = parseCopyDraftSections(content);

  return (
    <div className="space-y-4">
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-950 text-xs font-black text-white">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="text-base font-black text-slate-950">{section.title}</h3>
            </div>
          </div>
          <div className={compact ? "space-y-3 px-5 py-4" : "space-y-4 px-6 py-5"}>
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className={compact ? "text-sm leading-7 text-slate-700" : "text-[15px] leading-8 text-slate-700"}>
                {paragraph}
              </p>
            ))}
            {section.bullets.length ? (
              <ul className="grid gap-2">
                {section.bullets.map((bullet, bulletIndex) => (
                  <li key={bulletIndex} className="flex gap-2 text-sm leading-7 text-slate-700">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
