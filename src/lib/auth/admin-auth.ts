import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "ai_image_admin_session";

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "change-me";
}

function getSessionValue(): string {
  return createHash("sha256").update(`admin:${getAdminPassword()}:stage3`).digest("hex");
}

export async function createAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, getSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const current = cookieStore.get(COOKIE_NAME)?.value;
  const expected = getSessionValue();

  if (!current || current.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(current), Buffer.from(expected));
}

export function verifyAdminPassword(password: string): boolean {
  const expected = getAdminPassword();
  const currentBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);

  if (currentBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(currentBuffer, expectedBuffer);
}
