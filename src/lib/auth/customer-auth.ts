import { createHash, randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCustomerAccountByEmailWithPassword, touchCustomerLogin, verifyPassword, type CustomerAccount } from "@/lib/customers/customer-account-service";

const COOKIE_NAME = "ai_site_customer_session";
const SESSION_DAYS = 14;

type CustomerSessionRow = {
  id: string;
  accountId: string;
  email: string;
  name: string | null;
  credits: number | bigint;
  status: string;
  note: string | null;
  lastLoginAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToAccount(row: CustomerSessionRow): CustomerAccount {
  return {
    id: row.accountId,
    email: row.email,
    name: row.name,
    credits: Number(row.credits),
    status: row.status === "disabled" ? "disabled" : "active",
    note: row.note,
    lastLoginAt: toIso(row.lastLoginAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!
  };
}

export async function loginCustomer(email: string, password: string) {
  const result = await getCustomerAccountByEmailWithPassword(email);
  if (!result || result.account.status !== "active" || !verifyPassword(password, result.passwordHash)) {
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256(token);
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$executeRaw`
    INSERT INTO CustomerSession (id, accountId, tokenHash, expiresAt, createdAt)
    VALUES (${sessionId}, ${result.account.id}, ${tokenHash}, ${expiresAt}, CURRENT_TIMESTAMP)
  `;
  await touchCustomerLogin(result.account.id);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });

  return result.account;
}

export async function getCurrentCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const rows = await prisma.$queryRaw<CustomerSessionRow[]>`
    SELECT
      s.id,
      s.accountId,
      a.email,
      a.name,
      a.credits,
      a.status,
      a.note,
      a.lastLoginAt,
      a.createdAt,
      a.updatedAt
    FROM CustomerSession s
    JOIN CustomerAccount a ON a.id = s.accountId
    WHERE s.tokenHash = ${tokenHash}
      AND s.expiresAt > unixepoch('now') * 1000
      AND a.status = 'active'
    LIMIT 1
  `;
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function logoutCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.$executeRaw`DELETE FROM CustomerSession WHERE tokenHash = ${sha256(token)}`;
  }
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export async function requireCurrentCustomer() {
  const account = await getCurrentCustomer();
  if (!account) {
    throw new Error("CUSTOMER_LOGIN_REQUIRED");
  }
  return account;
}
