import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import type { GenerateJob, JobStatus } from "@/types";

function getJobStorePath(): string {
  const configuredPath = process.env.JOB_STORE_PATH || "data/jobs.json";
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

async function ensureJobStore(): Promise<string> {
  const storePath = getJobStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch {
    await writeFile(storePath, "[]", "utf8");
  }

  return storePath;
}

export async function readJobs(): Promise<GenerateJob[]> {
  const storePath = await ensureJobStore();
  const content = await readFile(storePath, "utf8");

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJobs(jobs: GenerateJob[]): Promise<void> {
  const storePath = await ensureJobStore();
  await writeFile(storePath, JSON.stringify(jobs, null, 2), "utf8");
}

export async function createJob(job: GenerateJob): Promise<GenerateJob> {
  const jobs = await readJobs();
  jobs.unshift(job);
  await writeJobs(jobs);
  return job;
}

export async function updateJob(id: string, patch: Partial<GenerateJob> & { status?: JobStatus }): Promise<GenerateJob | null> {
  const jobs = await readJobs();
  const index = jobs.findIndex((job) => job.id === id);

  if (index < 0) {
    return null;
  }

  const updated: GenerateJob = {
    ...jobs[index],
    ...patch,
    updatedAt: new Date().toISOString()
  };

  jobs[index] = updated;
  await writeJobs(jobs);
  return updated;
}

export async function getRecentJobs(limit = 20): Promise<GenerateJob[]> {
  const jobs = await readJobs();
  return jobs
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function getJobById(id: string): Promise<GenerateJob | null> {
  const jobs = await readJobs();
  return jobs.find((job) => job.id === id) ?? null;
}
