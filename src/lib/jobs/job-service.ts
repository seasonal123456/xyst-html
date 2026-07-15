import type { Job, JobFile } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { GenerateJob, GenerateJobInput, JobMode, JobStatus, StoredUploadedFile } from "@/types";

type JobWithFiles = Job & {
  files: JobFile[];
};

export type CreateJobInput = GenerateJobInput;

export type UpdateJobInput = Partial<{
  status: JobStatus;
  mode: JobMode;
  prompt: string;
  generatedImageUrl: string | null;
  publicResultUrl: string | null;
  adminNote: string | null;
  error: string | null;
  regeneratedCount: number;
}>;

export function toGenerateJob(job: JobWithFiles): GenerateJob {
  return {
    id: job.id,
    status: job.status as JobStatus,
    mode: job.mode as JobMode,
    input: {
      name: job.name,
      customerName: job.customerName ?? "",
      customerContact: job.customerContact ?? "",
      industry: job.industry ?? "",
      business: job.business ?? "",
      targetCustomer: job.targetCustomer ?? "",
      sellingPoints: job.sellingPoints ?? "",
      contact: job.contact ?? "",
      note: job.note ?? "",
      contentType: job.contentType,
      style: job.style,
      usagePurpose: job.usagePurpose ?? "",
      needManualRefine: job.needManualRefine,
      materialConsent: job.materialConsent
    },
    prompt: job.prompt,
    uploadedFiles: job.files.map((file) => ({
      id: file.id,
      jobId: file.jobId,
      originalName: file.originalName,
      storedName: file.storedName,
      mimeType: file.mimeType,
      size: file.size,
      url: file.url,
      storageType: file.storageType as "local" | "aliyun-oss",
      createdAt: file.createdAt.toISOString()
    })),
    generatedImageUrl: job.generatedImageUrl ?? undefined,
    publicResultUrl: job.publicResultUrl ?? undefined,
    adminNote: job.adminNote ?? undefined,
    error: job.error ?? undefined,
    regeneratedCount: job.regeneratedCount,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

export function sanitizePublicJob(job: GenerateJob): GenerateJob {
  const { adminNote: _adminNote, error: _error, rawProviderResponse: _rawProviderResponse, ...publicJob } = job;
  return publicJob;
}

export async function createJob(input: CreateJobInput): Promise<GenerateJob> {
  const job = await prisma.job.create({
    data: {
      status: "pending",
      mode: "mock",
      name: input.name,
      customerName: input.customerName || null,
      customerContact: input.customerContact || null,
      industry: input.industry || null,
      business: input.business || null,
      targetCustomer: input.targetCustomer || null,
      sellingPoints: input.sellingPoints || null,
      contact: input.contact || null,
      note: input.note || null,
      contentType: input.contentType,
      style: input.style,
      usagePurpose: input.usagePurpose || null,
      needManualRefine: input.needManualRefine,
      materialConsent: input.materialConsent,
      prompt: ""
    },
    include: { files: true }
  });

  return toGenerateJob(job);
}

export async function updateJob(id: string, data: UpdateJobInput): Promise<GenerateJob | null> {
  const job = await prisma.job
    .update({
      where: { id },
      data,
      include: { files: true }
    })
    .catch(() => null);

  return job ? toGenerateJob(job) : null;
}

export async function addJobFiles(jobId: string, files: StoredUploadedFile[]): Promise<GenerateJob | null> {
  await prisma.jobFile.createMany({
    data: files.map((file) => ({
      jobId,
      originalName: file.originalName,
      storedName: file.storedName,
      mimeType: file.mimeType,
      size: file.size,
      url: file.url,
      storageType: file.storageType || "local"
    }))
  });

  return getJobById(jobId, true);
}

export async function getJobById(id: string, includeAdmin = false): Promise<GenerateJob | null> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: { files: true }
  });

  if (!job) {
    return null;
  }

  const mapped = toGenerateJob(job);
  return includeAdmin ? mapped : sanitizePublicJob(mapped);
}

export async function getRecentJobs(limit = 20): Promise<GenerateJob[]> {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { files: true }
  });

  return jobs.map((job) => sanitizePublicJob(toGenerateJob(job)));
}

export async function getAdminJobs(options: { status?: string; keyword?: string; page?: number; pageSize?: number }) {
  const page = Math.max(options.page || 1, 1);
  const pageSize = Math.min(Math.max(options.pageSize || 20, 1), 100);
  const where = {
    ...(options.status && options.status !== "all" ? { status: options.status } : {}),
    ...(options.keyword
      ? {
          OR: [
            { name: { contains: options.keyword } },
            { customerName: { contains: options.keyword } },
            { customerContact: { contains: options.keyword } }
          ]
        }
      : {})
  };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { files: true }
    }),
    prisma.job.count({ where })
  ]);

  return {
    jobs: jobs.map(toGenerateJob),
    total,
    page,
    pageSize
  };
}
