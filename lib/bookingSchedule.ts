// Booking availability per coach. Shared by the booking calendar (client) and
// the /api/booking-requests route (server) so the visible slots and the
// server-side validation can never drift apart.

export type SlotDef = { start: string; end: string };

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

// Coach David — Mon–Fri mornings + evenings, Sat evenings, Sun mornings.
const DAVID_WEEKDAY: SlotDef[] = [...MORNING_FULL, ...EVENING];
const DAVID_SATURDAY: SlotDef[] = [...EVENING];
const DAVID_SUNDAY: SlotDef[] = [...MORNING_FULL];

// Coach Simon — Mon/Thu/Fri mornings 8–11, plus Tue & Wed mornings + evenings.
const SIMON_TUE_WED: SlotDef[] = [...MORNING_FULL, ...EVENING];
const SIMON_MIDWEEK: SlotDef[] = [...MORNING_FULL];

// Coach Simpson — mornings 8–11 Mon–Sat, plus evenings 5–8 on Mon/Tue/Thu/Sat.
const SIMPSON_FULL: SlotDef[] = [...MORNING_FULL, ...EVENING];
const SIMPSON_MORNING: SlotDef[] = [...MORNING_FULL];

// dow: 0 = Sunday … 6 = Saturday
function davidSlots(dow: number): SlotDef[] {
  if (dow >= 1 && dow <= 5) return DAVID_WEEKDAY;
  if (dow === 6) return DAVID_SATURDAY;
  return DAVID_SUNDAY;
}

function simonSlots(dow: number): SlotDef[] {
  if (dow === 2 || dow === 3) return SIMON_TUE_WED; // Tue & Wed: mornings + evening
  if (dow === 1 || dow === 4 || dow === 5) return SIMON_MIDWEEK; // Mon/Thu/Fri mornings
  return [];
}

function simpsonSlots(dow: number): SlotDef[] {
  if (dow === 0) return []; // Sunday off
  // Evenings on Mon, Tue, Thu, Sat; mornings every Mon–Sat.
  const hasEvening = dow === 1 || dow === 2 || dow === 4 || dow === 6;
  return hasEvening ? SIMPSON_FULL : SIMPSON_MORNING;
}

export function getSlotsForCoachDow(coach: string, dow: number): SlotDef[] {
  if (coach === "simon") return simonSlots(dow);
  if (coach === "simpson") return simpsonSlots(dow);
  return davidSlots(dow);
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
