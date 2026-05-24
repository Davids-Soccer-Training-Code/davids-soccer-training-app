"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Unlock } from "lucide-react";

// ── Slot generation ────────────────────────────────────────────────────────────

type SlotDef = { start: string; end: string };

const WEEKDAY_SLOTS: SlotDef[] = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "17:30", end: "18:30" },
  { start: "18:30", end: "19:30" },
];

const SATURDAY_SLOTS: SlotDef[] = [
  { start: "17:30", end: "18:30" },
  { start: "18:30", end: "19:30" },
];

const SUNDAY_SLOTS: SlotDef[] = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
];

function getSlotsForDow(dow: number): SlotDef[] {
  if (dow >= 1 && dow <= 5) return WEEKDAY_SLOTS;
  if (dow === 6) return SATURDAY_SLOTS;
  return SUNDAY_SLOTS;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DaySlots = { date: string; label: string; slots: SlotDef[] };

function generateDays(weeks = 6): DaySlots[] {
  const days: DaySlots[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const slots = getSlotsForDow(d.getDay());
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

type BookedSlot = { date: string; start: string };
type AdminBlocked = { id: string; date: string; start: string };
type FormState = { date: string; start: string; end: string; dateLabel: string };

// ── Component ──────────────────────────────────────────────────────────────────

export default function BookingCalendar({ isAdmin = false }: { isAdmin?: boolean }) {
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
    fetch("/api/booking-requests", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { bookedSlots: BookedSlot[]; adminBlocked?: AdminBlocked[] }) => {
        setBookedSlots(data.bookedSlots ?? []);
        setAdminBlocked(data.adminBlocked ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingSlots(false));
  }, []);

  const allBooked = useMemo(() => [...bookedSlots, ...locallyBooked], [bookedSlots, locallyBooked]);

  const norm = (s: string) => s.slice(0, 5);

  function isBooked(date: string, start: string): boolean {
    return allBooked.some((b) => b.date === date && norm(b.start) === norm(start));
  }

  function getAdminBlockId(date: string, start: string): string | null {
    return adminBlocked.find((b) => b.date === date && norm(b.start) === norm(start))?.id ?? null;
  }

  const days = useMemo(() => generateDays(6), []);

  const weeks = useMemo(() => {
    const groups: DaySlots[][] = [];
    let current: DaySlots[] = [];
    for (const day of days) {
      current.push(day);
      if (current.length === 7 || day === days[days.length - 1]) {
        groups.push(current);
        current = [];
      }
    }
    return groups;
  }, [days]);

  function openForm(date: string, start: string, end: string, dateLabel: string) {
    setForm({ date, start, end, dateLabel });
    setSubmitted(false);
    setError(null);
    setTimeout(() => {
      document.getElementById("booking-form-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function handleAdminBlock(date: string, start: string, end: string) {
    const key = `${date}|${start}`;
    setBlocking(key);
    try {
      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ admin_block: true, slot_date: date, slot_start: start, slot_end: end }),
      });
      if (res.ok) {
        const data = (await res.json()) as { blocked?: AdminBlocked };
        setLocallyBooked((prev) => [...prev, { date, start }]);
        if (data.blocked) {
          setAdminBlocked((prev) => [...prev, data.blocked!]);
        }
      }
    } finally {
      setBlocking(null);
    }
  }

  async function handleAdminUnblock(id: string, date: string, start: string) {
    setUnblocking(id);
    try {
      const res = await fetch(`/api/admin/booking-requests/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setAdminBlocked((prev) => prev.filter((b) => b.id !== id));
        setBookedSlots((prev) => prev.filter((b) => !(b.date === date && norm(b.start) === norm(start))));
        setLocallyBooked((prev) => prev.filter((b) => !(b.date === date && norm(b.start) === norm(start))));
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
        }),
      });
      if (res.status === 409) { setError("That slot was just taken. Please pick another time."); setSubmitting(false); return; }
      if (!res.ok) { setError((await res.text().catch(() => "")) || "Something went wrong."); setSubmitting(false); return; }
      setLocallyBooked((prev) => [...prev, { date: form.date, start: form.start }]);
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
        <div className="space-y-8">
          {weeks.map((week, wi) => (
            <div key={wi}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Week of{" "}
                {new Date(week[0].date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}
              </h2>
              <div className="space-y-3">
                {week.map((day) => {
                  const anyVisible = day.slots.some((s) => !isBooked(day.date, s.start) || isAdmin);
                  if (!anyVisible) return null;

                  return (
                    <div key={day.date} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-gray-800">{day.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {day.slots.map((slot) => {
                          const booked = isBooked(day.date, slot.start);
                          const blockId = getAdminBlockId(day.date, slot.start);
                          const isSelected = form?.date === day.date && form.start === slot.start;
                          const blockKey = `${day.date}|${slot.start}`;

                          // Admin view of an admin-blocked slot — show with unblock button
                          if (isAdmin && booked && blockId) {
                            return (
                              <div key={slot.start} className="flex items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-2 py-1.5">
                                <span className="text-xs font-medium text-orange-400 line-through">
                                  {fmt(slot.start)} – {fmt(slot.end)}
                                </span>
                                <button
                                  type="button"
                                  disabled={unblocking === blockId}
                                  onClick={() => void handleAdminUnblock(blockId, day.date, slot.start)}
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
                              <button key={slot.start} type="button" disabled
                                className="cursor-not-allowed rounded-xl border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-300 line-through">
                                {fmt(slot.start)} – {fmt(slot.end)}
                              </button>
                            );
                          }

                          // Available slot — admin gets a lock icon to block it
                          if (isAdmin) {
                            return (
                              <div key={slot.start} className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => openForm(day.date, slot.start, slot.end, day.label)}
                                  className={
                                    isSelected
                                      ? "text-xs font-semibold text-emerald-900 underline"
                                      : "text-xs font-semibold text-emerald-700 hover:underline"
                                  }
                                >
                                  {fmt(slot.start)} – {fmt(slot.end)}
                                </button>
                                <button
                                  type="button"
                                  disabled={blocking === blockKey}
                                  onClick={() => void handleAdminBlock(day.date, slot.start, slot.end)}
                                  title="Block this slot"
                                  className="ml-1 rounded-lg p-0.5 text-emerald-400 hover:bg-emerald-100 hover:text-orange-500 disabled:opacity-50"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          }

                          // Normal public available slot
                          return (
                            <button
                              key={slot.start}
                              type="button"
                              onClick={() => openForm(day.date, slot.start, slot.end, day.label)}
                              className={
                                isSelected
                                  ? "rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow"
                                  : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100"
                              }
                            >
                              {fmt(slot.start)} – {fmt(slot.end)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
                <h3 className="text-base font-semibold text-gray-900">Request this slot</h3>
                <p className="mt-0.5 text-sm text-emerald-700 font-medium">
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
