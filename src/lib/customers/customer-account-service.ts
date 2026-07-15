import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

export type CustomerAccountStatus = "active" | "disabled";

export type CustomerAccount = {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  status: CustomerAccountStatus;
  note: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CustomerAccountRow = {
  id: string;
  email: string;
  name: string | null;
  passwordHash?: string;
  credits: number | bigint;
  status: string;
  note: string | null;
  lastLoginAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function id() {
  return randomUUID();
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAccount(row: CustomerAccountRow): CustomerAccount {
  return {
    id: row.id,
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

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const current = Buffer.from(scryptSync(password, salt, 64).toString("hex"));
  const expected = Buffer.from(hash);
  return current.length === expected.length && timingSafeEqual(current, expected);
}

export async function listCustomerAccounts() {
  const rows = await prisma.$queryRaw<CustomerAccountRow[]>`
    SELECT id, email, name, credits, status, note, lastLoginAt, createdAt, updatedAt
    FROM CustomerAccount
    ORDER BY createdAt DESC
  `;
  return rows.map(toAccount);
}

export async function getCustomerAccount(id: string) {
  const rows = await prisma.$queryRaw<CustomerAccountRow[]>`
    SELECT id, email, name, credits, status, note, lastLoginAt, createdAt, updatedAt
    FROM CustomerAccount
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function getCustomerAccountByEmailWithPassword(email: string) {
  const normalized = normalizeEmail(email);
  const rows = await prisma.$queryRaw<CustomerAccountRow[]>`
    SELECT id, email, name, passwordHash, credits, status, note, lastLoginAt, createdAt, updatedAt
    FROM CustomerAccount
    WHERE email = ${normalized}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row?.passwordHash) return null;
  return { account: toAccount(row), passwordHash: row.passwordHash };
}

export async function createCustomerAccount(input: {
  email: string;
  password: string;
  name?: string;
  credits?: number;
  status?: CustomerAccountStatus;
  note?: string;
}) {
  const accountId = id();
  const email = normalizeEmail(input.email);
  const credits = Math.max(0, Math.floor(Number(input.credits) || 0));
  await prisma.$executeRaw`
    INSERT INTO CustomerAccount (id, email, name, passwordHash, credits, status, note, createdAt, updatedAt)
    VALUES (${accountId}, ${email}, ${input.name?.trim() || null}, ${hashPassword(input.password)}, ${credits}, ${input.status || "active"}, ${input.note?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
  return getCustomerAccount(accountId);
}

export async function updateCustomerAccount(input: {
  id: string;
  email?: string;
  password?: string;
  name?: string | null;
  credits?: number;
  status?: CustomerAccountStatus;
  note?: string | null;
}) {
  const current = await getCustomerAccount(input.id);
  if (!current) return null;

  await prisma.$executeRaw`
    UPDATE CustomerAccount
    SET
      email = ${input.email === undefined ? current.email : normalizeEmail(input.email)},
      name = ${input.name === undefined ? current.name : input.name?.trim() || null},
      passwordHash = COALESCE(${input.password?.trim() ? hashPassword(input.password) : null}, passwordHash),
      credits = ${input.credits === undefined ? current.credits : Math.max(0, Math.floor(Number(input.credits) || 0))},
      status = ${input.status || current.status},
      note = ${input.note === undefined ? current.note : input.note?.trim() || null},
      updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${input.id}
  `;
  return getCustomerAccount(input.id);
}

export async function touchCustomerLogin(accountId: string) {
  await prisma.$executeRaw`
    UPDATE CustomerAccount
    SET lastLoginAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${accountId}
  `;
}
