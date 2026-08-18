"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

type Field = { key: string; label: string; type: "number" | "text" };
type Definition = { id: string; name: string; isRankTest: boolean; fields: Field[] };

// Saving a test stores the raw numbers; the derived stats on the player's
// profile only move when a new snapshot is computed. Tracking "saved but not
// recomputed" is what lets us stop a coach walking away half-done.
export function AddTestsForm({
  playerId,
  playerName,
  definitions,
}: {
  playerId: string;
  playerName: string;
  definitions: Definition[];
}) {
  const [testName, setTestName] = useState(definitions[0]?.name ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<Record<string, string>>({});
  const [savedTests, setSavedTests] = useState<string[]>([]);
  const [needsRecompute, setNeedsRecompute] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const def = definitions.find((d) => d.name === testName) ?? definitions[0];

  // Catches tab close and hard navigation. In-app links are handled by the
  // banner and the guard on the buttons below.
  useEffect(() => {
    if (!needsRecompute) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [needsRecompute]);

  const saveTest = useCallback(async () => {
    if (busy || !def) return;
    const filled = Object.entries(scores).filter(([, v]) => v !== "");
    if (filled.length === 0) {
      setError("Enter at least one score before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/players/${playerId}/tests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          test_name: def.name,
          test_date: date,
          scores: Object.fromEntries(filled),
        }),
      });
      if (!res.ok) {
        setError((await res.text()) || "Could not save that test.");
        return;
      }
      setSavedTests((s) => [...s, def.name]);
      setNeedsRecompute(true);
      setScores({});
      setNote(`${def.name} saved. Add another, or recompute when you're done.`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, def, date, playerId, scores]);

  const recompute = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/players/${playerId}/profiles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Recompute ${new Date().toLocaleString()}` }),
      });
      if (!res.ok) {
        setError((await res.text()) || "Could not recompute stats.");
        return;
      }
      setNeedsRecompute(false);
      setNote("Stats recomputed — the profile is up to date.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, playerId]);

  function leave(href: string) {
    if (
      needsRecompute &&
      !window.confirm(
        "You've saved tests but haven't recomputed stats, so they won't show on the profile yet. Leave anyway?"
      )
    ) {
      return;
    }
    window.location.href = href;
  }

  return (
    <div className="space-y-5">
      {needsRecompute && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {savedTests.length} test{savedTests.length === 1 ? "" : "s"} saved for{" "}
            {playerName}, but the profile stats haven&apos;t been recomputed yet.
          </span>
        </div>
      )}

      <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Test
          </span>
          <select
            value={testName}
            onChange={(e) => {
              setTestName(e.target.value);
              setScores({});
            }}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-400"
          >
            {definitions.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
                {d.isRankTest ? " (rank test)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-400"
          />
        </label>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {def?.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-medium text-gray-600">{f.label}</span>
              <input
                type={f.type === "number" ? "number" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                value={scores[f.key] ?? ""}
                onChange={(e) =>
                  setScores((s) => ({ ...s, [f.key]: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-emerald-400"
              />
            </label>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {note && !error && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {note}
          </div>
        )}

        <button
          type="button"
          onClick={saveTest}
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Working…" : "Save test"}
        </button>
      </div>

      {savedTests.length > 0 && (
        <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Saved this session</div>
          <ul className="mt-2 space-y-1">
            {savedTests.map((t, i) => (
              <li key={`${t}-${i}`} className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-gray-900">Recompute stats</div>
        <p className="mt-1 text-sm text-gray-600">
          Derived stats and rank only move once a new snapshot is computed from the
          saved tests.
        </p>
        <button
          type="button"
          onClick={recompute}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Working…" : "Recompute stats"}
        </button>
        <button
          type="button"
          onClick={() => leave("/admin/reminders")}
          className="mt-3 w-full rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700"
        >
          Done — back to reminders
        </button>
      </div>
    </div>
  );
}
