"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Zap, Clock } from "lucide-react";

interface ProgressBarProps {
  progress: number;
  speed?: string;
  eta?: string;
  className?: string;
}

export function ProgressBar({ progress, speed, eta, className }: ProgressBarProps) {
  const isDone = progress >= 100;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span
          className={cn(
            "font-semibold tabular-nums transition-colors",
            isDone ? "text-green-500" : "text-primary"
          )}
        >
          {isDone ? "✓ Concluído!" : `${progress.toFixed(1)}%`}
        </span>
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          {speed && !isDone && (
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {speed}
            </span>
          )}
          {eta && eta !== "00:00" && !isDone && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ETA {eta}
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <Progress
          value={progress}
          className={cn(
            "h-3 transition-all",
            isDone ? "[&>div]:bg-green-500" : "[&>div]:bg-primary"
          )}
        />
        {!isDone && progress > 0 && (
          <div
            className="absolute inset-0 h-3 rounded-full overflow-hidden pointer-events-none"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        )}
      </div>
    </div>
  );
}
