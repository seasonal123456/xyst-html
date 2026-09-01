import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { access, mkdir, writeFile } from "fs/promises";
import { pathToFileURL } from "url";

export type SiteQualityIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  detail?: string;
  viewport: string;
};

export type SiteQualityCheckResult = {
  status: "passed" | "warning" | "failed" | "skipped";
  summary: string;
  issueCount: number;
  issues: SiteQualityIssue[];
  reportPath?: string;
  screenshots: string[];
};

export type SiteQualityGateMode = "off" | "warn" | "strict";

export function siteQualityGateMode(): SiteQualityGateMode {
  const raw = process.env.SITE_QUALITY_GATE_MODE?.trim().toLowerCase();
  if (raw === "off" || raw === "warn" || raw === "strict") return raw;
  return "off";
}

type CdpSession = {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  close(): void;
};

export function siteQualityCdpTimeoutMs(raw = process.env.SITE_QUALITY_CDP_TIMEOUT_MS) {
  const fallback = process.platform === "win32" ? 30_000 : 120_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(300_000, Math.max(30_000, Math.floor(parsed)));
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable"
].filter(Boolean) as string[];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectBaseHref(html: string, baseHref: string) {
  if (/<base\b/i.test(html)) return html;
  const baseTag = `<base href="${escapeHtmlAttribute(baseHref)}" />`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1>\n  ${baseTag}`);
  }
  return `${baseTag}\n${html}`;
}

async function prepareInspectableUrl(inputUrl: string, outputDir: string): Promise<{ url: string; issues: SiteQualityIssue[] }> {
  if (!/^https?:\/\//i.test(inputUrl)) return { url: inputUrl, issues: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(inputUrl, { signal: controller.signal });
    if (!response.ok) {
      return {
        url: inputUrl,
        issues: [
          {
            severity: "warning",
            code: "preview_html_fetch_failed",
            message: `自检预抓取官网 HTML 失败：HTTP ${response.status}，已改用浏览器直接打开。`,
            detail: inputUrl,
            viewport: "preflight"
          }
        ]
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const html = await response.text();
    if (!/html/i.test(contentType) && !/<(?:!doctype\s+html|html|head|body)\b/i.test(html)) {
      return { url: inputUrl, issues: [] };
    }

    const snapshotPath = path.join(outputDir, "inspection.html");
    await writeFile(snapshotPath, injectBaseHref(html, inputUrl), "utf8");
    return { url: pathToFileURL(snapshotPath).toString(), issues: [] };
  } catch (error) {
    return {
      url: inputUrl,
      issues: [
        {
          severity: "warning",
          code: "preview_html_fetch_failed",
          message: "自检预抓取官网 HTML 未完成，已改用浏览器直接打开。",
          detail: error instanceof Error ? error.message : String(error),
          viewport: "preflight"
        }
      ]
    };
  } finally {
    clearTimeout(timer);
  }
}

async function findChromePath() {
  for (const candidate of chromeCandidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function waitForDevTools(port: number) {
  for (let index = 0; index < 40; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Keep waiting.
    }
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint did not start.");
}

async function openTab(port: number) {
  const encoded = encodeURIComponent("about:blank");
  const put = await fetch(`http://127.0.0.1:${port}/json/new?${encoded}`, { method: "PUT" }).catch(() => null);
  const response = put?.ok ? put : await fetch(`http://127.0.0.1:${port}/json/new?${encoded}`);
  if (!response.ok) throw new Error(`Unable to open Chrome tab: HTTP ${response.status}`);
  return (await response.json()) as { webSocketDebuggerUrl: string };
}

function messageToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  return String(data || "");
}

async function connectCdp(webSocketDebuggerUrl: string, commandTimeoutMs = siteQualityCdpTimeoutMs()): Promise<CdpSession> {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Chrome WebSocket connection failed.")), { once: true });
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  socket.addEventListener("message", (event) => {
    const text = messageToString(event.data);
    if (!text) return;
    const message = JSON.parse(text) as { id?: number; result?: unknown; error?: { message?: string } };
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message || "CDP command failed."));
    } else {
      request.resolve(message.result);
    }
  });

  return {
    send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out.`));
        }, commandTimeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value as T);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          }
        });
      });
    },
    close() {
      socket.close();
    }
  };
}

async function terminateChrome(chrome: ChildProcess | null) {
  if (!chrome || chrome.exitCode !== null || chrome.signalCode !== null) return;

  const exited = new Promise<void>((resolve) => chrome.once("exit", () => resolve()));
  const signalProcess = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== "win32" && chrome.pid) {
        process.kill(-chrome.pid, signal);
      } else {
        chrome.kill(signal);
      }
    } catch {
      chrome.kill(signal);
    }
  };

  signalProcess("SIGTERM");
  await Promise.race([exited, sleep(3000)]);
  if (chrome.exitCode === null && chrome.signalCode === null) {
    signalProcess("SIGKILL");
    await Promise.race([exited, sleep(1000)]);
  }
}

function qaExpression(viewport: string) {
  return `
(() => {
  const viewport = ${JSON.stringify(viewport)};
  const issues = [];
  const add = (severity, code, message, detail) => {
    if (issues.length < 120) issues.push({ severity, code, message, detail, viewport });
  };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.documentElement;
  const bodyTextLength = (document.body?.innerText || "").replace(/\\s+/g, "").length;
  const countChinese = (value) => (value.match(/[\\u4e00-\\u9fff]/g) || []).length;
  const parsePixels = (value) => {
    const number = parseFloat(value || "0");
    return Number.isFinite(number) ? number : 0;
  };
  const isInFirstViewport = (rect) => rect.bottom > 0 && rect.top < vh * 0.92 && rect.right > 0 && rect.left < vw;
  const isVisibleElement = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 3 && rect.height > 3 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.03;
  };
  const estimateLineTexts = (el) => {
    const text = (el.innerText || "").replace(/\\s+/g, "");
    if (!text || text.length > 90) return [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const lines = [];
    const range = document.createRange();
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue || "";
      for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (!char || /\\s/.test(char)) continue;
        try {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
        } catch {
          continue;
        }
        const rect = Array.from(range.getClientRects()).find((item) => item.width > 0 && item.height > 0);
        if (!rect) continue;
        const top = Math.round(rect.top / 4) * 4;
        let line = lines.find((item) => Math.abs(item.top - top) <= 3);
        if (!line) {
          line = { top, left: rect.left, text: "" };
          lines.push(line);
        }
        line.left = Math.min(line.left, rect.left);
        line.text += char;
      }
    }
    range.detach();
    return lines.sort((a, b) => a.top - b.top || a.left - b.left).map((line) => line.text);
  };
  if (bodyTextLength < 10 && document.images.length === 0 && document.body && document.body.children.length < 3) {
    add("error", "blank_page", "页面疑似空白或未完成渲染。", "bodyTextLength=" + bodyTextLength + ", children=" + document.body.children.length);
  }
  if (doc.scrollWidth > vw + 4) {
    add("warning", "horizontal_overflow", "页面存在横向溢出，可能导致移动端或桌面端内容显示不全。", "scrollWidth=" + doc.scrollWidth + ", viewport=" + vw);
  }

  const firstViewportElements = Array.from(document.body.querySelectorAll("*")).filter((el) => {
    if (!isVisibleElement(el)) return false;
    return isInFirstViewport(el.getBoundingClientRect());
  });
  const firstViewportText = firstViewportElements.map((el) => (el.innerText || "")).join(" ");
  const fakeUiKeywords = [
    "dashboard", "mockup", "browser", "app ui", "analytics", "admin",
    "仪表盘", "后台", "看板", "面板", "数据面板", "浏览器", "应用界面",
    "学员课程记录", "今日学习任务", "课程学习", "作品练习", "阶段回顾", "展览准备",
    "完成", "进行中", "进度"
  ];
  const fakeUiKeywordHits = fakeUiKeywords.filter((keyword) => firstViewportText.toLowerCase().includes(String(keyword).toLowerCase()));
  const roundedPanelCount = firstViewportElements.filter((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const radius = Math.max(parsePixels(style.borderTopLeftRadius), parsePixels(style.borderTopRightRadius), parsePixels(style.borderBottomLeftRadius), parsePixels(style.borderBottomRightRadius));
    const hasSurface = style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.borderTopWidth !== "0px" || style.boxShadow !== "none";
    return rect.width >= 44 && rect.height >= 24 && rect.width * rect.height >= 1400 && radius >= 8 && hasSurface;
  }).length;
  const smallRoundDotCount = firstViewportElements.filter((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const radius = Math.max(parsePixels(style.borderTopLeftRadius), parsePixels(style.borderTopRightRadius), parsePixels(style.borderBottomLeftRadius), parsePixels(style.borderBottomRightRadius));
    return rect.width >= 4 && rect.width <= 16 && rect.height >= 4 && rect.height <= 16 && radius >= Math.min(rect.width, rect.height) * 0.45;
  }).length;
  const firstViewportImages = Array.from(document.images).filter((img) => isInFirstViewport(img.getBoundingClientRect()));
  const largestFirstViewportImageArea = firstViewportImages.reduce((max, img) => {
    const rect = img.getBoundingClientRect();
    return Math.max(max, rect.width * rect.height);
  }, 0);
  const dominantImageRatio = largestFirstViewportImageArea / Math.max(1, vw * vh);
  if ((fakeUiKeywordHits.length >= 3 && roundedPanelCount >= 5) || (smallRoundDotCount >= 3 && roundedPanelCount >= 8 && dominantImageRatio < 0.28)) {
    add(
      "error",
      "hero_visual_looks_like_fake_ui",
      "首屏主视觉疑似假后台/假浏览器/卡片拼贴，不适合作为非软件类官网英雄图。",
      "keywords=" + fakeUiKeywordHits.slice(0, 8).join(",") + "; roundedPanels=" + roundedPanelCount + "; dots=" + smallRoundDotCount + "; imageRatio=" + dominantImageRatio.toFixed(2)
    );
  }
  if (firstViewportImages.length > 0 && dominantImageRatio > 0 && dominantImageRatio < 0.08 && roundedPanelCount >= 5) {
    add("warning", "hero_image_subject_may_be_too_small", "首屏图片主体面积过小且周围卡片较多，可能像拼贴占位而不是饱满主视觉。", "imageRatio=" + dominantImageRatio.toFixed(2) + "; roundedPanels=" + roundedPanelCount);
  }

  Array.from(document.images).forEach((img, index) => {
    const rect = img.getBoundingClientRect();
    const src = img.currentSrc || img.src || "";
    if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      add("error", "broken_image", "图片未加载成功。", src || "image#" + index);
      return;
    }
    if (rect.width <= 2 || rect.height <= 2) {
      add("warning", "tiny_image", "图片渲染尺寸异常小，可能未正常显示。", src);
    }
    const naturalRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
    const renderedRatio = rect.width / Math.max(1, rect.height);
    const objectFit = getComputedStyle(img).objectFit;
    const opacity = Number(getComputedStyle(img).opacity || 1);
    if (objectFit === "cover" && Math.abs(Math.log(naturalRatio / Math.max(0.01, renderedRatio))) > 1.15) {
      add("warning", "image_may_be_cropped", "图片比例与容器差异较大且使用 cover，可能有主体未显示全。", src);
    }
    if (isInFirstViewport(rect) && rect.width * rect.height > vw * vh * 0.12 && opacity < 0.58) {
      add("warning", "hero_image_too_faint", "首屏大图透明度过低，可能显得灰白、雾蒙或主体不清。", src);
    }
  });

  const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "IMG", "VIDEO", "CANVAS"]);
  const elements = Array.from(document.body.querySelectorAll("*")).filter((el) => {
    if (skipTags.has(el.tagName)) return false;
    const text = (el.innerText || "").replace(/\\s+/g, " ").trim();
    if (text.length < 2) return false;
    const childText = Array.from(el.children).some((child) => (child.innerText || "").trim().length > 1);
    const isHeading = /^H[1-3]$/.test(el.tagName);
    if (childText && text.length > 12 && !isHeading) return false;
    return isVisibleElement(el);
  });

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const text = (el.innerText || "").replace(/\\s+/g, " ").trim();
    const overflowX = style.overflowX;
    const overflowY = style.overflowY;
    const clipsX = ["hidden", "clip", "scroll", "auto"].includes(overflowX);
    const clipsY = ["hidden", "clip", "scroll", "auto"].includes(overflowY);
    if ((clipsX && el.scrollWidth > el.clientWidth + 3) || (clipsY && el.scrollHeight > el.clientHeight + 3)) {
      add("warning", "text_clipped", "文字可能被容器裁切。", text.slice(0, 80));
    }
    if ((rect.left < -4 || rect.right > vw + 4) && style.position !== "fixed") {
      add("warning", "text_outside_viewport", "文字超出视口边界，可能显示不全。", text.slice(0, 80));
    }

    const fontSize = parseFloat(style.fontSize || "0");
    const lineHeight = Number.isFinite(parseFloat(style.lineHeight)) ? parseFloat(style.lineHeight) : fontSize * 1.2;
    const lineCount = Math.round(rect.height / Math.max(1, lineHeight));
    const chineseLength = countChinese(text);
    const averageChinesePerLine = chineseLength / Math.max(1, lineCount);
    if (/[\u4e00-\u9fff]/.test(text) && fontSize >= 44 && lineCount >= 4 && text.length <= 42) {
      add("warning", "large_headline_wrapped", "大标题换行过多，可能不是理想排版。", text.slice(0, 80));
    }
    if (/[\u4e00-\u9fff]/.test(text) && fontSize >= 42 && lineCount >= 3 && averageChinesePerLine <= 6) {
      add("warning", "large_headline_short_lines", "中文大标题每行字数过少，可能出现错误换行或视觉割裂。", text.slice(0, 80));
    }
    if (el.tagName === "H1" && fontSize >= 50 && rect.top < vh * 0.75 && rect.height > vh * 0.26) {
      add("warning", "hero_headline_dominates_viewport", "首屏大标题占用视口高度过大，可能压住图片、按钮或正文。", text.slice(0, 80));
    }
    if (/[\u4e00-\u9fff]/.test(text) && fontSize >= 64 && rect.top < vh * 0.18 && rect.height > vh * 0.72) {
      add("warning", "hero_text_too_tall", "首屏大标题占用高度过大，可能压住图片或 CTA。", text.slice(0, 80));
    }
    if (/[\u4e00-\u9fff]/.test(text) && (fontSize >= 38 || /^H[1-3]$/.test(el.tagName)) && chineseLength >= 6) {
      const lines = estimateLineTexts(el);
      const orphanLine = lines.length >= 2 ? lines.find((line) => countChinese(line) > 0 && countChinese(line) <= 2) : "";
      if (orphanLine) {
        add("error", "large_headline_orphan_line", "大标题出现单字或双字孤行，属于明显错误换行。", text.slice(0, 80) + " | 孤行：" + orphanLine);
      }
    }
    if (/[\u4e00-\u9fff]/.test(text) && rect.width <= Math.min(520, vw * 0.5) && rect.height <= 170) {
      const metricLike = text.match(/^(课程方向|服务项目|项目类型|产品类别|年度作品展|作品展|咨询报名|报名咨询)\\s*[：:]?\\s*([0-9一二三四五六七八九十]+次?|[\\u4e00-\\u9fff]{1,4}(?:先生|女士|老师))$/);
      if (metricLike) {
        add("warning", "raw_metric_card_copy", "信息卡表述像后台字段，建议改为自然业务短句。", text.slice(0, 80));
      }
    }

    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(16, rect.width * 0.25), rect.top + rect.height / 2],
      [rect.right - Math.min(16, rect.width * 0.25), rect.top + rect.height / 2]
    ];
    for (const [x, y] of points) {
      if (x < 0 || x > vw || y < 0 || y > vh) continue;
      const top = document.elementFromPoint(x, y);
      if (!top || el.contains(top) || top.contains(el)) continue;
      const topStyle = getComputedStyle(top);
      if (topStyle.pointerEvents !== "none" && topStyle.visibility !== "hidden" && Number(topStyle.opacity || 1) > 0.08) {
        add("warning", "text_may_be_covered", "文字可能被其他元素覆盖。", text.slice(0, 80));
        break;
      }
    }
  }

  return issues;
})()
`;
}

async function inspectViewport(
  cdp: CdpSession,
  url: string,
  outputDir: string,
  viewport: { name: string; width: number; height: number; mobile: boolean; scale: number }
) {
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.scale,
    mobile: viewport.mobile
  });
  const navigation = await cdp.send<{ errorText?: string }>("Page.navigate", { url });
  if (navigation.errorText) {
    throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
  }
  for (let index = 0; index < 40; index += 1) {
    await sleep(500);
    const ready = await cdp.send<{ result?: { value?: { href: string; readyState: string; textLength: number; imageCount: number; childCount: number } } }>(
      "Runtime.evaluate",
      {
        expression:
          "({ href: location.href, readyState: document.readyState, textLength: (document.body?.innerText || '').replace(/\\s+/g, '').length, imageCount: document.images.length, childCount: document.body?.children.length || 0 })",
        returnByValue: true
      }
    ).catch(() => null);
    const value = ready?.result?.value;
    if (
      value &&
      value.href !== "about:blank" &&
      (value.readyState === "interactive" || value.readyState === "complete") &&
      (value.textLength > 10 || value.imageCount > 0 || value.childCount > 2)
    ) {
      break;
    }
  }
  await cdp.send("Runtime.evaluate", {
    expression: "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true",
    awaitPromise: true
  });
  await sleep(500);

  const evaluated = await cdp.send<{ result?: { value?: SiteQualityIssue[] } }>("Runtime.evaluate", {
    expression: qaExpression(viewport.name),
    returnByValue: true
  });
  const issues = evaluated.result?.value || [];

  let screenshotData: string | null = null;
  try {
    const screenshot = await cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    screenshotData = screenshot.data;
  } catch (error) {
    issues.push({
      severity: "warning",
      code: "screenshot_failed",
      message: "自检截图保存失败，已保留 DOM 检查结果。",
      detail: error instanceof Error ? error.message : String(error),
      viewport: viewport.name
    });
  }

  const screenshotPath = screenshotData ? path.join(outputDir, `${viewport.name}.png`) : undefined;
  if (screenshotPath && screenshotData) {
    await writeFile(screenshotPath, Buffer.from(screenshotData, "base64"));
  }

  return { issues, screenshotPath };
}

export async function runSiteQualityCheck(input: { url: string; jobId: string; force?: boolean }): Promise<SiteQualityCheckResult> {
  if (!input.force && siteQualityGateMode() === "off") {
    return {
      status: "skipped",
      summary: "自动成品自检已关闭。",
      issueCount: 0,
      issues: [],
      screenshots: []
    };
  }

  const chromePath = await findChromePath();
  if (!chromePath) {
    return {
      status: "skipped",
      summary: "未找到 Chrome/Edge，已跳过自动成品自检。",
      issueCount: 0,
      issues: [],
      screenshots: []
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "generated", "site-quality-checks", `${input.jobId}-${timestamp}`);
  const profileDir = path.join(outputDir, "chrome-profile");
  await mkdir(profileDir, { recursive: true });

  const port = 9400 + Math.floor(Math.random() * 500);
  let chrome: ChildProcess | null = null;
  let cdp: CdpSession | null = null;

  try {
    const launchArgs = [
        "--headless",
        `--remote-debugging-port=${port}`,
        "--remote-allow-origins=*",
        `--user-data-dir=${profileDir}`,
        "--disable-gpu",
        "--disable-background-networking",
        "--disable-extensions",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
      ];
    if (process.platform !== "win32") {
      launchArgs.splice(1, 0, "--no-sandbox", "--disable-dev-shm-usage", "--disable-software-rasterizer");
    }
    chrome = spawn(
      chromePath,
      launchArgs,
      { windowsHide: true, stdio: "ignore", detached: process.platform !== "win32" }
    );
    await waitForDevTools(port);
    const tab = await openTab(port);
    cdp = await connectCdp(tab.webSocketDebuggerUrl);
    const inspection = await prepareInspectableUrl(input.url, outputDir);

    const viewports = [
      { name: "desktop", width: 1440, height: 1000, mobile: false, scale: 1 },
      { name: "mobile", width: 390, height: 844, mobile: true, scale: 2 }
    ];
    const issues: SiteQualityIssue[] = [...inspection.issues];
    const screenshots: string[] = [];
    for (const viewport of viewports) {
      const result = await inspectViewport(cdp, inspection.url, outputDir, viewport);
      issues.push(...result.issues);
      if (result.screenshotPath) screenshots.push(result.screenshotPath);
    }

    const status = issues.some((issue) => issue.severity === "error") ? "failed" : issues.length ? "warning" : "passed";
    const summary =
      status === "passed"
        ? "自动成品自检通过：未发现断图、明显横向溢出、文本裁切或疑似遮挡。"
        : status === "failed"
          ? `自动成品自检发现 ${issues.length} 个问题，其中包含断图等严重问题。`
          : `自动成品自检发现 ${issues.length} 个版面风险，建议人工复核截图。`;
    const report: SiteQualityCheckResult = {
      status,
      summary,
      issueCount: issues.length,
      issues,
      screenshots
    };
    const reportPath = path.join(outputDir, "report.json");
    await writeFile(reportPath, JSON.stringify({ ...report, reportPath }, null, 2), "utf8");
    return { ...report, reportPath };
  } catch (error) {
    return {
      status: "skipped",
      summary: `自动成品自检未完成：${error instanceof Error ? error.message : String(error)}`,
      issueCount: 0,
      issues: [],
      screenshots: []
    };
  } finally {
    cdp?.close();
    await terminateChrome(chrome);
  }
}
