import "server-only";

import { sql } from "@/db";
import {
  COACH_SLUGS,
  DEFAULT_SCHEDULES,
  DEFAULT_HORIZON_MONTHS,
  isWholeHourBlock,
  type CoachProfile,
  type CoachSchedule,
  type CoachSlug,
  type DayBlocks,
  type TimeBlock,
} from "@/lib/bookingSchedule";

export type { CoachProfile };

type StaffRow = {
  slug: string;
  booking_bio: string | null;
  booking_role: string | null;
  booking_schedule: unknown;
  booking_horizon_months: number | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The pre-periods schedule format was a plain object: dow -> ["morning"|
// "evening"], with fixed Morning (8–11 AM) / Evening (5–8 PM) windows. Convert
// any such value to a single open-ended period so rows written before this
// feature (or by an older deploy) still read correctly.
const LEGACY_BLOCKS: Record<string, TimeBlock> = {
  morning: { start: "08:00", end: "11:00" },
  evening: { start: "17:00", end: "20:00" },
};
function legacyToSchedule(obj: Record<string, unknown>): CoachSchedule {
  const days: DayBlocks = {};
  for (let dow = 0; dow <= 6; dow++) {
    const val = obj[String(dow)];
    const names = Array.isArray(val) ? (val as unknown[]) : [];
    days[String(dow)] = (["morning", "evening"] as const)
      .filter((k) => names.includes(k))
      .map((k) => LEGACY_BLOCKS[k]);
  }
  return [{ start: null, end: null, days }];
}

// Normalize whatever is stored in booking_schedule into a clean list of
// periods, dropping malformed periods and any block that isn't a whole number
// of hours. Accepts both the new period array and the legacy object format.
// Used on read and write so bad data can never reach the UI or slots.
export function sanitizeSchedule(raw: unknown): CoachSchedule {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return legacyToSchedule(raw as Record<string, unknown>);
  }
  if (!Array.isArray(raw)) return [];
  const out: CoachSchedule = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const start = typeof p.start === "string" && DATE_RE.test(p.start) ? p.start : null;
    const end = typeof p.end === "string" && DATE_RE.test(p.end) ? p.end : null;
    const daysRaw = p.days && typeof p.days === "object" ? (p.days as Record<string, unknown>) : {};
    const days: DayBlocks = {};
    for (let dow = 0; dow <= 6; dow++) {
      const val = daysRaw[String(dow)];
      const arr = Array.isArray(val) ? val : [];
      const blocks: TimeBlock[] = [];
      for (const b of arr) {
        if (!b || typeof b !== "object") continue;
        const bb = b as Record<string, unknown>;
        if (typeof bb.start !== "string" || typeof bb.end !== "string") continue;
        const block = { start: bb.start.slice(0, 5), end: bb.end.slice(0, 5) };
        if (isWholeHourBlock(block)) blocks.push(block);
      }
      days[String(dow)] = blocks;
    }
    out.push({ start, end, days });
  }
  return out;
}

// Clamp a stored horizon to a sane 1–24 months, falling back to the default.
export function sanitizeHorizon(raw: unknown): number {
  if (raw == null) return DEFAULT_HORIZON_MONTHS;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_HORIZON_MONTHS;
  return Math.min(24, Math.round(n));
}

function scheduleOrDefault(slug: CoachSlug, raw: unknown): CoachSchedule {
  const clean = sanitizeSchedule(raw);
  return clean.length > 0 ? clean : DEFAULT_SCHEDULES[slug];
}

async function fetchStaffBySlug(): Promise<Map<string, StaffRow>> {
  const rows = (await sql`
    SELECT slug, booking_bio, booking_role, booking_schedule, booking_horizon_months
    FROM crm_staff
    WHERE slug IS NOT NULL
  `) as unknown as StaffRow[];
  return new Map(rows.map((r) => [r.slug, r]));
}

// All coach profiles, in display order, with fallbacks for anything missing.
export async function getCoachProfiles(): Promise<Record<CoachSlug, CoachProfile>> {
  const bySlug = await fetchStaffBySlug();
  const out = {} as Record<CoachSlug, CoachProfile>;
  for (const slug of COACH_SLUGS) {
    const row = bySlug.get(slug);
    out[slug] = {
      slug,
      bio: row?.booking_bio ?? null,
      role: row?.booking_role ?? null,
      schedule: scheduleOrDefault(slug, row?.booking_schedule),
      horizonMonths: sanitizeHorizon(row?.booking_horizon_months),
    };
  }
  return out;
}

// One coach's schedule, with fallback. Used by the booking API to validate a
// requested slot against the coach's availability for that date.
export async function getCoachSchedule(slug: string): Promise<CoachSchedule> {
  const key = ((COACH_SLUGS as readonly string[]).includes(slug) ? slug : "david") as CoachSlug;
  const bySlug = await fetchStaffBySlug();
  return scheduleOrDefault(key, bySlug.get(key)?.booking_schedule);
}

// A coach's contact phone from the staff table (any format — the Twilio sender
// normalizes it). Null when the coach has no number on file.
export async function getCoachPhone(slug: string): Promise<string | null> {
  const rows = (await sql`
    SELECT phone FROM crm_staff WHERE slug = ${slug} LIMIT 1
  `) as unknown as Array<{ phone: string | null }>;
  const phone = rows[0]?.phone?.trim();
  return phone ? phone : null;
}

// How many months ahead to render/hold, for one coach or the widest across all
// ("all" view). Drives the calendar range and the booked-slots query window.
export async function getHorizonMonths(coach: string): Promise<number> {
  const profiles = await getCoachProfiles();
  if (coach === "all") {
    return Math.max(...COACH_SLUGS.map((s) => profiles[s].horizonMonths));
  }
  const key = ((COACH_SLUGS as readonly string[]).includes(coach) ? coach : "david") as CoachSlug;
  return profiles[key].horizonMonths;
}
