"use client";

import { Check } from "lucide-react";
import { RANK_TESTS, RANK_BY_KEY, rankLabel } from "@/lib/rankSystem";
import type { PlayerRankSummary } from "@/lib/getPlayerRank";
import { RankBadge } from "./RankLadder";

// Dashboard summary of the rank picture: the level each test sits at, and
// which ones are still short of the next level. Callers wrap it in whatever
// takes the player to the full Rank Up tab (a Link on the dashboard page, a
// tab button in the preview), so this only renders the contents.
export function RankBreakdown({ rank }: { rank: PlayerRankSummary }) {
  const target = rank.next_checklist.targetRank
    ? RANK_BY_KEY[rank.next_checklist.targetRank]
    : null;
  const okByTest = new Map(
    rank.next_checklist.items
      .filter((i) => i.kind === "test")
      .map((i) => [i.key, i.ok] as const)
  );
  const ready = [...okByTest.values()].filter(Boolean).length;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Levels by test
          </div>
          <div className="text-sm text-gray-600">
            {target ? (
              <>
                {ready}/{RANK_TESTS.length} tests ready for{" "}
                <span className="font-semibold text-gray-900">
                  {rankLabel(target)}
                </span>
              </>
            ) : (
              <>Every test is maxed out — Level 7 across the board 🏆</>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {RANK_TESTS.map((t) => {
          const pt = rank.per_test[t];
          if (!pt) return null;
          const ok = okByTest.get(t) === true;
          return (
            <div
              key={t}
              className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-gray-900">
                  {t}
                </div>
                {target ? (
                  <div className="text-[10px] text-gray-400">
                    {ok ? "ready to rank up" : `needs ${rankLabel(target)}`}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {ok ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-2.5 w-2.5 text-emerald-700" />
                  </span>
                ) : null}
                <RankBadge name={rankLabel(pt.rank)} color={pt.color} size="sm" />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
