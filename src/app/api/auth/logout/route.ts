import { NextResponse } from "next/server";
import { logoutCustomer } from "@/lib/auth/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await logoutCustomer();
  return NextResponse.json({ success: true });
}
