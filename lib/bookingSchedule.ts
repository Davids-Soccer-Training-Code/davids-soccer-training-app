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

export function getSlotsForCoachDow(coach: string, dow: number): SlotDef[] {
  return coach === "simon" ? simonSlots(dow) : davidSlots(dow);
}
