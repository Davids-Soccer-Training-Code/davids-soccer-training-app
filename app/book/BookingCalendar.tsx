"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { getSlotsForCoachDow, type SlotDef } from "@/lib/bookingSchedule";

// ── Slot generation ────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// A slot the user can pick, tagged with which coach it belongs to. The same
// time can appear twice (once per coach) in the "all" view.
type CoachSlot = SlotDef & { coach: string };
type DaySlots = { date: string; label: string; slots: CoachSlot[] };

// "all" expands to both coaches (David first, then Simon); otherwise just the one.
function coachesFor(coach: string): string[] {
  return coach === "all" ? ["david", "simon"] : [coach];
}

function generateDays(coach: string, weeks = 6): DaySlots[] {
  const coaches = coachesFor(coach);
  const days: DaySlots[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const slots: CoachSlot[] = [];
    for (const c of coaches) {
      for (const s of getSlotsForCoachDow(c, d.getDay())) {
        slots.push({ ...s, coach: c });
      }
    }
    if (!slots.length) continue;
    days.push({
      date: toDateStr(d),
      label: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      slots,
    });
  }
  return days;
}

function fmt(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${ampm}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type BookedSlot = { date: string; start: string; end: string; coach: string };
type AdminBlocked = { id: string; date: string; start: string; coach: string };

// Times are "HH:MM" (24h). Two ranges overlap when each starts before the other
// ends. Used so an off-grid session (e.g. 6:30–7:30) blocks every slot it covers.
const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);
}
type FormState = { date: string; start: string; end: string; dateLabel: string; coach: string };

const COACH_LABEL: Record<string, string> = { david: "Coach David", simon: "Coach Simon" };

// ── Component ──────────────────────────────────────────────────────────────────

export default function BookingCalendar({
  isAdmin = false,
  coach = "david",
}: {
  isAdmin?: boolean;
  coach?: string;
}) {
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [adminBlocked, setAdminBlocked] = useState<AdminBlocked[]>([]);
  const [locallyBooked, setLocallyBooked] = useState<BookedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);

  const [form, setForm] = useState<FormState | null>(null);
  const [parentName, setParentName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin block state
  const [blocking, setBlocking] = useState<string | null>(null); // "date|start" being blocked
  const [unblocking, setUnblocking] = useState<string | null>(null); // id being unblocked

  useEffect(() => {
    fetch(`/api/booking-requests?coach=${encodeURIComponent(coach)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { bookedSlots: BookedSlot[]; adminBlocked?: AdminBlocked[] }) => {
        setBookedSlots(data.bookedSlots ?? []);
        setAdminBlocked(data.adminBlocked ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingSlots(false));
  }, [coach]);

  const allBooked = useMemo(() => [...bookedSlots, ...locallyBooked], [bookedSlots, locallyBooked]);

  const norm = (s: string) => s.slice(0, 5);

  function isBooked(date: string, start: string, end: string, slotCoach: string): boolean {
    return allBooked.some(
      (b) =>
        b.date === date &&
        b.coach === slotCoach &&
        rangesOverlap(start, end, b.start, b.end)
    );
  }

  function getAdminBlockId(date: string, start: string, slotCoach: string): string | null {
    return (
      adminBlocked.find(
        (b) => b.date === date && norm(b.start) === norm(start) && b.coach === slotCoach
      )?.id ?? null
    );
  }

  const isAll = coach === "all";
  const days = useMemo(() => generateDays(coach, 6), [coach]);

  // Annotate each (visible) day with a month/week header to render before it.
  // Weeks are real calendar weeks (Sunday-start), and months are separated
  // properly — so the day a slot belongs to is unmistakable.
  const rows = useMemo(() => {
    const visible = days.filter((day) =>
      day.slots.some(
        (s) =>
          isAdmin ||
          !allBooked.some(
            (b) =>
              b.date === day.date &&
              b.coach === s.coach &&
              rangesOverlap(s.start, s.end, b.start, b.end)
          )
      )
    );
    let lastMonth = "";
    let lastWeek = "";
    return visible.map((day) => {
      const d = new Date(day.date + "T12:00:00");
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const monthLabel = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

      const sunday = new Date(d);
      sunday.setDate(d.getDate() - d.getDay());
      const weekKey = toDateStr(sunday);
      const weekLabel = `Week of ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

      let newMonth: string | null = null;
      let newWeek: string | null = null;
      if (monthKey !== lastMonth) {
        newMonth = monthLabel;
        lastMonth = monthKey;
      }
      if (weekKey !== lastWeek) {
        newWeek = weekLabel;
        lastWeek = weekKey;
      }
      return { day, newMonth, newWeek };
    });
  }, [days, allBooked, isAdmin]);

  function openForm(date: string, start: string, end: string, dateLabel: string, slotCoach: string) {
    setForm({ date, start, end, dateLabel, coach: slotCoach });
    setSubmitted(false);
    setError(null);
    setTimeout(() => {
      document.getElementById("booking-form-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function handleAdminBlock(date: string, start: string, end: string, slotCoach: string) {
    const key = `${slotCoach}|${date}|${start}`;
    setBlocking(key);
    try {
      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ admin_block: true, slot_date: date, slot_start: start, slot_end: end, coach: slotCoach }),
      });
      if (res.ok) {
        const data = (await res.json()) as { blocked?: AdminBlocked };
        setLocallyBooked((prev) => [...prev, { date, start, end, coach: slotCoach }]);
        if (data.blocked) {
          setAdminBlocked((prev) => [...prev, data.blocked!]);
        }
      }
    } finally {
      setBlocking(null);
    }
  }

  async function handleAdminUnblock(id: string, date: string, start: string, slotCoach: string) {
    setUnblocking(id);
    try {
      const res = await fetch(`/api/admin/booking-requests/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        const sameSlot = (b: BookedSlot) =>
          b.date === date && norm(b.start) === norm(start) && b.coach === slotCoach;
        setAdminBlocked((prev) => prev.filter((b) => b.id !== id));
        setBookedSlots((prev) => prev.filter((b) => !sameSlot(b)));
        setLocallyBooked((prev) => prev.filter((b) => !sameSlot(b)));
      }
    } finally {
      setUnblocking(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parent_name: parentName,
          player_name: playerName,
          phone: phone || null,
          email: email || null,
          notes: notes || null,
          slot_date: form.date,
          slot_start: form.start,
          slot_end: form.end,
          coach: form.coach,
        }),
      });
      if (res.status === 409) { setError("That slot was just taken. Please pick another time."); setSubmitting(false); return; }
      if (!res.ok) { setError((await res.text().catch(() => "")) || "Something went wrong."); setSubmitting(false); return; }
      setLocallyBooked((prev) => [...prev, { date: form.date, start: form.start, end: form.end, coach: form.coach }]);
      setSubmitted(true);
      setParentName(""); setPlayerName(""); setPhone(""); setEmail(""); setNotes("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-10">
      {loadingSlots ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading available times…</div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ day, newMonth, newWeek }) => {
            const d = new Date(day.date + "T12:00:00");
            const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
            const dateLine = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

            return (
              <div key={day.date}>
                {newMonth && (
                  <h2 className="mb-3 mt-8 border-b-2 border-emerald-200 pb-2 text-lg font-bold tracking-tight text-emerald-800 first:mt-0">
                    {newMonth}
                  </h2>
                )}
                {newWeek && (
                  <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                    {newWeek}
                  </h3>
                )}

                <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
                  <div className="border-l-4 border-emerald-500 bg-emerald-50/60 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
                      {weekday}
                    </div>
                    <div className="text-2xl font-extrabold leading-tight tracking-tight text-gray-900">
                      {dateLine}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-4">
                        {day.slots.map((slot) => {
                          const booked = isBooked(day.date, slot.start, slot.end, slot.coach);
                          const blockId = getAdminBlockId(day.date, slot.start, slot.coach);
                          const isSelected =
                            form?.date === day.date && form.start === slot.start && form.coach === slot.coach;
                          const slotKey = `${slot.coach}-${slot.start}`;
                          const blockKey = `${slot.coach}|${day.date}|${slot.start}`;
                          // In the "all" view, set Coach Simon's slots apart in blue with a label.
                          const tagSimon = isAll && slot.coach === "simon";
                          const coachTag = tagSimon ? (
                            <span
                              className={
                                isSelected
                                  ? "ml-1 text-[11px] font-semibold text-white"
                                  : "ml-1 text-[11px] font-semibold text-sky-700"
                              }
                            >
                              (Coach Simon)
                            </span>
                          ) : null;

                          // Admin view of an admin-blocked slot — show with unblock button
                          if (isAdmin && booked && blockId) {
                            return (
                              <div key={slotKey} className="flex items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-2 py-1.5">
                                <span className="text-xs font-medium text-orange-400 line-through">
                                  {fmt(slot.start)} – {fmt(slot.end)}
                                </span>
                                {coachTag}
                                <button
                                  type="button"
                                  disabled={unblocking === blockId}
                                  onClick={() => void handleAdminUnblock(blockId, day.date, slot.start, slot.coach)}
                                  title="Unblock this slot"
                                  className="ml-1 rounded-lg p-0.5 text-orange-500 hover:bg-orange-100 disabled:opacity-50"
                                >
                                  <Unlock className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          }

                          // Already booked by a parent (or CRM session) — greyed out for everyone
                          if (booked) {
                            return (
                              <button key={slotKey} type="button" disabled
                                className="cursor-not-allowed rounded-xl border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-300 line-through">
                                {fmt(slot.start)} – {fmt(slot.end)}{coachTag}
                              </button>
                            );
                          }

                          // Available slot — admin gets a lock icon to block it
                          if (isAdmin) {
                            return (
                              <div
                                key={slotKey}
                                className={
                                  tagSimon
                                    ? "flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5"
                                    : "flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1.5"
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => openForm(day.date, slot.start, slot.end, day.label, slot.coach)}
                                  className={
                                    tagSimon
                                      ? (isSelected ? "text-xs font-semibold text-sky-900 underline" : "text-xs font-semibold text-sky-700 hover:underline")
                                      : (isSelected ? "text-xs font-semibold text-emerald-900 underline" : "text-xs font-semibold text-emerald-700 hover:underline")
                                  }
                                >
                                  {fmt(slot.start)} – {fmt(slot.end)}
                                </button>
                                {coachTag}
                                <button
                                  type="button"
                                  disabled={blocking === blockKey}
                                  onClick={() => void handleAdminBlock(day.date, slot.start, slot.end, slot.coach)}
                                  title="Block this slot"
                                  className="ml-1 rounded-lg p-0.5 text-emerald-400 hover:bg-emerald-100 hover:text-orange-500 disabled:opacity-50"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          }

                          // Normal public available slot — Simon's are blue in "all" view
                          const baseClass = tagSimon
                            ? (isSelected
                                ? "rounded-xl border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow"
                                : "rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:bg-sky-100")
                            : (isSelected
                                ? "rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow"
                                : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100");
                          return (
                            <button
                              key={slotKey}
                              type="button"
                              onClick={() => openForm(day.date, slot.start, slot.end, day.label, slot.coach)}
                              className={baseClass}
                            >
                              {fmt(slot.start)} – {fmt(slot.end)}{coachTag}
                            </button>
                          );
                        })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking form (public) */}
      {form && !isAdmin && (
        <div id="booking-form-section" className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-md">
          {submitted ? (
            <div className="py-4 text-center">
              <div className="mb-2 text-2xl">✅</div>
              <h3 className="text-lg font-semibold text-gray-900">Request sent!</h3>
              <p className="mt-2 text-sm text-gray-600">
                Your request for{" "}
                <span className="font-medium">{form.dateLabel} {fmt(form.start)} – {fmt(form.end)}</span>{" "}
                with <span className="font-medium">{COACH_LABEL[form.coach] ?? "Coach David"}</span>{" "}
                has been submitted. We&apos;ll reach out to confirm shortly.
              </p>
              <button type="button" onClick={() => setForm(null)}
                className="mt-5 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50">
                Book another slot
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h3 className="text-base font-semibold text-gray-900">
                  Request this slot with {COACH_LABEL[form.coach] ?? "Coach David"}
                </h3>
                <p
                  className={
                    form.coach === "simon"
                      ? "mt-0.5 text-sm font-medium text-sky-700"
                      : "mt-0.5 text-sm font-medium text-emerald-700"
                  }
                >
                  {form.dateLabel} &middot; {fmt(form.start)} – {fmt(form.end)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  This time will be held once you submit. We&apos;ll text you to confirm.
                </p>
              </div>
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Your name *</label>
                    <input required value={parentName} onChange={(e) => setParentName(e.target.value)}
                      placeholder="Parent / guardian name"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Player&apos;s name *</label>
                    <input required value={playerName} onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Your child's name"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Phone number *</label>
                    <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="(720) 555-1234"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Notes (optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    placeholder="Player's age, position, goals, questions…"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </div>
                {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={submitting}
                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                    {submitting ? "Sending…" : "Request this slot"}
                  </button>
                  <button type="button" onClick={() => setForm(null)}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
