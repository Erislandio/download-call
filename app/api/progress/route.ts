import { NextRequest } from "next/server";
import { spawnDownload, buildDownloadOptions } from "@/lib/ytdlp";
import os from "os";
import path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const formatId = searchParams.get("format") || "mp4-720";
  const isAudio = searchParams.get("audio") === "true";

  if (!url) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `yt-progress-${Date.now()}.%(ext)s`);

  // Build a fake download option from the formatId param
  const option = buildDownloadOptions([]).find((o) => o.id === formatId) ?? {
    id: formatId,
    label: "Download",
    quality: "720p",
    format: "mp4" as const,
    ytdlpFormat: "bestvideo[height<=720]+bestaudio/best",
    isAudioOnly: isAudio,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // ignore
        }
      };

      const proc = spawnDownload(
        url,
        option,
        outputPath,
        (progress, speed, eta) => {
          send({ progress, speed, eta });
        }
      );

      proc.on("close", (code) => {
        if (code === 0) {
          send({ progress: 100, speed: "", eta: "0:00", done: true });
        } else {
          send({ error: "Download falhou", done: true });
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      });

      proc.on("error", (err) => {
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
