"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  isWholeHourBlock,
  scheduleToPeriodHours,
  type CoachSchedule,
  type CoachSlug,
  type DayBlocks,
  type SchedulePeriod,
} from "@/lib/bookingSchedule";
import { CoachSwitcher } from "@/app/admin/ui/CoachSwitcher";

export type EditableCoach = {
  slug: CoachSlug;
  label: string;
  role: string | null;
  bio: string;
  schedule: CoachSchedule;
  horizonMonths: number;
};

// Week rendered Monday-first, Sunday last.
const WEEK: { dow: number; label: string }[] = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

// A period with a stable client id for React keys.
type UiPeriod = { uid: string; start: string | null; end: string | null; days: DayBlocks };

function emptyDays(): DayBlocks {
  const d: DayBlocks = {};
  for (let i = 0; i <= 6; i++) d[String(i)] = [];
  return d;
}

function toUi(schedule: CoachSchedule): UiPeriod[] {
  return schedule.map((p) => {
    const days = emptyDays();
    for (let i = 0; i <= 6; i++) {
      days[String(i)] = (p.days[String(i)] ?? []).map((b) => ({ start: b.start, end: b.end }));
    }
    return { uid: crypto.randomUUID(), start: p.start, end: p.end, days };
  });
}

function fromUi(periods: UiPeriod[]): CoachSchedule {
  return periods.map(({ start, end, days }): SchedulePeriod => ({ start, end, days }));
}

function CoachCard({ initial }: { initial: EditableCoach }) {
  const [periods, setPeriods] = useState<UiPeriod[]>(() => toUi(initial.schedule));
  const [horizon, setHorizon] = useState(String(initial.horizonMonths));
  const [role, setRole] = useState(initial.role ?? "");
  const [bio, setBio] = useState(initial.bio);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Any invalid (non-whole-hour) block blocks saving.
  const hasErrors = useMemo(
    () =>
      periods.some((p) =>
        WEEK.some(({ dow }) => (p.days[String(dow)] ?? []).some((b) => !isWholeHourBlock(b)))
      ),
    [periods]
  );

  const preview = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return scheduleToPeriodHours(fromUi(periods), today);
  }, [periods]);

  // ── Mutators ──
  function patchPeriod(uid: string, fn: (p: UiPeriod) => UiPeriod) {
    setPeriods((prev) => prev.map((p) => (p.uid === uid ? fn(p) : p)));
  }
  function addPeriod() {
    setPeriods((prev) => [...prev, { uid: crypto.randomUUID(), start: null, end: null, days: emptyDays() }]);
  }
  function removePeriod(uid: string) {
    setPeriods((prev) => prev.filter((p) => p.uid !== uid));
  }
  function setPeriodDate(uid: string, which: "start" | "end", value: string) {
    patchPeriod(uid, (p) => ({ ...p, [which]: value || null }));
  }
  function addBlock(uid: string, dow: number) {
    patchPeriod(uid, (p) => ({
      ...p,
      days: { ...p.days, [String(dow)]: [...(p.days[String(dow)] ?? []), { start: "08:00", end: "09:00" }] },
    }));
  }
  function removeBlock(uid: string, dow: number, idx: number) {
    patchPeriod(uid, (p) => ({
      ...p,
      days: { ...p.days, [String(dow)]: (p.days[String(dow)] ?? []).filter((_, i) => i !== idx) },
    }));
  }
  function setBlockTime(uid: string, dow: number, idx: number, which: "start" | "end", value: string) {
    patchPeriod(uid, (p) => ({
      ...p,
      days: {
        ...p.days,
        [String(dow)]: (p.days[String(dow)] ?? []).map((b, i) =>
          i === idx ? { ...b, [which]: value } : b
        ),
      },
    }));
  }

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/coaches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: initial.slug,
          bio,
          role,
          horizonMonths: Number(horizon),
          booking_schedule: fromUi(periods),
        }),
      });
      if (!res.ok) {
        setError((await res.text().catch(() => "")) || "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{initial.label}</h2>

      {/* Horizon */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <span className="font-semibold">Show booking</span>
        <input
          type="number"
          min={1}
          max={24}
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
        <span className="font-semibold">months in advance</span>
      </div>

      {/* Schedule periods */}
      <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Availability periods
      </div>
      <div className="space-y-4">
        {periods.map((p) => (
          <div key={p.uid} className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-4">
                <label className="text-xs font-semibold text-gray-500">
                  From
                  <input
                    type="date"
                    value={p.start ?? ""}
                    onChange={(e) => setPeriodDate(p.uid, "start", e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-200 px-2 py-1 text-sm font-normal text-gray-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-500">
                  Until
                  <input
                    type="date"
                    value={p.end ?? ""}
                    onChange={(e) => setPeriodDate(p.uid, "end", e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-200 px-2 py-1 text-sm font-normal text-gray-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <span className="self-center text-xs text-gray-400">Leave blank for open-ended</span>
              </div>
              {periods.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePeriod(p.uid)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-500 hover:border-red-300 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove period
                </button>
              )}
            </div>

            {/* Day grid */}
            <div className="divide-y divide-gray-100">
              {WEEK.map(({ dow, label }) => {
                const blocks = p.days[String(dow)] ?? [];
                return (
                  <div key={dow} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-2">
                    <span className="w-24 shrink-0 pt-1 text-sm font-semibold text-gray-800">{label}</span>
                    <div className="flex flex-1 flex-col gap-2">
                      {blocks.length === 0 && (
                        <span className="pt-1 text-xs italic text-gray-400">Off</span>
                      )}
                      {blocks.map((b, idx) => {
                        const invalid = !isWholeHourBlock(b);
                        return (
                          <div key={idx} className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              step={1800}
                              value={b.start}
                              onChange={(e) => setBlockTime(p.uid, dow, idx, "start", e.target.value)}
                              className={`rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-100 ${
                                invalid ? "border-red-300" : "border-gray-200 focus:border-emerald-400"
                              }`}
                            />
                            <span className="text-gray-400">–</span>
                            <input
                              type="time"
                              step={1800}
                              value={b.end}
                              onChange={(e) => setBlockTime(p.uid, dow, idx, "end", e.target.value)}
                              className={`rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-100 ${
                                invalid ? "border-red-300" : "border-gray-200 focus:border-emerald-400"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => removeBlock(p.uid, dow, idx)}
                              className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove time"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            {invalid && (
                              <span className="text-xs font-medium text-red-600">
                                Must be a whole number of hours
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addBlock(p.uid, dow)}
                        className="flex w-fit items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add time
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPeriod}
        className="mt-3 flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        <Plus className="h-4 w-4" /> Add schedule period
      </button>

      {/* Live preview */}
      <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <span className="font-semibold">Parents will see:</span>
        {preview.length === 0 ? (
          <span className="italic text-emerald-700"> No availability</span>
        ) : (
          <div className="mt-1 space-y-1">
            {preview.map((ph, i) => (
              <div key={i}>
                {ph.label && <span className="font-semibold">{ph.label}: </span>}
                {ph.lines.map((h, j) => (
                  <span key={j}>
                    {j > 0 && " · "}
                    <span className="font-semibold">{h.days}</span> {h.time}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role badge (optional) */}
      <div className="mb-4 mt-6">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Role badge <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Head Coach — leave blank for none"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {/* Bio */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Bio <span className="font-normal normal-case text-gray-400">(leave blank for no bio card)</span>
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={6}
          placeholder="A short bio shown on this coach's booking tab. One blank line between paragraphs."
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === "saving" || hasErrors}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {hasErrors && (
          <span className="text-sm font-medium text-red-600">Fix the highlighted times to save.</span>
        )}
        {status === "saved" && <span className="text-sm font-medium text-emerald-700">✓ Saved</span>}
        {status === "error" && error && <span className="text-sm font-medium text-red-600">{error}</span>}
      </div>
    </div>
  );
}

export function CoachProfilesClient({ initialCoaches }: { initialCoaches: EditableCoach[] }) {
  const [active, setActive] = useState<CoachSlug>(initialCoaches[0]?.slug ?? "david");

  return (
    <div>
      <CoachSwitcher
        items={initialCoaches.map((c) => ({ slug: c.slug, label: c.label }))}
        active={active}
        onChange={setActive}
      />

      {/* Every card stays mounted so unsaved edits survive switching coaches;
          only the selected one is shown. */}
      {initialCoaches.map((c) => (
        <div key={c.slug} className={c.slug === active ? "" : "hidden"}>
          <CoachCard initial={c} />
        </div>
      ))}
    </div>
  );
}
