// Booking availability per coach. Shared by the booking calendar (client) and
// the /api/booking-requests route (server) so the visible slots and the
// server-side validation can never drift apart.

export type SlotDef = { start: string; end: string }; // "HH:MM"

// A custom availability block: start/end time on the same day. Sessions are
// always one hour, so a block must be a whole number of hours long (e.g.
// 08:00–11:00 or 14:30–17:30). Slots then tile hourly from the start.
export type TimeBlock = { start: string; end: string }; // "HH:MM"

// A day's availability: weekday (0 = Sunday … 6 = Saturday) → open blocks.
export type DayBlocks = Record<string, TimeBlock[]>;

// One dated schedule period. `start`/`end` are inclusive "YYYY-MM-DD" bounds;
// null means open-ended. Different periods let a coach run different hours for,
// say, July vs. Aug–Dec. The first period (in list order) that contains a date
// applies to that date.
export type SchedulePeriod = { start: string | null; end: string | null; days: DayBlocks };

// A coach's full availability: an ordered list of dated periods.
export type CoachSchedule = SchedulePeriod[];

// How far ahead the booking calendar shows, in months, when a coach hasn't set
// their own horizon.
export const DEFAULT_HORIZON_MONTHS = 2;

// ── Time helpers ─────────────────────────────────────────────────────────────

function toMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// A block is valid when it's non-empty and a whole number of hours long.
export function isWholeHourBlock(block: TimeBlock): boolean {
  const s = toMin(block.start);
  const e = toMin(block.end);
  return Number.isFinite(s) && Number.isFinite(e) && e > s && e <= 24 * 60 && (e - s) % 60 === 0;
}

// Tile a block into consecutive 1-hour slots.
export function slotsInBlock(block: TimeBlock): SlotDef[] {
  if (!isWholeHourBlock(block)) return [];
  const out: SlotDef[] = [];
  for (let m = toMin(block.start); m + 60 <= toMin(block.end); m += 60) {
    out.push({ start: toHHMM(m), end: toHHMM(m + 60) });
  }
  return out;
}

// ── Period selection ─────────────────────────────────────────────────────────

function dateInPeriod(p: SchedulePeriod, dateStr: string): boolean {
  if (p.start && dateStr < p.start) return false;
  if (p.end && dateStr > p.end) return false;
  return true;
}

// The period that applies to a date — the first one (in list order) that
// contains it, or null if none do.
export function periodForDate(schedule: CoachSchedule, dateStr: string): SchedulePeriod | null {
  for (const p of schedule) {
    if (dateInPeriod(p, dateStr)) return p;
  }
  return null;
}

// Slots a coach offers on a specific date: pick the applicable period, expand
// that weekday's blocks into hourly slots, sorted by start.
export function slotsForDate(
  schedule: CoachSchedule | null | undefined,
  dateStr: string,
  dow: number
): SlotDef[] {
  const period = periodForDate(schedule ?? [], dateStr);
  if (!period) return [];
  const blocks = period.days[String(dow)] ?? [];
  const out: SlotDef[] = [];
  for (const b of blocks) out.push(...slotsInBlock(b));
  out.sort((a, b) => toMin(a.start) - toMin(b.start));
  return out;
}

// ── Hours display ────────────────────────────────────────────────────────────
// The hours pills at the top of the booking page are generated from the same
// schedule that drives the slots, so they can never drift.

const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Read the week Monday-first so ranges render as "Mon – Fri", with Sunday last.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// "14:30" → "2:30 PM"
export function fmtTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

function blocksTimeLabel(blocks: TimeBlock[]): string {
  return [...blocks]
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((b) => `${fmtTime12(b.start)} – ${fmtTime12(b.end)}`)
    .join(" & ");
}

function blocksKey(blocks: TimeBlock[]): string {
  return [...blocks]
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((b) => `${b.start}-${b.end}`)
    .join(",");
}

export type HoursLine = { days: string; time: string };

// Collapse one period's weekly blocks into readable hours lines, grouping
// consecutive days (Mon-first) that share the same blocks.
export function periodHoursLines(period: SchedulePeriod): HoursLine[] {
  const lines: HoursLine[] = [];
  const blocksFor = (dow: number) => period.days[String(dow)] ?? [];
  let i = 0;
  while (i < WEEK_ORDER.length) {
    const blocks = blocksFor(WEEK_ORDER[i]);
    if (blocks.length === 0) {
      i++;
      continue;
    }
    const key = blocksKey(blocks);
    let j = i;
    while (
      j + 1 < WEEK_ORDER.length &&
      blocksFor(WEEK_ORDER[j + 1]).length > 0 &&
      blocksKey(blocksFor(WEEK_ORDER[j + 1])) === key
    ) {
      j++;
    }
    const startDow = WEEK_ORDER[i];
    const endDow = WEEK_ORDER[j];
    const len = j - i + 1;
    const days =
      len === 1
        ? DOW_FULL[startDow]
        : len === 2
          ? `${DOW_ABBR[startDow]} & ${DOW_ABBR[endDow]}`
          : `${DOW_ABBR[startDow]} – ${DOW_ABBR[endDow]}`;
    lines.push({ days, time: blocksTimeLabel(blocks) });
    i = j + 1;
  }
  return lines;
}

// A period's hours plus a human label for its date range (null when the period
// is fully open-ended — the common single-period case, which then reads exactly
// like a plain weekly schedule).
export type PeriodHours = { label: string | null; lines: HoursLine[] };

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function periodLabel(p: SchedulePeriod): string | null {
  if (p.start && p.end) return `${fmtDate(p.start)} – ${fmtDate(p.end)}`;
  if (p.start) return `From ${fmtDate(p.start)}`;
  if (p.end) return `Through ${fmtDate(p.end)}`;
  return null;
}

// Hours grouped by period, dropping periods entirely in the past (as of
// `todayStr`) or with no availability.
export function scheduleToPeriodHours(schedule: CoachSchedule, todayStr: string): PeriodHours[] {
  const out: PeriodHours[] = [];
  for (const p of schedule) {
    if (p.end && p.end < todayStr) continue; // wholly past
    const lines = periodHoursLines(p);
    if (lines.length === 0) continue;
    out.push({ label: periodLabel(p), lines });
  }
  return out;
}

// ── Coach identity ───────────────────────────────────────────────────────────
// Single source of truth for which coaches take bookings and how they're named.
// Imported by the API route, the booking calendar, and the admin dashboard so
// their labels and valid-coach checks can never drift apart.

export const COACH_LABELS: Record<string, string> = {
  david: "Coach David",
  simon: "Coach Simon",
  simpson: "Coach Simpson",
};

// Display/toggle order. "all" is layered on top of this in the UI.
export const COACH_SLUGS = ["david", "simon", "simpson"] as const;
export type CoachSlug = (typeof COACH_SLUGS)[number];
export type CoachSelection = "all" | CoachSlug;

// Fallback schedules used only if a coach has no booking_schedule stored (e.g.
// a brand-new coach row): a single open-ended period with the old fixed
// Morning (8–11 AM) / Evening (5–8 PM) windows, so the page never renders empty.
const MORNING: TimeBlock = { start: "08:00", end: "11:00" };
const EVENING: TimeBlock = { start: "17:00", end: "20:00" };
const openPeriod = (days: DayBlocks): CoachSchedule => [{ start: null, end: null, days }];
export const DEFAULT_SCHEDULES: Record<CoachSlug, CoachSchedule> = {
  david: openPeriod({
    "0": [MORNING], "1": [MORNING, EVENING], "2": [MORNING, EVENING], "3": [MORNING, EVENING],
    "4": [MORNING, EVENING], "5": [MORNING, EVENING], "6": [EVENING],
  }),
  simon: openPeriod({
    "0": [], "1": [MORNING], "2": [MORNING, EVENING], "3": [MORNING, EVENING],
    "4": [MORNING], "5": [MORNING], "6": [],
  }),
  simpson: openPeriod({
    "0": [], "1": [MORNING, EVENING], "2": [MORNING, EVENING], "3": [MORNING],
    "4": [MORNING, EVENING], "5": [MORNING], "6": [MORNING, EVENING],
  }),
};

// A coach profile as the booking page and admin editor consume it. Plain data
// (serializable) so a server component can hand it to a client component.
export type CoachProfile = {
  slug: CoachSlug;
  bio: string | null;
  role: string | null;
  schedule: CoachSchedule;
  horizonMonths: number;
};

// Legacy ?coach= slugs that have since been renamed, kept so links shared
// before the rename still land on the right coach. (Coach Simpson was first
// launched as "marcanthony".)
const COACH_ALIASES: Record<string, CoachSlug> = { marcanthony: "simpson" };

// Normalize a ?coach= URL param (or toggle value) to a known selection.
// Anything unrecognized — including an empty param — falls back to "all".
export function parseCoachParam(value: string | null | undefined): CoachSelection {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "all") return "all";
  if (v in COACH_ALIASES) return COACH_ALIASES[v];
  return (COACH_SLUGS as readonly string[]).includes(v) ? (v as CoachSlug) : "all";
}
