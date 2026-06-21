"use client";

import { useEffect, useState } from "react";
import { Trophy, Check, X, PlayCircle } from "lucide-react";
import { RANK_TESTS, RANK_BY_KEY } from "@/lib/rankSystem";
import type { PlayerRankSummary, Mission } from "@/lib/getPlayerRank";
import { RankLadder, RankBadge } from "./RankLadder";

function ChecklistRow({
  ok,
  label,
  requirement,
  detail,
  progress,
  color,
}: {
  ok: boolean;
  label: string;
  requirement: string;
  detail?: string;
  progress: number;
  color: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          ok ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-500"
        }`}
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-900">{label}</div>
          <div className="shrink-0 text-xs font-semibold text-gray-500">
            {detail ?? `${pct}%`}
          </div>
        </div>
        <div className="text-xs text-gray-500">{requirement}</div>
        {/* how-close mini bar */}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

function MissionCard({ mission }: { mission: Mission }) {
  const rank = RANK_BY_KEY[mission.target_rank];
  const completed = mission.status === "completed";
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">
            {mission.title}
          </div>
          {mission.description ? (
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {mission.description}
            </p>
          ) : null}
        </div>
        <RankBadge name={rank.shortName} color={rank.color} size="sm" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            completed
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {completed ? <Check className="h-3.5 w-3.5" /> : null}
          {completed ? "Completed" : "In progress"}
        </span>
        {mission.video_url ? (
          <a
            href={mission.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <PlayCircle className="h-4 w-4" /> Watch
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerRank({
  playerId,
  isAdminMode,
}: {
  playerId: string;
  isAdminMode?: boolean;
}) {
  const [rank, setRank] = useState<PlayerRankSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const endpoint = isAdminMode
          ? `/api/admin/players/${playerId}/rank`
          : `/api/players/${playerId}/rank`;
        const res = await fetch(endpoint, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { rank: PlayerRankSummary };
          if (!cancelled) setRank(data.rank);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [playerId, isAdminMode]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-gray-600">
        Loading rank…
      </div>
    );
  }

  if (!rank) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-gray-600">
        No rank data yet.
      </div>
    );
  }

  const overallDef = RANK_BY_KEY[rank.overall.rank];
  const target = rank.next_checklist.targetRank
    ? RANK_BY_KEY[rank.next_checklist.targetRank]
    : null;
  const targetMissions = target
    ? rank.missions.filter((m) => m.target_rank === target.key)
    : [];

  return (
    <div className="space-y-6">
      {/* Overall rank */}
      <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <Trophy className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Current rank
              </div>
              <div className="text-lg font-bold text-gray-900">
                {overallDef.name}
              </div>
            </div>
          </div>
          <RankBadge name={overallDef.name} color={overallDef.color} size="lg" />
        </div>
        <div className="mt-4">
          <RankLadder currentIndex={rank.overall.index} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-gray-500">
          Black is the base rank everyone starts at. To rank up you must pass
          every test for the next rank, hit the session minimum, and complete
          that rank&apos;s coach mission.
        </p>
      </div>

      {/* Next-rank checklist */}
      {target ? (
        <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">
              How to reach {target.name}
            </h3>
            <RankBadge name={target.shortName} color={target.color} size="sm" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {rank.next_checklist.items.map((item) => (
              <ChecklistRow
                key={item.key}
                ok={item.ok}
                label={item.label}
                requirement={item.requirement}
                detail={item.detail}
                progress={item.progress}
                color={target.color}
              />
            ))}
          </div>
          {targetMissions.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-900">
                {target.shortName} missions
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {targetMissions.map((m) => (
                  <MissionCard key={m.id} mission={m} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-800">
          🏆 Master Rank reached — the top of the ladder. Incredible work!
        </div>
      )}

      {/* Per-test ranks */}
      <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">Rank by test</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Each test ranks up on its own. You can be ahead in one area even if
          your overall rank is lower.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {RANK_TESTS.map((t) => {
            const pt = rank.per_test[t];
            if (!pt) return null;
            return (
              <div
                key={t}
                className="rounded-xl border border-emerald-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{t}</div>
                  <RankBadge
                    name={RANK_BY_KEY[pt.rank].shortName}
                    color={pt.color}
                    size="sm"
                  />
                </div>
                <div className="mt-3">
                  <RankLadder currentIndex={pt.index} showLabels={false} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All missions */}
      {rank.missions.length > 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900">All coach missions</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {rank.missions
              .slice()
              .sort(
                (a, b) =>
                  RANK_BY_KEY[a.target_rank].index -
                  RANK_BY_KEY[b.target_rank].index
              )
              .map((m) => (
                <MissionCard key={m.id} mission={m} />
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
