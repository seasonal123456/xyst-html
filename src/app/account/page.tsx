import { redirect } from "next/navigation";
import { MemberCenter } from "@/components/account/member-center";
import { getCurrentCustomer } from "@/lib/auth/customer-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const account = await getCurrentCustomer();
  if (!account) redirect("/login?next=/account");

  return <MemberCenter account={account} />;
}
