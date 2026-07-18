import "server-only";

import { sql } from "@/db";
import {
  COACH_SLUGS,
  DEFAULT_SCHEDULES,
  BLOCK_ORDER,
  type Block,
  type CoachProfile,
  type CoachSchedule,
  type CoachSlug,
} from "@/lib/bookingSchedule";

export type { CoachProfile };

type StaffRow = {
  slug: string;
  booking_bio: string | null;
  booking_role: string | null;
  booking_schedule: CoachSchedule | null;
};

// Normalize whatever is stored in booking_schedule into a clean 0..6 → Block[]
// map, dropping unknown blocks. Used on read so bad data can't reach the UI.
export function sanitizeSchedule(raw: unknown): CoachSchedule {
  const out: CoachSchedule = {};
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (let dow = 0; dow <= 6; dow++) {
    const val = obj[String(dow)];
    const blocks = Array.isArray(val) ? val : [];
    out[String(dow)] = BLOCK_ORDER.filter((b) => (blocks as unknown[]).includes(b)) as Block[];
  }
  return out;
}

async function fetchStaffBySlug(): Promise<Map<string, StaffRow>> {
  const rows = (await sql`
    SELECT slug, booking_bio, booking_role, booking_schedule
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
      schedule: row?.booking_schedule
        ? sanitizeSchedule(row.booking_schedule)
        : DEFAULT_SCHEDULES[slug],
    };
  }
  return out;
}

// Just the schedules, keyed by slug — what the booking calendar/API need to
// generate and validate slots.
export async function getCoachSchedules(): Promise<Record<CoachSlug, CoachSchedule>> {
  const profiles = await getCoachProfiles();
  const out = {} as Record<CoachSlug, CoachSchedule>;
  for (const slug of COACH_SLUGS) out[slug] = profiles[slug].schedule;
  return out;
}

// One coach's schedule, with fallback. Used by the booking API to validate a
// requested slot against the coach's current availability.
export async function getCoachSchedule(slug: string): Promise<CoachSchedule> {
  const isKnown = (COACH_SLUGS as readonly string[]).includes(slug);
  const key = (isKnown ? slug : "david") as CoachSlug;
  const bySlug = await fetchStaffBySlug();
  const row = bySlug.get(key);
  return row?.booking_schedule ? sanitizeSchedule(row.booking_schedule) : DEFAULT_SCHEDULES[key];
}
