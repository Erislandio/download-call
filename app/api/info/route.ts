import { NextRequest } from "next/server";
import { getVideoInfo, buildDownloadOptions, getVideoTranscript } from "@/lib/ytdlp";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return Response.json({ error: "URL é obrigatória" }, { status: 400 });
  }

  // Validate YouTube URL
  const ytRegex =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/;
  if (!ytRegex.test(url)) {
    return Response.json(
      { error: "URL inválida. Por favor, use um link do YouTube." },
      { status: 400 }
    );
  }

  try {
    // Fetch video info and transcript in parallel
    const [info, videoTranscript] = await Promise.all([
      getVideoInfo(url),
      getVideoTranscript(url).catch(() => null),
    ]);

    const downloadOptions = buildDownloadOptions(info.formats || []);

    return Response.json({
      id: info.id,
      title: info.title,
      description: info.description?.slice(0, 300) || "",
      duration: info.duration,
      thumbnail: info.thumbnail,
      uploader: info.uploader,
      upload_date: info.upload_date,
      view_count: info.view_count,
      like_count: info.like_count,
      webpage_url: info.webpage_url,
      transcript: videoTranscript?.text ?? null,
      transcriptSegments: videoTranscript?.segments ?? null,
      downloadOptions,
    });
  } catch (err: unknown) {
    console.error("yt-dlp info error:", err);
    const msg =
      err instanceof Error ? err.message : "Falha ao buscar informações do vídeo";
    return Response.json({ error: msg }, { status: 500 });
  }
}
