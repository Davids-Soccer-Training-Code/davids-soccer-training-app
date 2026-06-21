"use client";

import { RANKS } from "@/lib/rankSystem";

// A horizontal Black → Master ladder. Segments up to (and including) the
// achieved rank are filled with their rank color; the rest are greyed out.
export function RankLadder({
  currentIndex,
  showLabels = true,
}: {
  currentIndex: number;
  showLabels?: boolean;
}) {
  return (
    <div className="w-full">
      <div className="flex w-full items-center gap-1">
        {RANKS.map((r) => {
          const earned = r.index <= currentIndex;
          const isCurrent = r.index === currentIndex;
          return (
            <div
              key={r.key}
              className="h-3 flex-1 rounded-full transition-colors"
              title={r.name}
              style={{
                backgroundColor: earned ? r.color : "#e5e7eb",
                boxShadow: isCurrent ? `0 0 0 2px #fff, 0 0 0 4px ${r.color}` : "none",
              }}
            />
          );
        })}
      </div>
      {showLabels ? (
        <div className="mt-1.5 flex w-full items-center gap-1">
          {RANKS.map((r) => {
            const isCurrent = r.index === currentIndex;
            return (
              <div
                key={r.key}
                className={`flex-1 truncate text-center text-[10px] ${
                  isCurrent ? "font-bold text-gray-900" : "text-gray-400"
                }`}
              >
                {r.shortName}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function RankBadge({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const pad =
    size === "lg"
      ? "px-4 py-2 text-base"
      : size === "sm"
      ? "px-2.5 py-1 text-xs"
      : "px-3 py-1.5 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-bold text-white ${pad}`}
      style={{ backgroundColor: color }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full bg-white/80"
        aria-hidden
      />
      {name}
    </span>
  );
}
