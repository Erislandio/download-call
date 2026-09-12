import { NextRequest } from "next/server";
import { spawnDownload, buildDownloadOptions } from "@/lib/ytdlp";
import { createJob, updateJob } from "@/lib/download-jobs";
import os from "os";
import path from "path";
import fs from "fs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const formatId = searchParams.get("format") || "mp4-720";
  const isAudio = searchParams.get("audio") === "true";
  const jobId = searchParams.get("jobId");

  if (!url) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const outputTemplate = path.join(tmpDir, `yt-${jobId}.%(ext)s`);

  // Build a fake download option from the formatId param
  const option = buildDownloadOptions([]).find((o) => o.id === formatId) ?? {
    id: formatId,
    label: "Download",
    quality: "720p",
    format: "mp4" as const,
    ytdlpFormat: `bestvideo[height<=720]+bestaudio/best`,
    isAudioOnly: isAudio,
  };

  // Register job before spawning
  createJob(jobId);
  updateJob(jobId, { status: "downloading" });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // ignore — client may have disconnected
        }
      };

      let resolvedPath: string | null = null;

      const proc = spawnDownload(
        url,
        option,
        outputTemplate,
        (progress, speed, eta) => {
          send({ progress, speed, eta });
        }
      );

      // Capture the resolved output path from yt-dlp logs
      proc.stdout.on("data", (data: Buffer) => {
        const line = data.toString();
        const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+?)"/);
        const destMatch = line.match(/\[download\] Destination: (.+)/);
        if (mergeMatch) resolvedPath = mergeMatch[1].trim();
        else if (destMatch && !resolvedPath) resolvedPath = destMatch[1].trim();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          // Resolve actual file path (yt-dlp expands %(ext)s)
          if (!resolvedPath || !fs.existsSync(resolvedPath)) {
            const prefix = outputTemplate.replace("%(ext)s", "");
            const dir = path.dirname(prefix);
            const base = path.basename(prefix);
            const files = fs.readdirSync(dir).filter((f) => f.startsWith(base));
            if (files.length > 0) {
              resolvedPath = path.join(dir, files[0]);
            }
          }

          if (resolvedPath && fs.existsSync(resolvedPath)) {
            updateJob(jobId, { status: "done", filePath: resolvedPath });
            send({ progress: 100, speed: "", eta: "0:00", done: true });
          } else {
            updateJob(jobId, { status: "error", error: "Arquivo não encontrado após download" });
            send({ error: "Arquivo não encontrado após download", done: true });
          }
        } else {
          updateJob(jobId, { status: "error", error: "yt-dlp falhou" });
          send({ error: "Download falhou", done: true });
        }

        try {
          controller.close();
        } catch {
          // ignore
        }
      });

      proc.on("error", (err) => {
        updateJob(jobId, { status: "error", error: err.message });
        send({ error: err.message, done: true });
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
