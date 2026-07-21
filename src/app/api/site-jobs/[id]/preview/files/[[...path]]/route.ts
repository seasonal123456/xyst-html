import path from "path";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { downloadAliyunOssObject } from "@/lib/storage/aliyun-oss-storage";
import { getSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; path?: string[] }> };

function mimeTypeFromPath(filePath: string) {
  const ext = path.extname(filePath.split(/[?#]/)[0]).toLowerCase();
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function publicUrlToPath(urlPath: string, relativePath: string) {
  const cleaned = urlPath.split(/[?#]/)[0].replace(/^\/+/, "");
  const basePath = cleaned.endsWith("/") ? cleaned : path.posix.dirname(cleaned);
  const joined = path.posix.normalize(path.posix.join(basePath, relativePath || path.posix.basename(cleaned)));
  if (joined.startsWith("../") || joined === "..") return null;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", joined);
}

function sanitizeSegments(segments: string[] | undefined) {
  const safeSegments = (segments || []).filter(Boolean);
  if (safeSegments.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))) return null;
  return safeSegments.join("/");
}

function resolveRemotePreviewUrl(previewUrl: string, relativePath: string) {
  const indexUrl = new URL(previewUrl);
  const baseDirectoryUrl = new URL(indexUrl.pathname.endsWith("/") ? indexUrl.pathname : "./", indexUrl);
  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const targetUrl = encodedPath ? new URL(encodedPath, baseDirectoryUrl) : indexUrl;

  if (targetUrl.origin !== indexUrl.origin || !targetUrl.pathname.startsWith(baseDirectoryUrl.pathname)) {
    return null;
  }

  targetUrl.search = "";
  targetUrl.hash = "";
  return targetUrl.toString();
}

async function readPreviewFile(previewUrl: string, relativePath: string) {
  if (previewUrl.startsWith("/")) {
    const localPath = publicUrlToPath(previewUrl, relativePath);
    if (!localPath) return null;
    return {
      buffer: await readFile(localPath),
      mimeType: mimeTypeFromPath(localPath)
    };
  }

  let targetUrl: string;
  try {
    const resolved = resolveRemotePreviewUrl(previewUrl, relativePath);
    if (!resolved) return null;
    targetUrl = resolved;
  } catch {
    return null;
  }

  const ossFile = await downloadAliyunOssObject(targetUrl).catch(() => null);
  if (ossFile) {
    return {
      buffer: ossFile.buffer,
      mimeType: ossFile.mimeType || mimeTypeFromPath(targetUrl)
    };
  }

  const response = await fetch(targetUrl, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || mimeTypeFromPath(targetUrl)
  };
}

function isHtmlResponse(mimeType: string, relativePath: string) {
  return mimeType.toLowerCase().includes("text/html") || !relativePath || relativePath.endsWith(".html");
}

function injectPreviewBase(html: string, requestUrl: string) {
  const baseHref = new URL(requestUrl);
  baseHref.search = "";
  baseHref.hash = "";
  if (!baseHref.pathname.endsWith("/")) baseHref.pathname += "/";
  const baseTag = `<base href="${baseHref.pathname}" />`;
  if (/<base\b/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>\n  ${baseTag}`);
  return `${baseTag}\n${html}`;
}

export async function GET(request: Request, context: RouteContext) {
  const { id, path: requestedPath } = await context.params;
  const relativePath = sanitizeSegments(requestedPath);
  if (relativePath === null) {
    return NextResponse.json({ success: false, error: "Invalid preview file path." }, { status: 400 });
  }

  const siteJob = await getSiteJob(id);
  if (!siteJob?.previewUrl) {
    return NextResponse.json({ success: false, error: "Preview is not ready." }, { status: 404 });
  }

  const file = await readPreviewFile(siteJob.previewUrl, relativePath);
  if (!file) {
    return NextResponse.json({ success: false, error: "Preview file not found." }, { status: 404 });
  }

  const html = isHtmlResponse(file.mimeType, relativePath);
  const body = html ? injectPreviewBase(file.buffer.toString("utf8"), request.url) : new Uint8Array(file.buffer);
  const headers: Record<string, string> = {
    "Content-Type": html ? "text/html; charset=utf-8" : file.mimeType,
    "Cache-Control": "no-store",
    "Content-Disposition": "inline",
    "X-Robots-Tag": "noindex, nofollow"
  };

  if (html) {
    headers["Content-Security-Policy"] = [
      "sandbox allow-scripts allow-forms allow-popups",
      "default-src 'self' https: data: blob:",
      "script-src 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' https: data: blob:",
      "font-src 'self' https: data:",
      "media-src 'self' https: data: blob:",
      "connect-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'self'"
    ].join("; ");
  }

  return new Response(body, { headers });
}
