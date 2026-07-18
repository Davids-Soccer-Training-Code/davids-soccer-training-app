"use client";

import { useState } from "react";
import { fmtTime12, type CoachSlug } from "@/lib/bookingSchedule";
import { COACH_ACCENT } from "@/lib/coachTheme";

export type CoachSession = {
  date: string; // YYYY-MM-DD (Arizona)
  start: string; // HH:MM
  end: string; // HH:MM
  parentName: string | null;
  playerName: string | null;
  title: string | null;
  location: string | null;
  status: string | null;
  kind: "regular" | "first";
};

type CoachTab = { slug: CoachSlug; label: string; sessions: CoachSession[] };

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function SessionCard({ s }: { s: CoachSession }) {
  const who = s.playerName || s.parentName || s.title || "Session";
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">{fmtDate(s.date)}</div>
          <div className="text-lg font-bold tracking-tight text-emerald-700">
            {fmtTime12(s.start)} – {fmtTime12(s.end)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.kind === "first" && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              First session
            </span>
          )}
          {s.status && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">
              {s.status}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 text-sm text-gray-800">
        <span className="font-semibold">{who}</span>
        {s.playerName && s.parentName && (
          <span className="text-gray-500"> · parent {s.parentName}</span>
        )}
      </div>
      {s.title && who !== s.title && (
        <div className="mt-0.5 text-sm text-gray-600">{s.title}</div>
      )}
      {s.location && <div className="mt-1 text-xs text-gray-400">{s.location}</div>}
    </div>
  );
}

export function CoachSessionsClient({ coaches }: { coaches: CoachTab[] }) {
  const [active, setActive] = useState<CoachSlug>(coaches[0]?.slug ?? "david");
  const current = coaches.find((c) => c.slug === active) ?? coaches[0];

  return (
    <div>
      {/* Coach tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {coaches.map((c) => {
          const isActive = c.slug === active;
          const accent = COACH_ACCENT[c.slug];
          const activeClass = accent
            ? `${accent.publicBtnSelected}`
            : "rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow";
          const idleClass = "rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-emerald-300";
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => setActive(c.slug)}
              className={isActive ? activeClass : idleClass}
            >
              {c.label}
              <span
                className={
                  isActive
                    ? "ml-2 rounded-full bg-white/25 px-2 py-0.5 text-xs"
                    : "ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                }
              >
                {c.sessions.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected coach's upcoming sessions */}
      {current && current.sessions.length > 0 ? (
        <div className="space-y-3">
          {current.sessions.map((s, i) => (
            <SessionCard key={`${s.date}-${s.start}-${i}`} s={s} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
          No upcoming sessions for {current?.label ?? "this coach"}.
        </div>
      )}
    </div>
  );
}
