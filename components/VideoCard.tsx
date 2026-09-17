"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Eye, ThumbsUp, User, Download } from "lucide-react";
import { formatDuration } from "@/lib/format-utils";

interface VideoCardProps {
  title: string;
  thumbnail: string;
  uploader: string;
  duration: number;
  view_count: number;
  like_count?: number;
  upload_date: string;
  description: string;
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUploadDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function VideoCard({
  title,
  thumbnail,
  uploader,
  duration,
  view_count,
  like_count,
  upload_date,
  description,
}: VideoCardProps) {
  return (
    <Card className="group overflow-hidden border-0 bg-card/60 backdrop-blur-xl shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="relative w-full aspect-video overflow-hidden">
        <Image
          src={thumbnail}
          alt={title}
          fill
          className="object-cover"
          unoptimized
        />
        {/* Download thumbnail button */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button
            size="sm"
            variant="secondary"
            className="bg-black/60 hover:bg-black/80 text-white border-0 backdrop-blur-sm gap-2 h-8"
            onClick={async (e) => {
              e.preventDefault();
              try {
                const res = await fetch(thumbnail);
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `thumbnail-${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
                a.click();
                window.URL.revokeObjectURL(url);
              } catch (err) {
                // Fallback to opening in new tab if CORS blocks the fetch
                window.open(thumbnail, "_blank");
              }
            }}
          >
            <Download className="w-4 h-4" />
            <span className="text-xs font-medium">Thumbnail</span>
          </Button>
        </div>
        {/* Duration badge */}
        <div className="absolute bottom-3 right-3 z-10">
          <Badge className="bg-black/80 text-white border-0 font-mono text-sm px-2 py-0.5 backdrop-blur-sm">
            <Clock className="w-3 h-3 mr-1" />
            {formatDuration(duration)}
          </Badge>
        </div>
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>

      <CardContent className="p-5 space-y-3">
        <h2 className="text-lg font-bold leading-snug line-clamp-2 text-foreground">
          {title}
        </h2>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-primary" />
            <span className="font-medium text-foreground">{uploader}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Eye className="w-4 h-4" />
            {formatViewCount(view_count)} visualizações
          </span>
          {like_count && (
            <span className="flex items-center gap-1.5">
              <ThumbsUp className="w-4 h-4" />
              {formatViewCount(like_count)} curtidas
            </span>
          )}
          <span className="text-xs">{formatUploadDate(upload_date)}</span>
        </div>

        {description && (
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
