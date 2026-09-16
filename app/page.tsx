"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  FileText,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Trash2,
  Music,
  Film,
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

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface Highlight {
  title: string;
  start: string;
  end: string;
  reason: string;
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
  transcript: string | null;
  transcriptSegments: TranscriptSegment[] | null;
  downloadOptions: DownloadOption[];
}

type DownloadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; progress: number; speed: string; eta: string }
  | { status: "done" }
  | { status: "error"; message: string };

// ──────────────────────────────────────────────
// History types & helpers
// ──────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  uploader: string;
  webpage_url: string;
  format: string;
  formatLabel: string;
  isAudioOnly: boolean;
  downloadedAt: string;
}

const HISTORY_KEY = "yt_downloader_history";

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // quota exceeded — silently ignore
  }
}

function addHistoryEntry(entry: HistoryEntry) {
  const current = loadHistory();
  const isDuplicate =
    current[0]?.videoId === entry.videoId &&
    current[0]?.format === entry.format;
  if (isDuplicate) return;
  const updated = [entry, ...current].slice(0, 50);
  saveHistory(updated);
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Agora mesmo";
  if (mins < 60) return `${mins} min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Ontem";
  if (days < 7) return `${days} dias atrás`;
  return new Date(isoDate).toLocaleDateString("pt-BR");
}

// ──────────────────────────────────────────────
// History Panel Component
// ──────────────────────────────────────────────

function HistoryPanel() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  const handleDelete = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    saveHistory(updated);
  };

  const handleClearAll = () => {
    setEntries([]);
    saveHistory([]);
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center animate-in fade-in-0 duration-500">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center">
          <Clock className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-muted-foreground">
            Nenhum download no histórico
          </p>
          <p className="text-sm text-muted-foreground/60">
            Seus downloads aparecerão aqui após serem concluídos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? "download" : "downloads"} salvos
        </p>
        <button
          id="clear-history-btn"
          onClick={handleClearAll}
          className="flex items-center gap-1.5 text-xs text-destructive/70 hover:text-destructive transition-colors font-medium px-2 py-1 rounded-lg hover:bg-destructive/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Limpar tudo
        </button>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="group flex items-center gap-3 p-3 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-md hover:border-primary/30 transition-all duration-200"
          >
            {/* Thumbnail */}
            <div className="relative shrink-0 w-20 h-12 rounded-xl overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.thumbnail}
                alt={entry.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                {entry.isAudioOnly ? (
                  <Music className="w-2.5 h-2.5" />
                ) : (
                  <Film className="w-2.5 h-2.5" />
                )}
                {entry.formatLabel}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <a
                href={entry.webpage_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-semibold text-sm text-foreground hover:text-primary transition-colors truncate"
                title={entry.title}
              >
                {entry.title}
              </a>
              <p className="text-xs text-muted-foreground/70 truncate">
                {entry.uploader}
              </p>
              <p className="text-xs text-muted-foreground/50">
                {formatRelativeTime(entry.downloadedAt)}
              </p>
            </div>

            {/* Delete */}
            <button
              id={`delete-history-${entry.id}`}
              onClick={() => handleDelete(entry.id)}
              title="Remover do histórico"
              className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type Tab = "download" | "history";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("download");
  const [historyCount, setHistoryCount] = useState(0);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("mp4-720");
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: "idle",
  });
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Load history badge count on mount and whenever tab changes
  useEffect(() => {
    setHistoryCount(loadHistory().length);
  }, [activeTab]);

  // Reset transcript panel on new search
  useEffect(() => {
    setTranscriptOpen(false);
    setCopied(false);
    setHighlights([]);
    setAnalyzeError(null);
  }, [videoData]);

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

  const handleAnalyze = useCallback(async () => {
    if (!videoData?.transcriptSegments?.length) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setHighlights([]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: videoData.transcriptSegments,
          title: videoData.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao analisar com Gemini");
      setHighlights(data.highlights ?? []);
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setAnalyzing(false);
    }
  }, [videoData]);

  const handleDownload = useCallback(async () => {
    if (!videoData || !selectedFormat) return;

    const option = videoData.downloadOptions.find(
      (o) => o.id === selectedFormat
    );
    if (!option) return;

    setDownloadState({ status: "loading" });

    // Generate a unique job ID for this download session.
    // The progress route downloads the file and registers the path under this ID.
    // The download route then streams the already-downloaded file to the browser.
    const jobId = crypto.randomUUID();

    // Use SSE for progress tracking
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const progressUrl =
      `/api/progress?url=${encodeURIComponent(videoData.webpage_url)}` +
      `&format=${selectedFormat}&audio=${option.isAudioOnly}&jobId=${jobId}`;

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
                // Trigger browser download — server streams the already-downloaded file
                const a = document.createElement("a");
                a.href = `/api/download?jobId=${jobId}`;
                a.click();
                // ── Save to history ──
                const entry: HistoryEntry = {
                  id: crypto.randomUUID(),
                  videoId: videoData.id,
                  title: videoData.title,
                  thumbnail: videoData.thumbnail,
                  uploader: videoData.uploader,
                  webpage_url: videoData.webpage_url,
                  format: selectedFormat,
                  formatLabel: option.label,
                  isAudioOnly: option.isAudioOnly,
                  downloadedAt: new Date().toISOString(),
                };
                addHistoryEntry(entry);
                setHistoryCount(loadHistory().length);
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

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-xl">
          <button
            id="tab-download"
            onClick={() => setActiveTab("download")}
            className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === "download"
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Download className="w-4 h-4" />
            Baixar
          </button>
          <button
            id="tab-history"
            onClick={() => setActiveTab("history")}
            className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === "history"
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Clock className="w-4 h-4" />
            Histórico
            {historyCount > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold transition-colors ${
                  activeTab === "history"
                    ? "bg-white/20 text-white"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {historyCount > 99 ? "99+" : historyCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Tab: Download ── */}
        {activeTab === "download" && (
        <div className="space-y-3">
          {/* URL Input */}
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
        )}

        {activeTab === "download" && videoData && (
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

            {/* Transcript Card */}
            {videoData.transcript && (
              <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-xl overflow-hidden">
                <button
                  id="transcript-toggle-btn"
                  onClick={() => setTranscriptOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
                      Transcrição do Vídeo
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      id="copy-transcript-btn"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(videoData.transcript!);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          navigator.clipboard.writeText(videoData.transcript!);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all font-medium cursor-pointer"
                    >
                      {copied ? (
                        <><Check className="w-3.5 h-3.5" />Copiado!</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" />Copiar</>
                      )}
                    </span>
                    {transcriptOpen ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {transcriptOpen && (
                  <div className="px-5 pb-5 animate-in fade-in-0 slide-in-from-top-2 duration-200 space-y-4">
                    <pre className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto rounded-xl bg-background/50 border border-border/40 p-4 font-sans">
                      {videoData.transcript}
                    </pre>

                    {/* Gemini Analyze Button */}
                    {videoData.transcriptSegments?.length && (
                      <button
                        id="analyze-btn"
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-violet-500/25 transition-all hover:scale-[1.01] active:scale-[0.99]"
                      >
                        {analyzing ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Analisando com Gemini...</>
                        ) : (
                          <><Sparkles className="w-4 h-4" />Analisar Melhores Trechos com Gemini</>
                        )}
                      </button>
                    )}

                    {/* Analyze error */}
                    {analyzeError && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{analyzeError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Gemini Highlights Panel */}
            {highlights.length > 0 && (
              <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-violet-500/30 shadow-xl shadow-violet-500/10 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
                <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
                    Melhores Trechos — Análise Gemini
                  </span>
                </div>

                <div className="p-5 space-y-3">
                  {highlights.map((h, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-background/50 border border-border/40 hover:border-violet-500/40 transition-colors space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-sm text-foreground leading-tight">
                          {h.title}
                        </p>
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/20">
                          {h.start} → {h.end}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {h.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

        {/* ── Tab: History ── */}
        {activeTab === "history" && <HistoryPanel />}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 pb-6">
          Use apenas para conteúdo que você tem direito de baixar.
        </p>
      </div>
    </main>
  );
}
