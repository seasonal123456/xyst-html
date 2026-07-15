import { NextResponse } from "next/server";

export function getWorkerSecret() {
  return process.env.WORKER_SHARED_SECRET?.trim() || "";
}

export function isWorkerAuthenticated(request: Request) {
  const secret = getWorkerSecret();
  if (!secret) return false;

  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  const headerSecret = request.headers.get("x-worker-secret")?.trim() || "";
  return bearer === secret || headerSecret === secret;
}

export function requireWorkerAuth(request: Request) {
  if (isWorkerAuthenticated(request)) return null;
  return NextResponse.json({ success: false, error: "worker 未授权。" }, { status: 401 });
}
