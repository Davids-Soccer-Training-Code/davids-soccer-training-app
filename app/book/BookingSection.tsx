"use client";

import { useState } from "react";
import BookingCalendar from "./BookingCalendar";
import {
  COACH_LABELS,
  COACH_SLUGS,
  scheduleToPeriodHours,
  type CoachProfile,
  type CoachSelection,
  type CoachSlug,
} from "@/lib/bookingSchedule";
import { COACH_ACCENT } from "@/lib/coachTheme";

// Local YYYY-MM-DD for "today" (used to hide fully-past schedule periods).
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Toggle order: "All" first, then each coach in display order.
const TOGGLE: { value: CoachSelection; label: string }[] = [
  { value: "all", label: "All" },
  ...COACH_SLUGS.map((slug) => ({ value: slug, label: COACH_LABELS[slug] })),
];

// Render a coach's bio (crm_staff.description) — newline-separated paragraphs.
function CoachBio({ label, profile }: { label: string; profile: CoachProfile }) {
  const paragraphs = (profile.bio ?? "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const accentText = COACH_ACCENT[profile.slug]?.tagText ?? "text-emerald-700";
  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900">Meet {label}</h2>
      {profile.role && (
        <p className={`mt-1 text-xs font-semibold uppercase tracking-widest ${accentText}`}>
          {profile.role}
        </p>
      )}
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </>
  );
}

export default function BookingSection({
  isAdmin = false,
  initialCoach = "all",
  coaches,
}: {
  isAdmin?: boolean;
  initialCoach?: CoachSelection;
  coaches: Record<CoachSlug, CoachProfile>;
}) {
  const [coach, setCoach] = useState<CoachSelection>(initialCoach);
  const isAll = coach === "all";
  // The single selected coach (or null in the "All" view), and its accent —
  // only non-David coaches have one.
  const selected = isAll ? null : coach;
  const selectedLabel = selected ? COACH_LABELS[selected] : null;
  const selectedAccent = selected ? COACH_ACCENT[selected] ?? null : null;

  // Coaches whose slots get an accent color in the "All" view (everyone but David).
  const accentCoaches = COACH_SLUGS.filter((slug) => COACH_ACCENT[slug]);

  // Which coaches' hours to show, in order.
  const visibleCoaches: CoachSlug[] = isAll ? [...COACH_SLUGS] : [coach as CoachSlug];

  // Giant title that makes the selected coach unmistakable.
  const titleText = isAll ? "All Coaches" : selectedLabel;
  const titleColor = selectedAccent ? selectedAccent.tagText : "text-emerald-700";

  const selectedHasBio = selected ? Boolean((coaches[selected].bio ?? "").trim()) : false;

  // Schedules keyed by slug — handed to the calendar to generate slots.
  const schedules = Object.fromEntries(
    COACH_SLUGS.map((slug) => [slug, coaches[slug].schedule])
  );

  // How far ahead the calendar shows: this coach's horizon, or the widest in
  // the "All" view.
  const horizonMonths = isAll
    ? Math.max(...COACH_SLUGS.map((s) => coaches[s].horizonMonths))
    : coaches[coach as CoachSlug].horizonMonths;

  const today = todayStr();

  // Switch coaches and mirror the choice in the URL (?coach=…) so it stays
  // shareable and the address bar reflects the current tab.
  function selectCoach(value: CoachSelection) {
    setCoach(value);
    const url = value === "all" ? "/book" : `/book?coach=${value}`;
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      {/* Coach switcher */}
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Book with
        </div>
        <div className="mt-2 inline-flex flex-wrap rounded-2xl border border-emerald-200 bg-white p-1 shadow-sm">
          {TOGGLE.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => selectCoach(t.value)}
              className={
                coach === t.value
                  ? "rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow"
                  : "rounded-xl px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Giant title — makes the selected coach unmistakable */}
      <h2 className={`mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl ${titleColor}`}>
        {titleText}
      </h2>

      {/* "All" view legend — explains each coach's colored slots */}
      {isAll && (
        <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <span className="font-semibold text-gray-900">Showing all coaches.</span> Slots marked{" "}
          {accentCoaches.map((slug, i) => (
            <span key={slug}>
              <span className={`font-semibold ${COACH_ACCENT[slug].tagText}`}>
                {COACH_ACCENT[slug].tag}
              </span>
              {i < accentCoaches.length - 1 ? " and " : ""}
            </span>
          ))}{" "}
          are with that coach — everything else is with Coach David. Pick a coach&apos;s tab above
          to learn more about them.
        </div>
      )}

      {/* Meet Coach … — single-coach view with a bio */}
      {selected && selectedHasBio && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <CoachBio label={selectedLabel ?? ""} profile={coaches[selected]} />
        </div>
      )}

      {/* 24-hour notice — names the selected coach */}
      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Important:</span>{" "}If you book less than 24 hours in
        advance, there&apos;s a chance {selectedLabel ?? "your coach"}{" "}won&apos;t see your
        request in time. Please text or call Coach David directly to confirm the session.
      </div>

      <div className="mb-8">
        <p className="text-sm text-gray-600 max-w-xl">
          Pick an open slot below and fill in your details. Your request will be held and we&apos;ll
          text you to confirm within 24 hours.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {visibleCoaches.map((slug) => {
            // Each coach's slots are accented only in the "All" view.
            const accent = isAll && COACH_ACCENT[slug] ? COACH_ACCENT[slug] : null;
            const periods = scheduleToPeriodHours(coaches[slug].schedule, today);
            if (periods.length === 0) return null;
            return (
              <div key={slug}>
                {isAll && (
                  <div
                    className={
                      accent ? `mb-1 text-sm font-semibold ${accent.tagText}` : "mb-1 text-sm font-semibold text-emerald-700"
                    }
                  >
                    {COACH_LABELS[slug]}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {periods.map((p, pi) => (
                    <div key={pi}>
                      {p.label && (
                        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
                          {p.label}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {p.lines.map((h, i) => (
                          <div
                            key={i}
                            className={
                              accent
                                ? accent.hoursCard
                                : "rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm"
                            }
                          >
                            <span className="font-semibold text-gray-800">{h.days}</span>
                            <span className="ml-2 text-gray-600">{h.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Re-mount the calendar when the coach changes so its slots/fetch reset */}
      <BookingCalendar
        key={coach}
        isAdmin={isAdmin}
        coach={coach}
        schedules={schedules}
        horizonMonths={horizonMonths}
      />
    </div>
  );
}
