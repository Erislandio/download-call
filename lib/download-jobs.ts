import fs from "fs";

export type JobStatus = "pending" | "downloading" | "done" | "error";

export interface DownloadJob {
  status: JobStatus;
  /** Absolute path to the downloaded temp file (set when done) */
  filePath?: string;
  error?: string;
  /** Epoch ms of job creation — used for TTL cleanup */
  createdAt: number;
}

// Singleton map shared across requests in the same Node.js process.
const jobs = new Map<string, DownloadJob>();

/** TTL: remove jobs + their temp files after 30 minutes */
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneStale() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      if (job.filePath) {
        try {
          fs.unlinkSync(job.filePath);
        } catch {
          // ignore — file may already be gone
        }
      }
      jobs.delete(id);
    }
  }
}

export function createJob(jobId: string): void {
  pruneStale();
  jobs.set(jobId, { status: "pending", createdAt: Date.now() });
}

export function updateJob(jobId: string, partial: Partial<DownloadJob>): void {
  const existing = jobs.get(jobId);
  if (!existing) return;
  jobs.set(jobId, { ...existing, ...partial });
}

export function getJob(jobId: string): DownloadJob | undefined {
  return jobs.get(jobId);
}

/**
 * Deletes the temp file and removes the job from the map.
 * Call this after the file has been fully streamed to the client.
 */
export function cleanupJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  if (job.filePath) {
    try {
      fs.unlinkSync(job.filePath);
    } catch {
      // ignore
    }
  }
  jobs.delete(jobId);
}
