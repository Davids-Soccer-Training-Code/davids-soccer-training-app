import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { sql } from "@/db";
import { sendSmsViaTwilio } from "@/lib/twilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Slot definitions per day-of-week (0=Sun … 6=Sat)
const WEEKDAY_SLOTS = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "17:30", end: "18:30" },
  { start: "18:30", end: "19:30" },
];

const SATURDAY_SLOTS = [
  { start: "17:30", end: "18:30" },
  { start: "18:30", end: "19:30" },
];

const SUNDAY_SLOTS = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
];

function getSlotsForDay(dow: number) {
  if (dow >= 1 && dow <= 5) return WEEKDAY_SLOTS;
  if (dow === 6) return SATURDAY_SLOTS;
  return SUNDAY_SLOTS; // Sunday
}

export type Slot = {
  date: string;  // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
};

// GET /api/booking-requests
// Returns { bookedSlots, adminBlocked } for the next 6 weeks.
// adminBlocked includes IDs so an admin can unblock slots.
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const isAdmin = token?.isAdmin === true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sixWeeks = new Date(today);
  sixWeeks.setDate(sixWeeks.getDate() + 42);

  const todayStr = today.toISOString().slice(0, 10);
  const endStr = sixWeeks.toISOString().slice(0, 10);

  // Pending/confirmed/blocked booking requests — all block the slot on the calendar
  const booked = (await sql`
    SELECT slot_date::text AS date, to_char(slot_start, 'HH24:MI') AS start
    FROM session_booking_requests
    WHERE status IN ('pending', 'confirmed', 'blocked')
      AND slot_date >= ${todayStr}::date
      AND slot_date <= ${endStr}::date
  `) as unknown as Array<{ date: string; start: string }>;

  // For admins, also return blocked-by-admin entries with IDs so they can unblock
  const adminBlocked = isAdmin
    ? ((await sql`
        SELECT id, slot_date::text AS date, to_char(slot_start, 'HH24:MI') AS start
        FROM session_booking_requests
        WHERE status = 'blocked'
          AND slot_date >= ${todayStr}::date
          AND slot_date <= ${endStr}::date
      `) as unknown as Array<{ id: string; date: string; start: string }>)
    : [];

  // CRM sessions: session_date is stored as UTC in a TIMESTAMP WITHOUT TZ column.
  // Cast to TIMESTAMPTZ (so Postgres treats the raw value as UTC), then convert
  // to Arizona time (America/Phoenix = UTC-7, no daylight saving ever).
  const crmRegular = (await sql`
    SELECT
      ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date::text AS date,
      to_char((session_date::timestamptz) AT TIME ZONE 'America/Phoenix', 'HH24:MI') AS start
    FROM crm_sessions
    WHERE cancelled IS NOT TRUE
      AND ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date >= ${todayStr}::date
      AND ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date <= ${endStr}::date
  `) as unknown as Array<{ date: string; start: string }>;

  const crmFirst = (await sql`
    SELECT
      ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date::text AS date,
      to_char((session_date::timestamptz) AT TIME ZONE 'America/Phoenix', 'HH24:MI') AS start
    FROM crm_first_sessions
    WHERE cancelled IS NOT TRUE
      AND ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date >= ${todayStr}::date
      AND ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date <= ${endStr}::date
  `) as unknown as Array<{ date: string; start: string }>;

  return Response.json({
    bookedSlots: [...booked, ...crmRegular, ...crmFirst],
    adminBlocked,
  });
}

// POST /api/booking-requests
// Body: { parent_name, player_name, phone?, email?, notes?, slot_date, slot_start, slot_end }
// Admin-only body: { admin_block: true, slot_date, slot_start, slot_end }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return new Response("Invalid JSON", { status: 400 });

  const { parent_name, player_name, phone, email, notes, slot_date, slot_start, slot_end, admin_block } =
    body as Record<string, unknown>;

  // Admin blocking a slot
  if (admin_block === true) {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET });
    if (token?.isAdmin !== true) return new Response("Forbidden", { status: 403 });

    if (!slot_date || typeof slot_date !== "string") return new Response("slot_date required", { status: 400 });
    if (!slot_start || typeof slot_start !== "string") return new Response("slot_start required", { status: 400 });
    if (!slot_end || typeof slot_end !== "string") return new Response("slot_end required", { status: 400 });

    // Validate slot is in schedule
    const dow = new Date(slot_date + "T12:00:00").getDay();
    const validSlots = getSlotsForDay(dow);
    if (!validSlots.some((s) => s.start === slot_start && s.end === slot_end)) {
      return new Response("Invalid slot", { status: 400 });
    }

    const rows = (await sql`
      INSERT INTO session_booking_requests
        (parent_name, player_name, slot_date, slot_start, slot_end, status)
      VALUES ('Admin', 'Blocked', ${slot_date}::date, ${slot_start}::time, ${slot_end}::time, 'blocked')
      ON CONFLICT DO NOTHING
      RETURNING id, slot_date::text AS slot_date, to_char(slot_start,'HH24:MI') AS slot_start
    `) as unknown as Array<{ id: string; slot_date: string; slot_start: string }>;

    return Response.json({ blocked: rows[0] ?? null }, { status: 201 });
  }

  if (!parent_name || typeof parent_name !== "string" || !parent_name.trim()) {
    return new Response("parent_name is required", { status: 400 });
  }
  if (!player_name || typeof player_name !== "string" || !player_name.trim()) {
    return new Response("player_name is required", { status: 400 });
  }
  if (!slot_date || typeof slot_date !== "string") {
    return new Response("slot_date is required", { status: 400 });
  }
  if (!slot_start || typeof slot_start !== "string") {
    return new Response("slot_start is required", { status: 400 });
  }
  if (!slot_end || typeof slot_end !== "string") {
    return new Response("slot_end is required", { status: 400 });
  }

  // Validate the slot is in our schedule
  const dow = new Date(slot_date + "T12:00:00").getDay();
  const validSlots = getSlotsForDay(dow);
  const isValid = validSlots.some((s) => s.start === slot_start && s.end === slot_end);
  if (!isValid) {
    return new Response("Invalid slot", { status: 400 });
  }

  // Check if already booked
  const conflict = (await sql`
    SELECT 1 FROM session_booking_requests
    WHERE slot_date = ${slot_date}::date
      AND slot_start = ${slot_start}::time
      AND status IN ('pending', 'confirmed')
    LIMIT 1
  `) as unknown as Array<unknown>;

  if (conflict.length > 0) {
    return new Response("That slot is no longer available.", { status: 409 });
  }

  const rows = (await sql`
    INSERT INTO session_booking_requests
      (parent_name, player_name, phone, email, slot_date, slot_start, slot_end, notes)
    VALUES (
      ${parent_name.trim()},
      ${player_name.trim()},
      ${phone && typeof phone === "string" ? phone.trim() || null : null},
      ${email && typeof email === "string" ? email.trim() || null : null},
      ${slot_date}::date,
      ${slot_start}::time,
      ${slot_end}::time,
      ${notes && typeof notes === "string" ? notes.trim() || null : null}
    )
    RETURNING id, status, created_at
  `) as unknown as Array<{ id: string; status: string; created_at: string }>;

  const request = rows[0];

  // Format a readable date for the SMS
  const slotDateLabel = new Date(slot_date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const fmt = (t: string) => {
    const [hStr, mStr] = t.split(":");
    const h = Number(hStr);
    const m = mStr;
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${ampm}`;
  };

  // Fire-and-forget SMS to admin
  Promise.resolve()
    .then(async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        await sendSmsViaTwilio(
          `📅 Session request from ${parent_name.trim()} for ${player_name.trim()}.\n` +
          `Slot: ${slotDateLabel} ${fmt(slot_start)} – ${fmt(slot_end)}.\n` +
          `Phone: ${phone ?? "—"}  Email: ${email ?? "—"}.\n` +
          `Review: ${baseUrl}/admin/booking-requests`,
          { to: "+17206122979" }
        ).catch(() => {});
      } catch {
        // ignore
      }
    })
    .catch(() => {});

  return Response.json({ request }, { status: 201 });
}
