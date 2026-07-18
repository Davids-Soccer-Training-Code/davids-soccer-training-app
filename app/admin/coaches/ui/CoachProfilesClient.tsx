"use client";

import { useState } from "react";
import {
  BLOCK_ORDER,
  scheduleToHoursLines,
  type Block,
  type CoachSchedule,
  type CoachSlug,
} from "@/lib/bookingSchedule";

export type EditableCoach = {
  slug: CoachSlug;
  label: string;
  role: string | null;
  bio: string;
  schedule: CoachSchedule;
};

// Week rendered Monday-first, Sunday last, to match how the hours read.
const WEEK: { dow: number; label: string }[] = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

const BLOCK_LABEL: Record<Block, string> = {
  morning: "Morning · 8–11 AM",
  evening: "Evening · 5–8 PM",
};

function hasBlock(schedule: CoachSchedule, dow: number, block: Block): boolean {
  return (schedule[String(dow)] ?? []).includes(block);
}

function toggleBlock(schedule: CoachSchedule, dow: number, block: Block): CoachSchedule {
  const current = schedule[String(dow)] ?? [];
  const next = current.includes(block)
    ? current.filter((b) => b !== block)
    : BLOCK_ORDER.filter((b) => b === block || current.includes(b));
  return { ...schedule, [String(dow)]: next };
}

function CoachCard({ initial }: { initial: EditableCoach }) {
  const [schedule, setSchedule] = useState<CoachSchedule>(initial.schedule);
  const [bio, setBio] = useState(initial.bio);
  const [role, setRole] = useState(initial.role ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const hoursPreview = scheduleToHoursLines(schedule);

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/coaches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: initial.slug, bio, role, booking_schedule: schedule }),
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
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{initial.label}</h2>
      </div>

      {/* Availability grid */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Availability
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          {WEEK.map(({ dow, label }, i) => (
            <div
              key={dow}
              className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 ${
                i % 2 ? "bg-gray-50/60" : "bg-white"
              }`}
            >
              <span className="w-24 shrink-0 text-sm font-semibold text-gray-800">{label}</span>
              {BLOCK_ORDER.map((block) => (
                <label
                  key={block}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={hasBlock(schedule, dow, block)}
                    onChange={() => setSchedule((s) => toggleBlock(s, dow, block))}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  {BLOCK_LABEL[block]}
                </label>
              ))}
            </div>
          ))}
        </div>
        {/* Live preview of the hours parents will see */}
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <span className="font-semibold">Parents will see: </span>
          {hoursPreview.length === 0 ? (
            <span className="italic text-emerald-700">No availability</span>
          ) : (
            hoursPreview.map((h, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <span className="font-semibold">{h.days}</span> {h.time}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Role badge (optional) */}
      <div className="mb-4">
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
          disabled={status === "saving"}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {status === "saved" && (
          <span className="text-sm font-medium text-emerald-700">✓ Saved</span>
        )}
        {status === "error" && error && (
          <span className="text-sm font-medium text-red-600">{error}</span>
        )}
      </div>
    </div>
  );
}

export function CoachProfilesClient({ initialCoaches }: { initialCoaches: EditableCoach[] }) {
  return (
    <div className="space-y-6">
      {initialCoaches.map((c) => (
        <CoachCard key={c.slug} initial={c} />
      ))}
    </div>
  );
}
