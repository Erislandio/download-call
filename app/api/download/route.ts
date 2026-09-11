import { NextRequest } from "next/server";
import { spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";

const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const formatId = searchParams.get("format") || "mp4-720";
  const isAudioOnly = searchParams.get("audio") === "true";

  if (!url) {
    return Response.json({ error: "URL é obrigatória" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `yt-${Date.now()}.%(ext)s`);

  const args: string[] = [
    "--no-playlist",
    "--no-warnings",
    "--ffmpeg-location", FFMPEG_PATH,
    "-o", tmpFile,
  ];

  if (isAudioOnly) {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    // Derive quality height from formatId like "mp4-1080", "mp4-720", etc.
    const height = formatId.replace("mp4-", "");
    args.push(
      "-f",
      `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
      "--merge-output-format",
      "mp4"
    );
  }

  args.push(url);

  let resolvedPath: string | null = null;

  return new Promise<Response>((resolve) => {
    const proc = spawn(YTDLP_PATH, args);

    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const line = data.toString();
      // Extract the actual output path from yt-dlp merge messages
      const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+?)"/);
      const destMatch = line.match(/\[download\] Destination: (.+)/);
      if (mergeMatch) resolvedPath = mergeMatch[1];
      else if (destMatch && !resolvedPath) resolvedPath = destMatch[1];
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(
          Response.json(
            { error: `yt-dlp falhou: ${stderr.slice(0, 500)}` },
            { status: 500 }
          )
        );
        return;
      }

      // Find the actual file (yt-dlp replaces %(ext)s)
      const pattern = tmpFile.replace("%(ext)s", "");
      const dir = path.dirname(pattern);
      const base = path.basename(pattern);

      let actualFile = resolvedPath;
      if (!actualFile || !fs.existsSync(actualFile)) {
        // Fallback: look in tmpdir for matching file
        const files = fs.readdirSync(dir).filter((f) => f.startsWith(base));
        if (files.length > 0) {
          actualFile = path.join(dir, files[0]);
        }
      }

      if (!actualFile || !fs.existsSync(actualFile)) {
        resolve(
          Response.json(
            { error: "Arquivo baixado não encontrado" },
            { status: 500 }
          )
        );
        return;
      }

      const fileBuffer = fs.readFileSync(actualFile);
      const ext = path.extname(actualFile).toLowerCase();
      const contentType =
        ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".webm"
          ? "video/webm"
          : "video/mp4";
      const filename = path.basename(actualFile);

      // Cleanup temp file
      try {
        fs.unlinkSync(actualFile);
      } catch {
        // ignore cleanup errors
      }

      resolve(
        new Response(fileBuffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            "Content-Length": String(fileBuffer.length),
          },
        })
      );
    });

    proc.on("error", (err) => {
      resolve(
        Response.json(
          { error: `Erro ao iniciar yt-dlp: ${err.message}` },
          { status: 500 }
        )
      );
    });
  });
}
