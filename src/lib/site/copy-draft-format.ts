export type CopyDraftSection = {
  title: string;
  paragraphs: string[];
  bullets: string[];
};

const knownHeadings = [
  "首页首屏",
  "业务简介",
  "服务方向",
  "服务内容",
  "核心业务",
  "核心优势",
  "项目展示",
  "适合客户",
  "适合咨询的情况",
  "合作流程",
  "服务流程",
  "联系方式",
  "咨询前可准备的资料",
  "为什么选择",
  "页尾说明"
];

function normalizeDraft(raw: string) {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  text = text.replace(/\s*(【[^】]{1,42}】)\s*/g, "\n$1\n");
  for (const heading of knownHeadings) {
    text = text.replace(new RegExp(`\\s+(${heading})\\s*`, "g"), "\n【$1】\n");
  }
  text = text.replace(/\s+([一二三四五六七八九十]{1,3}[、.．]\s*[^。\n]{2,36})\s*/g, "\n$1\n");
  text = text.replace(/([。！？])\s+(?=[\u4e00-\u9fa5A-Za-z0-9])/g, "$1\n");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isHeading(line: string) {
  if (/^【[^】]{1,42}】$/.test(line)) return true;
  if (/^[一二三四五六七八九十]{1,3}[、.．]\s*[^。！？]{2,42}$/.test(line)) return true;
  if (knownHeadings.some((heading) => line === heading || line.startsWith(`${heading}：`) || line.startsWith(`${heading}:`))) return true;
  return false;
}

function cleanHeading(line: string) {
  return line.replace(/^【|】$/g, "").replace(/^[一二三四五六七八九十]{1,3}[、.．]\s*/, "").replace(/[：:]$/, "").trim();
}

function pushParagraph(section: CopyDraftSection, line: string) {
  const bullet = line.match(/^[\-•·]\s*(.+)$/);
  if (bullet?.[1]) {
    section.bullets.push(bullet[1].trim());
    return;
  }
  section.paragraphs.push(line);
}

export function parseCopyDraftSections(raw: string): CopyDraftSection[] {
  const lines = normalizeDraft(raw);
  const sections: CopyDraftSection[] = [];
  let current: CopyDraftSection = { title: "官网文案", paragraphs: [], bullets: [] };

  for (const line of lines) {
    if (isHeading(line)) {
      if (current.paragraphs.length || current.bullets.length || sections.length) {
        sections.push(current);
      }
      current = { title: cleanHeading(line), paragraphs: [], bullets: [] };
      continue;
    }
    pushParagraph(current, line);
  }

  if (current.paragraphs.length || current.bullets.length || !sections.length) {
    sections.push(current);
  }

  return sections.map((section) => ({
    ...section,
    paragraphs: section.paragraphs.filter(Boolean),
    bullets: section.bullets.filter(Boolean)
  }));
}
