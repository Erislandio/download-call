import { NextRequest } from "next/server";
import { getJob, cleanupJob } from "@/lib/download-jobs";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "jobId é obrigatório" }, { status: 400 });
  }

  const job = getJob(jobId);

  if (!job) {
    return Response.json(
      { error: "Job não encontrado. O download pode ter expirado." },
      { status: 404 }
    );
  }

  if (job.status === "error") {
    return Response.json(
      { error: job.error ?? "Download falhou" },
      { status: 500 }
    );
  }

  if (job.status !== "done" || !job.filePath) {
    return Response.json(
      { error: "Download ainda em progresso. Aguarde a conclusão." },
      { status: 202 }
    );
  }

  const filePath = job.filePath;

  if (!fs.existsSync(filePath)) {
    return Response.json(
      { error: "Arquivo temporário não encontrado no servidor" },
      { status: 404 }
    );
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);

  const contentType =
    ext === ".mp3"
      ? "audio/mpeg"
      : ext === ".webm"
      ? "video/webm"
      : "video/mp4";

  // ── Handle HTTP Range Requests (allows download resumption) ─────────────
  const rangeHeader = request.headers.get("range");
  let start = 0;
  let end = fileSize - 1;
  let isPartial = false;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      start = match[1] ? parseInt(match[1], 10) : 0;
      end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      // Clamp to valid range
      start = Math.max(0, Math.min(start, fileSize - 1));
      end = Math.max(start, Math.min(end, fileSize - 1));
      isPartial = true;
    }
  }

  const chunkSize = end - start + 1;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    "Content-Length": String(chunkSize),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };

  if (isPartial) {
    headers["Content-Range"] = `bytes ${start}-${end}/${fileSize}`;
  }

  // ── Stream the file (or range) to the client ────────────────────────────
  const fileStream = fs.createReadStream(filePath, { start, end });

  // Cleanup the temp file after the stream finishes (only on full download)
  // For range requests we keep the file until all bytes are sent or it expires.
  const isFullDownload = !isPartial || (start === 0 && end === fileSize - 1);

  const nodeStream = fileStream;

  // Wrap Node.js ReadStream into a Web ReadableStream
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });

      nodeStream.on("end", () => {
        controller.close();
        if (isFullDownload) {
          // Small delay to ensure the response is flushed before unlink
          setTimeout(() => cleanupJob(jobId), 500);
        }
      });

      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    status: isPartial ? 206 : 200,
    headers,
  });
}
