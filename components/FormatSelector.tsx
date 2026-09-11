"use client";

import { DownloadOption } from "@/lib/ytdlp";
import { cn } from "@/lib/utils";
import { Film, Music, CheckCircle2 } from "lucide-react";

interface FormatSelectorProps {
  options: DownloadOption[];
  selected: string;
  onSelect: (id: string) => void;
}

export function FormatSelector({ options, selected, onSelect }: FormatSelectorProps) {
  const videoOptions = options.filter((o) => !o.isAudioOnly);
  const audioOptions = options.filter((o) => o.isAudioOnly);

  return (
    <div className="space-y-4">
      {videoOptions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Film className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Vídeo
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {videoOptions.map((option) => (
              <FormatButton
                key={option.id}
                option={option}
                isSelected={selected === option.id}
                onClick={() => onSelect(option.id)}
              />
            ))}
          </div>
        </div>
      )}

      {audioOptions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Music className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Áudio
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {audioOptions.map((option) => (
              <FormatButton
                key={option.id}
                option={option}
                isSelected={selected === option.id}
                onClick={() => onSelect(option.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FormatButton({
  option,
  isSelected,
  onClick,
}: {
  option: DownloadOption;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start p-3 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer",
        "hover:border-primary/60 hover:bg-primary/5 hover:scale-[1.02]",
        "focus:outline-none focus:ring-2 focus:ring-primary/50",
        isSelected
          ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
          : "border-border bg-card/50"
      )}
    >
      {isSelected && (
        <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-primary" />
      )}
      <span
        className={cn(
          "text-sm font-bold",
          isSelected ? "text-primary" : "text-foreground"
        )}
      >
        {option.format.toUpperCase()}
      </span>
      <span className="text-xs text-muted-foreground mt-0.5">
        {option.quality}
      </span>
    </button>
  );
}
