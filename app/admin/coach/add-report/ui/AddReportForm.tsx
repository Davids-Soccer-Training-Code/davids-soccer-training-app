"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  BASELINE_FIELDS,
  PROGRESS_SKILLS,
  PROGRESS_SUMMARY_FIELDS,
  REPORT_LABEL,
  normalizeReportContentForSave,
  type ReportType,
} from "@/lib/coachingReports";

export type { ReportType };

const INPUT =
  "mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-400";
const LABEL = "text-xs font-semibold uppercase tracking-widest text-gray-400";

export function AddReportForm({
  playerId,
  playerName,
  initialType,
}: {
  playerId: string;
  playerName: string;
  initialType: ReportType;
}) {
  const router = useRouter();
  const [type, setType] = useState<ReportType>(initialType);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Kept flat and per-type, then normalized on save — same draft shape the
  // admin profile form uses.
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: string, value: unknown) =>
    setContent((prev) => ({ ...prev, [key]: value }));

  const setSkill = (skill: string, field: "rating" | "notes", value: string) =>
    setContent((prev) => ({
      ...prev,
      [skill]: { ...((prev[skill] as Record<string, unknown>) ?? {}), [field]: value },
    }));

  function switchType(next: ReportType) {
    setType(next);
    setContent({});
  }

  // Enough has been filled in to be worth saving.
  const hasContent =
    type === "blurb"
      ? String(content.text ?? "").trim().length > 0
      : Object.keys(content).length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !hasContent) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/players/${playerId}/coaching-reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim() || REPORT_LABEL[type],
          report_date: date,
          content: normalizeReportContentForSave(type, content),
        }),
      });
      if (!res.ok) {
        setError((await res.text()) || "Could not save the report.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-gray-900">
          {REPORT_LABEL[type]} saved for {playerName}.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          It&apos;s on their profile now, and the reminder will clear itself.
        </p>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setTitle("");
            setContent({});
          }}
          className="mt-4 rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700"
        >
          Write another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap gap-2">
        {(Object.keys(REPORT_LABEL) as ReportType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchType(t)}
            className={
              t === type
                ? "rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600"
            }
          >
            {REPORT_LABEL[t]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <label className="mt-5 block">
        <span className={LABEL}>Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={REPORT_LABEL[type]}
          className={INPUT}
        />
      </label>

      <label className="mt-4 block">
        <span className={LABEL}>Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={INPUT}
        />
      </label>

      {type === "blurb" && (
        <label className="mt-4 block">
          <span className={LABEL}>Note</span>
          <textarea
            value={String(content.text ?? "")}
            onChange={(e) => set("text", e.target.value)}
            rows={6}
            autoFocus
            placeholder="What happened, what to work on next…"
            className={INPUT}
          />
        </label>
      )}

      {type === "baseline" && (
        <div className="mt-4 space-y-3">
          {BASELINE_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs text-gray-500">{f.label}</span>
              <textarea
                value={String(content[f.key] ?? "")}
                onChange={(e) => set(f.key, e.target.value)}
                rows={f.rows}
                className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-emerald-400"
              />
            </label>
          ))}
        </div>
      )}

      {type === "progress" && (
        <div className="mt-4 space-y-3">
          {PROGRESS_SKILLS.map((s) => {
            const area = (content[s.key] as Record<string, string>) ?? {};
            return (
              <div key={s.key} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                <div className="mb-2 text-xs font-semibold text-gray-700">{s.label}</div>
                <div className="grid gap-2 sm:grid-cols-[110px_1fr]">
                  <select
                    value={area.rating ?? ""}
                    onChange={(e) => setSkill(s.key, "rating", e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none"
                  >
                    <option value="">— Rating —</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <input
                    value={area.notes ?? ""}
                    onChange={(e) => setSkill(s.key, "notes", e.target.value)}
                    placeholder="Coach notes…"
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none"
                  />
                </div>
              </div>
            );
          })}
          {PROGRESS_SUMMARY_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs text-gray-500">{f.label}</span>
              <textarea
                value={String(content[f.key] ?? "")}
                onChange={(e) => set(f.key, e.target.value)}
                rows={2}
                className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-emerald-400"
              />
            </label>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !hasContent}
        className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Saving…" : `Save ${REPORT_LABEL[type]}`}
      </button>
    </form>
  );
}
