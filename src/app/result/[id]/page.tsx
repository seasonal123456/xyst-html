import { ResultSharePage } from "@/components/ResultSharePage";
import { getJobById } from "@/lib/jobs/job-service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ResultPage({ params }: PageProps) {
  const { id } = await params;
  const job = await getJobById(id);

  if (!job) {
    return <main className="p-8 text-sm font-bold text-slate-500">结果不存在或已不可访问。</main>;
  }

  return <ResultSharePage job={job} />;
}
