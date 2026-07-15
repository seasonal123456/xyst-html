import path from "path";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { downloadAliyunOssObject, rootRelativeUrlToAliyunOssUrl } from "@/lib/storage/aliyun-oss-storage";
import { getSiteJob } from "@/lib/site/site-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; styleId: string }> };

function publicUrlToFilePath(url: string | null | undefined) {
  if (!url?.startsWith("/") || url.startsWith("//")) return null;
  const cleaned = url.split(/[?#]/)[0].replace(/^\/+/, "");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", cleaned);
}

function mimeTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function bufferFromDataImage(imageUrl: string): { buffer: Buffer; mimeType: string } | null {
  if (!imageUrl.startsWith("data:image/")) return null;
  const commaIndex = imageUrl.indexOf(",");
  if (commaIndex < 0) return null;

  const meta = imageUrl.slice(5, commaIndex);
  const payload = imageUrl.slice(commaIndex + 1);
  const mimeType = meta.split(";")[0] || "image/png";
  const buffer = meta.includes(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, mimeType };
}

async function bufferFromImageUrl(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const dataImage = bufferFromDataImage(imageUrl);
  if (dataImage) return dataImage;

  const localPath = publicUrlToFilePath(imageUrl);
  if (localPath) {
    try {
      return { buffer: await readFile(localPath), mimeType: mimeTypeFromPath(localPath) };
    } catch {
      const ossUrl = rootRelativeUrlToAliyunOssUrl(imageUrl);
      if (ossUrl) return bufferFromImageUrl(ossUrl);
    }
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const response = await fetch(imageUrl);
      if (response.ok) {
        return {
          buffer: Buffer.from(await response.arrayBuffer()),
          mimeType: response.headers.get("content-type") || "application/octet-stream"
        };
      }
    } catch {
      // Try authenticated OSS download below.
    }

    try {
      return await downloadAliyunOssObject(imageUrl);
    } catch {
      return null;
    }
  }

  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id, styleId } = await context.params;
  const siteJob = await getSiteJob(id);
  const style = siteJob?.styleConcepts.find((item) => item.id === styleId);
  if (!siteJob || !style) {
    return NextResponse.json({ success: false, error: "风格图不存在。" }, { status: 404 });
  }

  const image = await bufferFromImageUrl(style.imageUrl);
  if (!image) {
    return NextResponse.json({ success: false, error: "风格图读取失败。" }, { status: 502 });
  }

  return new Response(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=300"
    }
  });
}
