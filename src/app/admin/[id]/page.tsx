import Link from "next/link";
import { AdminJobDetail } from "@/components/admin/AdminJobDetail";
import { isAdminAuthenticated } from "@/lib/auth/admin-auth";
import { getJobById } from "@/lib/jobs/job-service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminDetailPage({ params }: PageProps) {
  if (!(await isAdminAuthenticated())) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
          <h1 className="text-xl font-black text-slate-950">需要管理员登录</h1>
          <Link href="/admin" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm font-extrabold text-white">返回登录</Link>
        </div>
      </main>
    );
  }

  const { id } = await params;
  const job = await getJobById(id, true);

  if (!job) {
    return <main className="p-8 text-sm font-bold text-slate-500">任务不存在。</main>;
  }

  return <AdminJobDetail initialJob={job} />;
}
