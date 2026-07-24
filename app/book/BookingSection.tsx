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

// One tab per coach, in display order.
const TOGGLE: { value: CoachSlug; label: string }[] = COACH_SLUGS.map((slug) => ({
  value: slug,
  label: COACH_LABELS[slug],
}));

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
  initialCoach = "david",
  coaches,
}: {
  isAdmin?: boolean;
  initialCoach?: CoachSelection;
  coaches: Record<CoachSlug, CoachProfile>;
}) {
  // "all" was retired; parseCoachParam never yields it, but coerce defensively.
  const startCoach: CoachSlug = initialCoach === "all" ? "david" : initialCoach;
  const [coach, setCoach] = useState<CoachSlug>(startCoach);

  const selectedLabel = COACH_LABELS[coach];
  const selectedAccent = COACH_ACCENT[coach] ?? null;

  // Giant title that names the selected coach.
  const titleColor = selectedAccent ? selectedAccent.tagText : "text-emerald-700";
  const selectedHasBio = Boolean((coaches[coach].bio ?? "").trim());

  // Schedules keyed by slug — handed to the calendar to generate slots.
  const schedules = Object.fromEntries(
    COACH_SLUGS.map((slug) => [slug, coaches[slug].schedule])
  );

  const horizonMonths = coaches[coach].horizonMonths;
  const today = todayStr();
  const hourPeriods = scheduleToPeriodHours(coaches[coach].schedule, today);

  // Switch coaches and mirror the choice in the URL (?coach=…) so it stays
  // shareable and the address bar reflects the current tab.
  function selectCoach(value: CoachSlug) {
    setCoach(value);
    window.history.replaceState(null, "", `/book?coach=${value}`);
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
        {selectedLabel}
      </h2>

      {/* Meet Coach … — single-coach view with a bio */}
      {selectedHasBio && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <CoachBio label={selectedLabel} profile={coaches[coach]} />
        </div>
      )}

      {/* Where the coach trains — preferred location first */}
      {coaches[coach].locations.length > 0 && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            Where {selectedLabel} trains
          </h3>
          <ul className="mt-3 space-y-2.5">
            {[...coaches[coach].locations]
              .sort((a, b) => Number(b.preferred) - Number(a.preferred))
              .map((loc, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 leading-none text-emerald-600" aria-hidden>
                    📍
                  </span>
                  <div>
                    <span className="text-sm font-semibold text-gray-900">
                      {loc.city || loc.address}
                    </span>
                    {loc.preferred && (
                      <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Preferred
                      </span>
                    )}
                    {loc.address && loc.city && (
                      <div className="text-sm text-gray-600">{loc.address}</div>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* 24-hour notice — names the selected coach */}
      <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Important:</span>{" "}If you book less than 24 hours in
        advance, there&apos;s a chance {selectedLabel}{" "}won&apos;t see your request in time.
        Please text or call Coach David directly to confirm the session.
      </div>

      {/* Weather policy — sessions are cancelled in unsafe conditions */}
      <div className="mb-6 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <span className="font-semibold">⛈️ Weather policy:</span>{" "}For everyone&apos;s safety, we
        cancel sessions when it&apos;s over 110°F, there&apos;s lightning within 10 miles, or
        heavy rain. If we have to cancel for weather, we&apos;ll reach out to reschedule.
      </div>

      <div className="mb-8">
        <p className="text-sm text-gray-600 max-w-xl">
          Pick an open slot below and fill in your details. Your request will be held and we&apos;ll
          text you to confirm within 24 hours.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {hourPeriods.map((p, pi) => (
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
                    className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm"
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
