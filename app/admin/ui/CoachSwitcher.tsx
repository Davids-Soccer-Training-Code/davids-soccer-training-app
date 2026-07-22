"use client";

import type { CoachSlug } from "@/lib/bookingSchedule";

// A single, polished coach toggle shared by the admin coach pages (Coach
// Profiles and Coach Sessions) so they can never drift. A segmented pill
// control, mirroring the public booking switcher, with an optional count badge.

export type CoachSwitcherItem = { slug: CoachSlug; label: string; count?: number };

// Full class strings per coach (never concatenated) so Tailwind's scanner keeps
// every utility. The active pill uses each coach's brand color; David and any
// coach without a dedicated accent fall back to the app's emerald.
const ACTIVE_PILL: Record<string, string> = {
  david: "rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow",
  simon: "rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow",
  simpson: "rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow",
  girish: "rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow",
};
const ACTIVE_PILL_FALLBACK =
  "rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow";
const IDLE_PILL =
  "rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50";

export function CoachSwitcher({
  items,
  active,
  onChange,
  label = "Coach",
}: {
  items: CoachSwitcherItem[];
  active: CoachSlug;
  onChange: (slug: CoachSlug) => void;
  label?: string;
}) {
  return (
    <div className="mb-6">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="mt-2 inline-flex flex-wrap gap-1 rounded-2xl border border-emerald-200 bg-white p-1 shadow-sm">
        {items.map((it) => {
          const isActive = it.slug === active;
          return (
            <button
              key={it.slug}
              type="button"
              onClick={() => onChange(it.slug)}
              aria-pressed={isActive}
              className={isActive ? ACTIVE_PILL[it.slug] ?? ACTIVE_PILL_FALLBACK : IDLE_PILL}
            >
              {it.label}
              {typeof it.count === "number" && (
                <span
                  className={
                    isActive
                      ? "ml-2 rounded-full bg-white/25 px-2 py-0.5 text-xs"
                      : "ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                  }
                >
                  {it.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
