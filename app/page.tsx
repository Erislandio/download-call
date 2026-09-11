"use client";

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/VideoCard";
import { FormatSelector } from "@/components/FormatSelector";
import { ProgressBar } from "@/components/ProgressBar";

import {
  Search,
  Download,
  Loader2,
  AlertCircle,
  Video,
  Sparkles,
} from "lucide-react";

// Defined inline to avoid importing server-only lib/ytdlp in the client bundle
interface DownloadOption {
  id: string;
  label: string;
  quality: string;
  format: "mp4" | "mp3" | "webm";
  ytdlpFormat: string;
  filesize?: number;
  isAudioOnly: boolean;
}

interface VideoData {
  id: string;
  title: string;
  thumbnail: string;
  uploader: string;
  duration: number;
  view_count: number;
  like_count?: number;
  upload_date: string;
  description: string;
  webpage_url: string;
  downloadOptions: DownloadOption[];
}

type DownloadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; progress: number; speed: string; eta: string }
  | { status: "done" }
  | { status: "error"; message: string };

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("mp4-720");
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: "idle",
  });

  const abortRef = useRef<AbortController | null>(null);

  const handleFetch = useCallback(async () => {
    if (!url.trim()) return;
    setFetching(true);
    setFetchError(null);
    setVideoData(null);
    setDownloadState({ status: "idle" });

    try {
      const res = await fetch(
        `/api/info?url=${encodeURIComponent(url.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao buscar informações do vídeo");
      }

      setVideoData(data);
      // Pre-select best video option
      const best = data.downloadOptions.find(
        (o: DownloadOption) => o.id === "mp4-720"
      );
      if (best) setSelectedFormat(best.id);
      else if (data.downloadOptions.length > 0)
        setSelectedFormat(data.downloadOptions[0].id);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro desconhecido";
      setFetchError(msg);
    } finally {
      setFetching(false);
    }
  }, [url]);

  const handleDownload = useCallback(async () => {
    if (!videoData || !selectedFormat) return;

    const option = videoData.downloadOptions.find(
      (o) => o.id === selectedFormat
    );
    if (!option) return;

    setDownloadState({ status: "loading" });

    // Use SSE for progress, then trigger actual download
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const progressUrl = `/api/progress?url=${encodeURIComponent(
      videoData.webpage_url
    )}&format=${selectedFormat}&audio=${option.isAudioOnly}`;

    try {
      const response = await fetch(progressUrl, {
        signal: abortRef.current.signal,
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      setDownloadState({
        status: "ready",
        progress: 0,
        speed: "",
        eta: "",
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.error) {
                setDownloadState({ status: "error", message: evt.error });
                return;
              }
              if (evt.done) {
                setDownloadState({ status: "done" });
                // Trigger browser download
                const a = document.createElement("a");
                a.href = `/api/download?url=${encodeURIComponent(
                  videoData.webpage_url
                )}&format=${selectedFormat}&audio=${option.isAudioOnly}`;
                a.click();
              } else {
                setDownloadState({
                  status: "ready",
                  progress: evt.progress || 0,
                  speed: evt.speed || "",
                  eta: evt.eta || "",
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Erro no download";
      setDownloadState({ status: "error", message: msg });
    }
  }, [videoData, selectedFormat]);

  return (
    <main className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-red-500/10 blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 shadow-2xl shadow-red-500/30 mb-2">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground/80 to-foreground/60 bg-clip-text text-transparent">
            YouTube Downloader
          </h1>
          <p className="text-muted-foreground text-lg max-w-sm mx-auto leading-relaxed">
            Cole o link de qualquer vídeo do YouTube e baixe em MP4 ou MP3
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
            <Sparkles className="w-3 h-3" />
            <span>Powered by yt-dlp — rápido, confiável, sem anúncios</span>
          </div>
        </div>

        {/* URL Input */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="youtube-url-input"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                className="pl-10 h-12 text-base bg-card/60 backdrop-blur-sm border-border/60 focus:border-primary/60 transition-colors"
              />
            </div>
            <Button
              id="fetch-btn"
              onClick={handleFetch}
              disabled={fetching || !url.trim()}
              className="h-12 px-5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] border-0"
            >
              {fetching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              <span className="ml-2 font-semibold">Buscar</span>
            </Button>
          </div>

          {fetchError && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in fade-in-0 slide-in-from-top-2 duration-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}
        </div>

        {/* Video Info + Download */}
        {videoData && (
          <div className="space-y-5 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <VideoCard
              title={videoData.title}
              thumbnail={videoData.thumbnail}
              uploader={videoData.uploader}
              duration={videoData.duration}
              view_count={videoData.view_count}
              like_count={videoData.like_count}
              upload_date={videoData.upload_date}
              description={videoData.description}
            />

            {/* Format Selection */}
            <div className="p-5 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-xl space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
                Selecione o Formato
              </h3>
              <FormatSelector
                options={videoData.downloadOptions}
                selected={selectedFormat}
                onSelect={setSelectedFormat}
              />

              {/* Download Button */}
              <Button
                id="download-btn"
                onClick={handleDownload}
                disabled={
                  downloadState.status === "loading" ||
                  downloadState.status === "ready"
                }
                className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 text-primary-foreground font-bold text-base shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {downloadState.status === "loading" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Preparando download...
                  </>
                ) : downloadState.status === "ready" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Baixando...
                  </>
                ) : downloadState.status === "done" ? (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Download Concluído ✓
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Baixar{" "}
                    {videoData.downloadOptions
                      .find((o) => o.id === selectedFormat)
                      ?.label || ""}
                  </>
                )}
              </Button>

              {/* Progress */}
              {(downloadState.status === "ready" ||
                downloadState.status === "done") && (
                <ProgressBar
                  progress={
                    downloadState.status === "done"
                      ? 100
                      : downloadState.progress
                  }
                  speed={
                    downloadState.status === "ready"
                      ? downloadState.speed
                      : undefined
                  }
                  eta={
                    downloadState.status === "ready"
                      ? downloadState.eta
                      : undefined
                  }
                  className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
                />
              )}

              {downloadState.status === "error" && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in fade-in-0 duration-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{downloadState.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 pb-6">
          Use apenas para conteúdo que você tem direito de baixar.
        </p>
      </div>
    </main>
  );
}
