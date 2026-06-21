"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EARNED_RANKS,
  RANK_TESTS,
  RANK_BY_KEY,
  type RankKey,
} from "@/lib/rankSystem";
import type { Mission, PlayerRankSummary } from "@/lib/getPlayerRank";
import { RankLadder, RankBadge } from "@/app/player/[playerId]/ui/RankLadder";

async function api<T>(
  path: string,
  opts: RequestInit & { securityCode?: string },
): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.securityCode ? { "x-security-code": opts.securityCode } : {}),
      ...(opts.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

const inputClass =
  "w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50";

export function AdminRankMissions({
  playerId,
  securityCode,
}: {
  playerId: string;
  securityCode: string;
}) {
  const [rank, setRank] = useState<PlayerRankSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-mission form
  const [targetRank, setTargetRank] = useState<RankKey>("green");
  const [testCategory, setTestCategory] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    try {
      const data = await api<{ rank: PlayerRankSummary }>(
        `/api/admin/players/${playerId}/rank`,
        { method: "GET", securityCode },
      );
      setRank(data.rank);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load rank.");
    } finally {
      setLoading(false);
    }
  }, [playerId, securityCode]);

  useEffect(() => {
    load();
  }, [load]);

  async function createMission() {
    if (!title.trim()) {
      setErr("Mission title is required.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/admin/players/${playerId}/missions`, {
        method: "POST",
        securityCode,
        body: JSON.stringify({
          target_rank: targetRank,
          test_category: testCategory || null,
          title: title.trim(),
          description: description.trim() || null,
          video_url: videoUrl.trim() || null,
          is_youtube: /youtube\.com|youtu\.be/.test(videoUrl),
        }),
      });
      setTitle("");
      setDescription("");
      setVideoUrl("");
      setTestCategory("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create mission.");
    } finally {
      setBusy(false);
    }
  }

  async function setMissionStatus(m: Mission, status: "assigned" | "completed") {
    setBusy(true);
    try {
      await api(`/api/admin/players/${playerId}/missions/${m.id}`, {
        method: "PATCH",
        securityCode,
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update mission.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMission(m: Mission) {
    if (!window.confirm(`Delete mission "${m.title}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/players/${playerId}/missions/${m.id}`, {
        method: "DELETE",
        securityCode,
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete mission.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Rank &amp; Missions
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Auto-computed from this player&apos;s test scores, sessions, and
            completed missions. Recompute stats to snapshot it.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300"
        >
          Refresh
        </button>
      </div>

      {err ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {err}
        </div>
      ) : null}

      {loading || !rank ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-gray-600">
          {loading ? "Loading rank…" : "No rank data."}
        </div>
      ) : (
        <>
          {/* Overall rank */}
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Overall rank
              </div>
              <RankBadge
                name={RANK_BY_KEY[rank.overall.rank].name}
                color={rank.overall.color}
                size="sm"
              />
            </div>
            <div className="mt-3">
              <RankLadder currentIndex={rank.overall.index} />
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Sessions on record: {rank.session_count}
            </div>
          </div>

          {/* Per-test ranks */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {RANK_TESTS.map((t) => {
              const pt = rank.per_test[t];
              if (!pt) return null;
              return (
                <div
                  key={t}
                  className="rounded-xl border border-emerald-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-gray-900">
                      {t}
                    </div>
                    <RankBadge
                      name={RANK_BY_KEY[pt.rank].shortName}
                      color={pt.color}
                      size="sm"
                    />
                  </div>
                  <div className="mt-2">
                    <RankLadder currentIndex={pt.index} showLabels={false} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Create mission */}
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold text-gray-900">
              Assign a coach mission
            </div>
            <div className="mt-3 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">
                    Target rank
                  </label>
                  <select
                    value={targetRank}
                    onChange={(e) => setTargetRank(e.target.value as RankKey)}
                    className={inputClass}
                  >
                    {EARNED_RANKS.map((r) => (
                      <option key={r} value={r}>
                        {RANK_BY_KEY[r].name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">
                    Related test (optional)
                  </label>
                  <select
                    value={testCategory}
                    onChange={(e) => setTestCategory(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">— None —</option>
                    {RANK_TESTS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mission title (e.g. Win 5 1v1s this week)"
                className={inputClass}
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does the player need to do?"
                rows={3}
                className={`${inputClass} resize-y`}
              />
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Optional video URL"
                className={inputClass}
              />
              <button
                type="button"
                onClick={createMission}
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? "Saving…" : "Assign mission"}
              </button>
            </div>
          </div>

          {/* Mission list */}
          <div className="mt-5">
            <div className="text-xs font-semibold text-gray-900">
              Missions ({rank.missions.length})
            </div>
            {rank.missions.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">
                No missions assigned yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {rank.missions
                  .slice()
                  .sort(
                    (a, b) =>
                      RANK_BY_KEY[a.target_rank].index -
                      RANK_BY_KEY[b.target_rank].index,
                  )
                  .map((m) => {
                    const completed = m.status === "completed";
                    return (
                      <div
                        key={m.id}
                        className="rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">
                              {m.title}
                            </div>
                            {m.description ? (
                              <p className="mt-0.5 text-xs text-gray-500">
                                {m.description}
                              </p>
                            ) : null}
                            {m.test_category ? (
                              <div className="mt-1 text-[11px] font-medium text-gray-400">
                                {m.test_category}
                              </div>
                            ) : null}
                          </div>
                          <RankBadge
                            name={RANK_BY_KEY[m.target_rank].shortName}
                            color={RANK_BY_KEY[m.target_rank].color}
                            size="sm"
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              completed
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {completed ? "Completed" : "Assigned"}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setMissionStatus(
                                m,
                                completed ? "assigned" : "completed",
                              )
                            }
                            className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-60"
                          >
                            {completed ? "Reopen" : "Mark complete"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => deleteMission(m)}
                            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
