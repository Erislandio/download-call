import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize?: number;
  filesize_approx?: number;
  vcodec: string;
  acodec: string;
  fps?: number;
  tbr?: number;
  abr?: number;
  format_note?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  upload_date: string;
  view_count: number;
  like_count?: number;
  formats: VideoFormat[];
  webpage_url: string;
}

export interface DownloadOption {
  id: string;
  label: string;
  quality: string;
  format: "mp4" | "mp3" | "webm";
  ytdlpFormat: string;
  filesize?: number;
  isAudioOnly: boolean;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync(YTDLP_PATH, [
    "--dump-json",
    "--no-playlist",
    "--ffmpeg-location",
    FFMPEG_PATH,
    url,
  ]);

  const info = JSON.parse(stdout) as VideoInfo;
  return info;
}

/** A single subtitle cue with start/end in seconds and plain text. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/** Transcript with both plain text (for display) and segments (for Gemini). */
export interface VideoTranscript {
  text: string;
  segments: TranscriptSegment[];
}

/** Convert a VTT timestamp string (HH:MM:SS.mmm or MM:SS.mmm) to seconds. */
function vttTimeToSeconds(ts: string): number {
  const parts = ts.trim().split(":");
  if (parts.length === 3) {
    return (
      parseInt(parts[0]) * 3600 +
      parseInt(parts[1]) * 60 +
      parseFloat(parts[2])
    );
  }
  return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
}

/** Parse a VTT subtitle file into cues with timestamps and clean text. */
function parseVttWithTimestamps(vttContent: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // Split on blank lines to get individual cues
  const cues = vttContent.split(/\n\s*\n/);

  for (const cue of cues) {
    const lines = cue.split("\n").map((l) => l.trim()).filter(Boolean);
    // Find the timing line
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx === -1) continue;

    const timing = lines[timingIdx];
    const match = timing.match(
      /^([\d:.,]+)\s*-->\s*([\d:.,]+)/
    );
    if (!match) continue;

    const start = vttTimeToSeconds(match[1].replace(",", "."));
    const end = vttTimeToSeconds(match[2].replace(",", "."));

    // Text lines are everything after the timing line
    const rawText = lines.slice(timingIdx + 1).join(" ");
    const text = rawText
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();

    if (text) {
      segments.push({ start, end, text });
    }
  }

  // Deduplicate consecutive cues with identical text
  return segments.filter(
    (seg, i) => i === 0 || seg.text !== segments[i - 1].text
  );
}

/** Parse a VTT subtitle file into clean plain text (no timestamps, no duplicates). */
function parseVtt(vttContent: string): string {
  const segments = parseVttWithTimestamps(vttContent);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const seg of segments) {
    if (!seen.has(seg.text)) {
      seen.add(seg.text);
      result.push(seg.text);
    }
  }
  return result.join("\n");
}

/**
 * Downloads subtitle/auto-caption tracks for a YouTube URL using yt-dlp,
 * parses the VTT file, and returns { text, segments }.
 * Returns null if no subtitles are available.
 */
export async function getVideoTranscript(url: string): Promise<VideoTranscript | null> {
  const tmpDir = await mkdtemp(join(tmpdir(), "yt-transcript-"));

  try {
    // Try manual subs first, fall back to auto-generated captions
    for (const subArgs of [
      ["--write-subs", "--no-write-auto-subs"],
      ["--write-auto-subs", "--no-write-subs"],
    ]) {
      await execFileAsync(YTDLP_PATH, [
        "--no-playlist",
        "--skip-download",
        "--sub-langs", "pt-BR,pt",
        "--convert-subs", "vtt",
        "--ffmpeg-location", FFMPEG_PATH,
        "-o", join(tmpDir, "%(id)s"),
        ...subArgs,
        url,
      ]).catch(() => null); // ignore errors, check files below

      const files = await readdir(tmpDir);
      const vttFile = files.find((f) => f.endsWith(".vtt"));

      if (vttFile) {
        const content = await readFile(join(tmpDir, vttFile), "utf-8");
        const segments = parseVttWithTimestamps(content);
        const text = segments
          .map((s) => `[${formatDuration(s.start)}] ${s.text}`)
          .join("\n");
        if (text) return { text, segments };
      }
    }

    // No Portuguese subs found — try English as last resort
    for (const subArgs of [
      ["--write-subs", "--no-write-auto-subs"],
      ["--write-auto-subs", "--no-write-subs"],
    ]) {
      await execFileAsync(YTDLP_PATH, [
        "--no-playlist",
        "--skip-download",
        "--sub-langs", "en,en-US",
        "--convert-subs", "vtt",
        "--ffmpeg-location", FFMPEG_PATH,
        "-o", join(tmpDir, "%(id)s"),
        ...subArgs,
        url,
      ]).catch(() => null);

      const files = await readdir(tmpDir);
      const vttFile = files.find((f) => f.endsWith(".vtt"));

      if (vttFile) {
        const content = await readFile(join(tmpDir, vttFile), "utf-8");
        const segments = parseVttWithTimestamps(content);
        const text = segments
          .map((s) => `[${formatDuration(s.start)}] ${s.text}`)
          .join("\n");
        if (text) return { text, segments };
      }
    }

    return null;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export function buildDownloadOptions(formats: VideoFormat[]): DownloadOption[] {
  const options: DownloadOption[] = [];

  // Video + Audio options (MP4)
  // Format string: prefer dash streams merged by ffmpeg, fallback to pre-merged
  const videoQualities = [
    { label: "1080p HD", height: 1080, fmt: "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best" },
    { label: "720p HD",  height: 720,  fmt: "bestvideo[height<=720]+bestaudio/best[height<=720]/best" },
    { label: "480p",     height: 480,  fmt: "bestvideo[height<=480]+bestaudio/best[height<=480]/best" },
    { label: "360p",     height: 360,  fmt: "bestvideo[height<=360]+bestaudio/best[height<=360]/best" },
  ];

  for (const q of videoQualities) {
    const hasQuality = formats.some(
      (f) =>
        f.vcodec !== "none" &&
        f.resolution &&
        parseInt(f.resolution.split("x")[1] || "0") >= q.height * 0.9
    );

    if (hasQuality || q.height <= 720) {
      options.push({
        id: `mp4-${q.height}`,
        label: `MP4 ${q.label}`,
        quality: q.label,
        format: "mp4",
        ytdlpFormat: q.fmt,
        isAudioOnly: false,
      });
    }
  }

  // Audio-only MP3
  options.push({
    id: "mp3-best",
    label: "MP3 (Apenas Áudio)",
    quality: "320kbps",
    format: "mp3",
    ytdlpFormat: "bestaudio/best",
    isAudioOnly: true,
  });

  return options;
}

export function spawnDownload(
  url: string,
  option: DownloadOption,
  outputPath: string,
  onProgress: (progress: number, speed: string, eta: string) => void
) {
  const args: string[] = [
    "--no-playlist",
    "--no-warnings",
    "--ffmpeg-location", FFMPEG_PATH,
    "-o", outputPath,
  ];

  if (option.isAudioOnly) {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    args.push("-f", option.ytdlpFormat, "--merge-output-format", "mp4");
  }

  args.push("--newline", url);

  const proc = spawn(YTDLP_PATH, args);

  proc.stdout.on("data", (data: Buffer) => {
    const line = data.toString();

    // Parse progress: [download]  45.3% of   12.34MiB at   1.23MiB/s ETA 00:05
    const match = line.match(
      /\[download\]\s+([\d.]+)%.*?at\s+([\d.]+\w+\/s).*?ETA\s+([\d:]+)/
    );
    if (match) {
      onProgress(parseFloat(match[1]), match[2], match[3]);
    }
  });

  return proc;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "Tamanho desconhecido";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
