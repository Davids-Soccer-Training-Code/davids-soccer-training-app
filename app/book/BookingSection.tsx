"use client";

import { useState, type ReactNode } from "react";
import BookingCalendar from "./BookingCalendar";
import {
  COACH_LABELS,
  COACH_SLUGS,
  type CoachSelection,
  type CoachSlug,
} from "@/lib/bookingSchedule";
import { COACH_ACCENT } from "@/lib/coachTheme";

type HoursLine = { days: string; time: string };
type CoachMeta = { hours: HoursLine[]; bio?: ReactNode };

// Per-coach content for the booking page. Slots/validation live in
// lib/bookingSchedule.ts — this is just the human-facing copy.
const COACH_META: Record<CoachSlug, CoachMeta> = {
  david: {
    hours: [
      { days: "Mon – Fri", time: "8:00 – 11:00 AM & 5:00 – 8:00 PM" },
      { days: "Saturday", time: "5:00 – 8:00 PM" },
      { days: "Sunday", time: "8:00 AM – 11:00 AM" },
    ],
  },
  simon: {
    hours: [
      { days: "Mon – Fri", time: "8:00 – 11:00 AM" },
      { days: "Tue & Wed evenings", time: "5:00 – 8:00 PM" },
    ],
    bio: (
      <>
        <h2 className="text-lg font-semibold text-gray-900">Meet Coach Simon</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            Coach Simon is a soccer coach from{" "}
            <span className="font-semibold text-gray-900">Africa</span> who played his way to
            the <span className="font-semibold text-gray-900">semi-pro</span> level before
            moving to America to coach.
          </p>
          <p>
            He holds coaching licenses from{" "}
            <span className="font-semibold text-gray-900">South Africa</span>, the{" "}
            <span className="font-semibold text-gray-900">USA</span>, and{" "}
            <span className="font-semibold text-gray-900">Brazil</span>, bringing a global
            perspective to player development.
          </p>
          <p>
            For the past <span className="font-semibold text-gray-900">3 months</span>{" "}he&apos;s
            been working directly with Coach David, learning his technical coaching expertise so
            every session stays true to the David&apos;s Soccer Training standard.
          </p>
        </div>
      </>
    ),
  },
  marcanthony: {
    hours: [
      { days: "Mon – Sat", time: "8:00 – 11:00 AM" },
      { days: "Mon, Tue, Thu & Sat", time: "5:00 – 8:00 PM" },
    ],
    bio: (
      <>
        <h2 className="text-lg font-semibold text-gray-900">Meet Coach MarcAnthony</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-violet-700">
          Head Coach
        </p>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            Coach MarcAnthony is a lifelong soccer player with experience competing in both the{" "}
            <span className="font-semibold text-gray-900">United States</span> and{" "}
            <span className="font-semibold text-gray-900">Germany</span>.
          </p>
          <p>
            His passion is helping players build confidence, sharpen their technical abilities,
            and develop a deeper understanding of the game.
          </p>
          <p>
            MarcAnthony brings energy, positivity, and attention to detail to every session,
            creating an environment where players are challenged, encouraged, and inspired to
            reach their full potential.
          </p>
        </div>
      </>
    ),
  },
};

// Toggle order: "All" first, then each coach in display order.
const TOGGLE: { value: CoachSelection; label: string }[] = [
  { value: "all", label: "All" },
  ...COACH_SLUGS.map((slug) => ({ value: slug, label: COACH_LABELS[slug] })),
];

export default function BookingSection({
  isAdmin = false,
  initialCoach = "all",
}: {
  isAdmin?: boolean;
  initialCoach?: CoachSelection;
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
      {selected && COACH_META[selected].bio && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          {COACH_META[selected].bio}
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

        <div className="mt-4 flex flex-wrap gap-4">
          {visibleCoaches.flatMap((slug) => {
            // Each coach's slots are accented only in the "All" view.
            const accent = isAll && COACH_ACCENT[slug] ? COACH_ACCENT[slug] : null;
            return COACH_META[slug].hours.map((h, i) => (
              <div
                key={`${slug}-${i}`}
                className={
                  accent ? accent.hoursCard : "rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm"
                }
              >
                {isAll && i === 0 && (
                  <span className={accent ? accent.hoursCoachName : "mr-2 font-semibold text-emerald-700"}>
                    {COACH_LABELS[slug]}
                  </span>
                )}
                <span className="font-semibold text-gray-800">{h.days}</span>
                <span className="ml-2 text-gray-600">{h.time}</span>
              </div>
            ));
          })}
        </div>
      </div>

      {/* Re-mount the calendar when the coach changes so its slots/fetch reset */}
      <BookingCalendar key={coach} isAdmin={isAdmin} coach={coach} />
    </div>
  );
}
