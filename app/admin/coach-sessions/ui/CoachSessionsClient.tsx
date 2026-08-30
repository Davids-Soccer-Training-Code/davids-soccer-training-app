"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtTime12, type CoachSlug } from "@/lib/bookingSchedule";
import { CoachSwitcher } from "@/app/admin/ui/CoachSwitcher";

// `crmId` is the CRM player the roster is keyed on; `appId` is the app account
// uuid, or null when the person has no app profile. The name links on `crmId`,
// so every player on the calendar is clickable — including one with no account.
export type PlayerRef = { appId: string | null; crmId: number; name: string };

export type CoachSession = {
  date: string; // YYYY-MM-DD (Arizona)
  start: string; // HH:MM
  end: string; // HH:MM
  parentAppId: string | null;
  parentName: string | null;
  players: PlayerRef[];
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

function SessionCard({ s, coach }: { s: CoachSession; coach: CoachSlug }) {
  const hasPlayers = s.players.length > 0;
  // The card's title text (used to avoid repeating the title line below).
  const who = s.players.map((p) => p.name).join(", ") || s.parentName || s.title || "Session";
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
        {hasPlayers ? (
          <>
            {s.players.map((pl, idx) => (
              <span key={`${pl.crmId}-${idx}`}>
                {idx > 0 && <span className="text-gray-400">, </span>}
                <Link
                  href={`/admin/coach-players?coach=${coach}&player=${pl.crmId}`}
                  className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
                >
                  {pl.name}
                </Link>
              </span>
            ))}
            {s.parentName && (
              <span className="text-gray-500">
                {" · parent "}
                {s.parentAppId ? (
                  <Link
                    href={`/admin/parent/${s.parentAppId}`}
                    className="text-gray-600 underline-offset-2 hover:text-emerald-700 hover:underline"
                  >
                    {s.parentName}
                  </Link>
                ) : (
                  <span className="text-gray-600">{s.parentName}</span>
                )}
              </span>
            )}
          </>
        ) : s.parentName ? (
          s.parentAppId ? (
            <Link
              href={`/admin/parent/${s.parentAppId}`}
              className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
            >
              {s.parentName}
            </Link>
          ) : (
            <span className="font-semibold text-gray-900">{s.parentName}</span>
          )
        ) : (
          <span className="font-semibold">{who}</span>
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
      <CoachSwitcher
        items={coaches.map((c) => ({ slug: c.slug, label: c.label, count: c.sessions.length }))}
        active={active}
        onChange={setActive}
      />

      {/* Selected coach's upcoming sessions */}
      {current && current.sessions.length > 0 ? (
        <div className="space-y-3">
          {current.sessions.map((s, i) => (
            <SessionCard key={`${s.date}-${s.start}-${i}`} s={s} coach={active} />
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
