// Booking availability per coach. Shared by the booking calendar (client) and
// the /api/booking-requests route (server) so the visible slots and the
// server-side validation can never drift apart.

export type SlotDef = { start: string; end: string };

// A coach's day is made of at most two fixed blocks. Which blocks are open on
// which weekday is editable per coach (stored on crm_staff.booking_schedule),
// but the block windows themselves are fixed.
export type Block = "morning" | "evening";

// A coach's weekly availability: for each weekday (0 = Sunday … 6 = Saturday),
// the open blocks. Missing/empty means the coach is off that day.
export type CoachSchedule = Record<string, Block[]>;

const MORNING_FULL: SlotDef[] = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
];

const EVENING: SlotDef[] = [
  { start: "17:00", end: "18:00" },
  { start: "18:00", end: "19:00" },
  { start: "19:00", end: "20:00" },
];

// Fixed slot windows for each block. Morning = 8–11 AM, Evening = 5–8 PM.
const BLOCK_SLOTS: Record<Block, SlotDef[]> = {
  morning: MORNING_FULL,
  evening: EVENING,
};

export const BLOCK_ORDER: Block[] = ["morning", "evening"];

// Slots a coach offers on a given weekday, expanded from their schedule.
export function slotsFromSchedule(
  schedule: CoachSchedule | null | undefined,
  dow: number
): SlotDef[] {
  const blocks = schedule?.[String(dow)] ?? [];
  const out: SlotDef[] = [];
  for (const b of BLOCK_ORDER) {
    if (blocks.includes(b)) out.push(...BLOCK_SLOTS[b]);
  }
  return out;
}

// ── Hours display ────────────────────────────────────────────────────────────
// The hours pills at the top of the booking page are generated from the same
// schedule that drives the slots, so they can never drift.

const BLOCK_TIME: Record<Block, string> = {
  morning: "8:00 – 11:00 AM",
  evening: "5:00 – 8:00 PM",
};

const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Read the week Monday-first so ranges render as "Mon – Fri", with Sunday last.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function blockKey(blocks: Block[]): string {
  return BLOCK_ORDER.filter((b) => blocks.includes(b)).join("+");
}

function blockTimeLabel(blocks: Block[]): string {
  return BLOCK_ORDER.filter((b) => blocks.includes(b))
    .map((b) => BLOCK_TIME[b])
    .join(" & ");
}

export type HoursLine = { days: string; time: string };

// Collapse a schedule into human-readable hours lines, grouping consecutive
// days (Mon-first) that share the same open blocks.
export function scheduleToHoursLines(schedule: CoachSchedule): HoursLine[] {
  const lines: HoursLine[] = [];
  const blocksFor = (dow: number) => schedule[String(dow)] ?? [];
  let i = 0;
  while (i < WEEK_ORDER.length) {
    const blocks = blocksFor(WEEK_ORDER[i]);
    if (blocks.length === 0) {
      i++;
      continue;
    }
    const key = blockKey(blocks);
    let j = i;
    while (
      j + 1 < WEEK_ORDER.length &&
      blocksFor(WEEK_ORDER[j + 1]).length > 0 &&
      blockKey(blocksFor(WEEK_ORDER[j + 1])) === key
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
    lines.push({ days, time: blockTimeLabel(blocks) });
    i = j + 1;
  }
  return lines;
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
// a brand-new coach row). These mirror what the live schedules were before they
// became editable, so the booking page never renders empty.
const M: Block[] = ["morning"];
const E: Block[] = ["evening"];
const ME: Block[] = ["morning", "evening"];
export const DEFAULT_SCHEDULES: Record<CoachSlug, CoachSchedule> = {
  david: { "0": M, "1": ME, "2": ME, "3": ME, "4": ME, "5": ME, "6": E },
  simon: { "0": [], "1": M, "2": ME, "3": ME, "4": M, "5": M, "6": [] },
  simpson: { "0": [], "1": ME, "2": ME, "3": M, "4": ME, "5": M, "6": ME },
};

// A coach profile as the booking page and admin editor consume it. Plain data
// (serializable) so a server component can hand it to a client component.
export type CoachProfile = {
  slug: CoachSlug;
  bio: string | null;
  role: string | null;
  schedule: CoachSchedule;
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
