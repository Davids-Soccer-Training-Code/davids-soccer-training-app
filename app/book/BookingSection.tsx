"use client";

import { useState } from "react";
import BookingCalendar from "./BookingCalendar";

type Coach = "all" | "david" | "simon";

const TOGGLE: { value: Coach; label: string }[] = [
  { value: "all", label: "All" },
  { value: "david", label: "Coach David" },
  { value: "simon", label: "Coach Simon" },
];

export default function BookingSection({ isAdmin = false }: { isAdmin?: boolean }) {
  const [coach, setCoach] = useState<Coach>("all");
  const isSimon = coach === "simon";
  const isAll = coach === "all";

  return (
    <div>
      {/* Coach switcher */}
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Book with
        </div>
        <div className="mt-2 inline-flex rounded-2xl border border-emerald-200 bg-white p-1 shadow-sm">
          {TOGGLE.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setCoach(t.value)}
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

      {/* "All" view legend — explains the blue Coach Simon slots */}
      {isAll && (
        <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="font-semibold">Showing all coaches.</span> Slots in{" "}
          <span className="font-semibold text-sky-700">blue, marked “(Coach Simon)”</span>{" "}
          are with Coach Simon — everything else is with Coach David.{" "}
          <button
            type="button"
            onClick={() => setCoach("simon")}
            className="font-semibold text-sky-700 underline hover:text-sky-900"
          >
            Switch to his tab above to learn more about Coach Simon.
          </button>
        </div>
      )}

      {/* Heads-up that you're not booking David — Simon view only */}
      {isSimon && (
        <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="font-semibold">Heads up:</span> these sessions are with{" "}
          <span className="font-semibold">Coach Simon</span> — not Coach David.
        </div>
      )}

      {/* Meet Coach Simon — Simon view only */}
      {isSimon && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Meet Coach Simon</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
              <p>
                Coach Simon is a soccer coach from{" "}
                <span className="font-semibold text-gray-900">Africa</span> who played
                his way to the{" "}
                <span className="font-semibold text-gray-900">semi-pro</span> level
                before moving to America to coach.
              </p>
              <p>
                He holds coaching licenses from{" "}
                <span className="font-semibold text-gray-900">South Africa</span>, the{" "}
                <span className="font-semibold text-gray-900">USA</span>, and{" "}
                <span className="font-semibold text-gray-900">Brazil</span>, bringing a
                global perspective to player development.
              </p>
              <p>
                For the past{" "}
                <span className="font-semibold text-gray-900">3 months</span> he&apos;s
                been working directly with Coach David, learning his technical coaching
                expertise so every session stays true to the David&apos;s Soccer Training
                standard.
              </p>
          </div>
        </div>
      )}

      {/* 24-hour notice — names the selected coach */}
      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Important:</span> If you book less than 24 hours
        in advance, there&apos;s a chance{" "}
        {isAll ? "your coach" : isSimon ? "Coach Simon" : "Coach David"} won&apos;t see
        your request in time. Please text or call Coach David directly to confirm the
        session.
      </div>

      <div className="mb-8">
        <p className="text-sm text-gray-600 max-w-xl">
          Pick an open slot below and fill in your details. Your request will be held and
          we&apos;ll text you to confirm within 24 hours.
        </p>

        <div className="mt-4 flex flex-wrap gap-4">
          {/* Coach David's hours — shown for All and David views */}
          {!isSimon && (
            <>
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm">
                {isAll && <span className="mr-2 font-semibold text-emerald-700">Coach David</span>}
                <span className="font-semibold text-gray-800">Mon – Fri</span>
                <span className="ml-2 text-gray-600">8:00 – 11:00 AM &amp; 5:00 – 8:00 PM</span>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm">
                <span className="font-semibold text-gray-800">Saturday</span>
                <span className="ml-2 text-gray-600">5:00 – 8:00 PM</span>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm">
                <span className="font-semibold text-gray-800">Sunday</span>
                <span className="ml-2 text-gray-600">8:00 AM – 11:00 AM</span>
              </div>
            </>
          )}

          {/* Coach Simon's hours — shown for All and Simon views (blue in All) */}
          {(isSimon || isAll) && (
            <>
              <div
                className={
                  isAll
                    ? "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm"
                    : "rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm"
                }
              >
                {isAll && <span className="mr-2 font-semibold text-sky-700">Coach Simon</span>}
                <span className="font-semibold text-gray-800">Tue – Fri</span>
                <span className="ml-2 text-gray-600">8:00 AM – 11:00 AM</span>
              </div>
              <div
                className={
                  isAll
                    ? "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm"
                    : "rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm"
                }
              >
                <span className="font-semibold text-gray-800">Tuesday evening</span>
                <span className="ml-2 text-gray-600">5:00 – 8:00 PM</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Re-mount the calendar when the coach changes so its slots/fetch reset */}
      <BookingCalendar key={coach} isAdmin={isAdmin} coach={coach} />
    </div>
  );
}
