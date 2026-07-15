import type { MockImageInput } from "@/types";

type Theme = {
  background: string;
  panel: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  muted: string;
  dark: boolean;
};

const THEMES: Record<string, Theme> = {
  现代商务风: {
    background: "#f7fafc",
    panel: "#ffffff",
    primary: "#1d4ed8",
    secondary: "#dbeafe",
    accent: "#64748b",
    text: "#0f172a",
    muted: "#475569",
    dark: false
  },
  高端产业园风: {
    background: "#071933",
    panel: "#0c264f",
    primary: "#f4c76b",
    secondary: "#123867",
    accent: "#eab308",
    text: "#f8fafc",
    muted: "#cbd5e1",
    dark: true
  },
  科技蓝风: {
    background: "#082f63",
    panel: "#0b4fad",
    primary: "#67e8f9",
    secondary: "#1d4ed8",
    accent: "#93c5fd",
    text: "#eff6ff",
    muted: "#bfdbfe",
    dark: true
  },
  制造业硬核风: {
    background: "#1f2933",
    panel: "#111827",
    primary: "#f97316",
    secondary: "#374151",
    accent: "#fb923c",
    text: "#f9fafb",
    muted: "#d1d5db",
    dark: true
  },
  微信朋友圈传播风: {
    background: "#fff7ed",
    panel: "#ffffff",
    primary: "#ef4444",
    secondary: "#ffedd5",
    accent: "#16a34a",
    text: "#111827",
    muted: "#4b5563",
    dark: false
  },
  小红书图文风: {
    background: "#fff1f2",
    panel: "#ffffff",
    primary: "#e11d48",
    secondary: "#ffe4e6",
    accent: "#f59e0b",
    text: "#27272a",
    muted: "#71717a",
    dark: false
  },
  招商项目推荐卡风: {
    background: "#f8fafc",
    panel: "#ffffff",
    primary: "#0f766e",
    secondary: "#ccfbf1",
    accent: "#f59e0b",
    text: "#0f172a",
    muted: "#475569",
    dark: false
  },
  企业官网首图风: {
    background: "#0f172a",
    panel: "#1e293b",
    primary: "#38bdf8",
    secondary: "#334155",
    accent: "#22c55e",
    text: "#f8fafc",
    muted: "#cbd5e1",
    dark: true
  }
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitSellingPoints(value: string): string[] {
  const points = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  return points.length > 0 ? points : ["核心卖点待补充", "信息层级清晰", "适合商业传播"];
}

function getCanvasSize(ratio: string): { width: number; height: number } {
  if (ratio === "3:4") {
    return { width: 1080, height: 1440 };
  }

  if (ratio === "4:5") {
    return { width: 1080, height: 1350 };
  }

  if (ratio === "2.35:1") {
    return { width: 1410, height: 600 };
  }

  return { width: 1280, height: 720 };
}

function lineClamp(value: string, maxLength: number): string {
  const clean = value.trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function buildPattern(theme: Theme, width: number, height: number, style: string, seed: number): string {
  const opacity = theme.dark ? 0.22 : 0.5;
  const offset = seed % 90;

  if (style === "科技蓝风") {
    return `
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f5bd8"/>
          <stop offset="100%" stop-color="#051a3b"/>
        </linearGradient>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#93c5fd" stroke-width="1" opacity="0.24"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#grid)"/>
      <path d="M${80 + offset} ${height - 120} C ${width * 0.38} ${height * 0.35}, ${width * 0.66} ${height * 0.62}, ${width - 80} 120" fill="none" stroke="${theme.primary}" stroke-width="5" opacity="0.48"/>
    `;
  }

  if (style === "高端产业园风") {
    return `
      <rect width="${width}" height="${height}" fill="${theme.background}"/>
      <path d="M0 ${height * 0.72} L${width} ${height * 0.42} L${width} ${height} L0 ${height} Z" fill="${theme.secondary}" opacity="0.68"/>
      <g stroke="${theme.primary}" stroke-width="3" opacity="0.62">
        <path d="M${width * 0.07} ${height * 0.78} L${width * 0.24} ${height * 0.56} L${width * 0.38} ${height * 0.71}"/>
        <path d="M${width * 0.63} ${height * 0.68} L${width * 0.78} ${height * 0.48} L${width * 0.93} ${height * 0.66}"/>
      </g>
    `;
  }

  if (style === "制造业硬核风") {
    return `
      <rect width="${width}" height="${height}" fill="${theme.background}"/>
      <rect x="${width * 0.68}" y="0" width="${width * 0.32}" height="${height}" fill="${theme.secondary}" opacity="0.75"/>
      <path d="M0 ${height * 0.83} L${width} ${height * 0.64} L${width} ${height} L0 ${height} Z" fill="${theme.panel}" opacity="0.9"/>
      <g fill="${theme.primary}" opacity="0.18">
        <rect x="${60 + offset}" y="${height * 0.13}" width="180" height="180"/>
        <rect x="${width - 280}" y="${height - 260}" width="220" height="120"/>
      </g>
    `;
  }

  return `
    <rect width="${width}" height="${height}" fill="${theme.background}"/>
    <circle cx="${width * 0.82}" cy="${height * 0.18}" r="${Math.min(width, height) * 0.22}" fill="${theme.secondary}" opacity="${opacity}"/>
    <path d="M0 ${height * 0.84} C ${width * 0.25} ${height * 0.74}, ${width * 0.55} ${height * 0.95}, ${width} ${height * 0.76} L${width} ${height} L0 ${height} Z" fill="${theme.secondary}" opacity="0.7"/>
  `;
}

function pointRows(points: string[], theme: Theme, x: number, y: number, width: number): string {
  return points
    .map((point, index) => {
      const rowY = y + index * 64;
      return `
        <g>
          <rect x="${x}" y="${rowY - 34}" width="${width}" height="48" rx="24" fill="${theme.secondary}" opacity="${theme.dark ? 0.62 : 0.95}"/>
          <circle cx="${x + 27}" cy="${rowY - 10}" r="9" fill="${theme.primary}"/>
          <text x="${x + 52}" y="${rowY - 2}" fill="${theme.text}" font-size="26" font-weight="700">${escapeXml(lineClamp(point, 28))}</text>
        </g>
      `;
    })
    .join("");
}

export function generateMockImageDataUrl(input: MockImageInput): string {
  const { width, height } = getCanvasSize(input.ratio);
  const theme = THEMES[input.style] ?? THEMES["现代商务风"];
  const points = splitSellingPoints(input.sellingPoints);
  const isWide = width / height > 1.7;
  const name = lineClamp(input.name || "企业 / 项目名称", isWide ? 18 : 15);
  const business = lineClamp(input.business || input.industry || "商业宣传素材 Mock 预览", isWide ? 34 : 24);
  const contact = lineClamp(input.contact || "联系方式待补充", isWide ? 34 : 24);
  const safeContentType = lineClamp(input.contentType, 16);
  const safeStyle = lineClamp(input.style, 16);
  const titleSize = isWide ? 66 : 74;
  const left = isWide ? 90 : 78;
  const top = isWide ? 72 : 92;
  const pointY = isWide ? 390 : 650;
  const pointWidth = isWide ? Math.min(560, width * 0.44) : width - left * 2;
  const previewPanelX = isWide ? width * 0.58 : left;
  const previewPanelY = isWide ? 118 : 286;
  const previewPanelW = isWide ? width * 0.34 : width - left * 2;
  const previewPanelH = isWide ? height * 0.58 : 280;
  const uploadedCount = input.uploadedFiles.length;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif; }
  </style>
  ${buildPattern(theme, width, height, input.style, input.variantSeed)}

  <rect x="${left - 24}" y="${top - 34}" width="${isWide ? width * 0.47 : width - left * 2 + 48}" height="${isWide ? 510 : 760}" rx="28" fill="${theme.panel}" opacity="${theme.dark ? 0.78 : 0.86}"/>
  <text x="${left}" y="${top}" fill="${theme.primary}" font-size="24" font-weight="800" letter-spacing="2">AI MOCK PREVIEW</text>
  <text x="${left}" y="${top + 84}" fill="${theme.text}" font-size="${titleSize}" font-weight="900">${escapeXml(name)}</text>
  <text x="${left}" y="${top + 142}" fill="${theme.muted}" font-size="30" font-weight="600">${escapeXml(business)}</text>

  <g>
    <rect x="${left}" y="${top + 182}" width="190" height="48" rx="24" fill="${theme.primary}" opacity="0.95"/>
    <text x="${left + 26}" y="${top + 214}" fill="${theme.dark ? "#071933" : "#ffffff"}" font-size="23" font-weight="800">${escapeXml(safeContentType)}</text>
    <rect x="${left + 210}" y="${top + 182}" width="210" height="48" rx="24" fill="${theme.secondary}" opacity="0.95"/>
    <text x="${left + 236}" y="${top + 214}" fill="${theme.text}" font-size="23" font-weight="800">${escapeXml(safeStyle)}</text>
  </g>

  ${pointRows(points, theme, left, pointY, pointWidth)}

  <g>
    <text x="${left}" y="${height - 88}" fill="${theme.muted}" font-size="24" font-weight="700">联系方式</text>
    <text x="${left}" y="${height - 48}" fill="${theme.text}" font-size="30" font-weight="800">${escapeXml(contact)}</text>
  </g>

  <g transform="translate(${previewPanelX} ${previewPanelY})">
    <rect width="${previewPanelW}" height="${previewPanelH}" rx="30" fill="${theme.dark ? "#ffffff" : "#0f172a"}" opacity="${theme.dark ? 0.1 : 0.08}"/>
    <rect x="34" y="34" width="${previewPanelW - 68}" height="${previewPanelH - 68}" rx="22" fill="${theme.dark ? "#0f172a" : "#ffffff"}" opacity="${theme.dark ? 0.42 : 0.86}"/>
    <path d="M66 ${previewPanelH - 86} L${previewPanelW * 0.36} ${previewPanelH * 0.48} L${previewPanelW * 0.56} ${previewPanelH * 0.67} L${previewPanelW - 66} ${previewPanelH * 0.34}" fill="none" stroke="${theme.primary}" stroke-width="8" stroke-linecap="round" opacity="0.78"/>
    <circle cx="${previewPanelW - 90}" cy="86" r="28" fill="${theme.accent}" opacity="0.86"/>
    <text x="66" y="88" fill="${theme.text}" font-size="24" font-weight="800">素材 ${uploadedCount} 个</text>
    <text x="66" y="${previewPanelH - 48}" fill="${theme.muted}" font-size="22">本地浏览器 Mock 生成</text>
  </g>

  <rect x="${width - 266}" y="${height - 70}" width="206" height="34" rx="17" fill="${theme.dark ? "#ffffff" : "#0f172a"}" opacity="${theme.dark ? 0.12 : 0.08}"/>
  <text x="${width - 246}" y="${height - 47}" fill="${theme.muted}" font-size="18" font-weight="800">Stage 1 / Mock Mode</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
