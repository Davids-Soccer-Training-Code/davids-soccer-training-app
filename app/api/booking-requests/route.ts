import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { sql } from "@/db";
import { sendSmsViaTwilio } from "@/lib/twilio";
import { getSlotsForCoachDow } from "@/lib/bookingSchedule";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Which coaches can take bookings. Anything unrecognized falls back to David.
const COACH_LABELS: Record<string, string> = {
  david: "Coach David",
  simon: "Coach Simon",
};

function normalizeCoach(value: unknown): string {
  const c = typeof value === "string" ? value.trim().toLowerCase() : "";
  return c in COACH_LABELS ? c : "david";
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

  // coach=all returns every coach's slots (each tagged); otherwise one coach.
  const coachParam = req.nextUrl.searchParams.get("coach");
  const all = coachParam === "all";
  const coach = normalizeCoach(coachParam);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sixWeeks = new Date(today);
  sixWeeks.setDate(sixWeeks.getDate() + 42);

  const todayStr = today.toISOString().slice(0, 10);
  const endStr = sixWeeks.toISOString().slice(0, 10);

  // Pending/confirmed/blocked booking requests — all block the slot. Each row is
  // tagged with its coach so the calendar can keep coaches' slots separate.
  const booked = (await sql`
    SELECT slot_date::text AS date, to_char(slot_start, 'HH24:MI') AS start, coach
    FROM session_booking_requests
    WHERE status IN ('pending', 'confirmed', 'blocked')
      AND (${all} OR coach = ${coach})
      AND slot_date >= ${todayStr}::date
      AND slot_date <= ${endStr}::date
  `) as unknown as Array<{ date: string; start: string; coach: string }>;

  // For admins, also return blocked-by-admin entries with IDs so they can unblock
  const adminBlocked = isAdmin
    ? ((await sql`
        SELECT id, slot_date::text AS date, to_char(slot_start, 'HH24:MI') AS start, coach
        FROM session_booking_requests
        WHERE status = 'blocked'
          AND (${all} OR coach = ${coach})
          AND slot_date >= ${todayStr}::date
          AND slot_date <= ${endStr}::date
      `) as unknown as Array<{ id: string; date: string; start: string; coach: string }>)
    : [];

  // CRM sessions are Coach David's own calendar — only block David's availability.
  if (!all && coach !== "david") {
    return Response.json({ bookedSlots: booked, adminBlocked });
  }

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

  // CRM sessions belong to Coach David — tag them so the calendar treats them as his.
  const crmDavid = [...crmRegular, ...crmFirst].map((s) => ({ ...s, coach: "david" }));

  return Response.json({
    bookedSlots: [...booked, ...crmDavid],
    adminBlocked,
  });
}

// POST /api/booking-requests
// Body: { parent_name, player_name, phone?, email?, notes?, slot_date, slot_start, slot_end }
// Admin-only body: { admin_block: true, slot_date, slot_start, slot_end }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return new Response("Invalid JSON", { status: 400 });

  const { parent_name, player_name, phone, email, notes, slot_date, slot_start, slot_end, admin_block, coach: coachRaw } =
    body as Record<string, unknown>;

  const coach = normalizeCoach(coachRaw);

  // Admin blocking a slot
  if (admin_block === true) {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET });
    if (token?.isAdmin !== true) return new Response("Forbidden", { status: 403 });

    if (!slot_date || typeof slot_date !== "string") return new Response("slot_date required", { status: 400 });
    if (!slot_start || typeof slot_start !== "string") return new Response("slot_start required", { status: 400 });
    if (!slot_end || typeof slot_end !== "string") return new Response("slot_end required", { status: 400 });

    // Validate slot is in this coach's schedule
    const dow = new Date(slot_date + "T12:00:00").getDay();
    const validSlots = getSlotsForCoachDow(coach, dow);
    if (!validSlots.some((s) => s.start === slot_start && s.end === slot_end)) {
      return new Response("Invalid slot", { status: 400 });
    }

    const rows = (await sql`
      INSERT INTO session_booking_requests
        (parent_name, player_name, slot_date, slot_start, slot_end, status, coach)
      VALUES ('Admin', 'Blocked', ${slot_date}::date, ${slot_start}::time, ${slot_end}::time, 'blocked', ${coach})
      ON CONFLICT DO NOTHING
      RETURNING id, slot_date::text AS date, to_char(slot_start,'HH24:MI') AS start, coach
    `) as unknown as Array<{ id: string; date: string; start: string; coach: string }>;

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

  // Validate the slot is in this coach's schedule
  const dow = new Date(slot_date + "T12:00:00").getDay();
  const validSlots = getSlotsForCoachDow(coach, dow);
  const isValid = validSlots.some((s) => s.start === slot_start && s.end === slot_end);
  if (!isValid) {
    return new Response("Invalid slot", { status: 400 });
  }

  // Check if already booked for this coach
  const conflict = (await sql`
    SELECT 1 FROM session_booking_requests
    WHERE slot_date = ${slot_date}::date
      AND slot_start = ${slot_start}::time
      AND coach = ${coach}
      AND status IN ('pending', 'confirmed', 'blocked')
    LIMIT 1
  `) as unknown as Array<unknown>;

  if (conflict.length > 0) {
    return new Response("That slot is no longer available.", { status: 409 });
  }

  const rows = (await sql`
    INSERT INTO session_booking_requests
      (parent_name, player_name, phone, email, slot_date, slot_start, slot_end, notes, coach)
    VALUES (
      ${parent_name.trim()},
      ${player_name.trim()},
      ${phone && typeof phone === "string" ? phone.trim() || null : null},
      ${email && typeof email === "string" ? email.trim() || null : null},
      ${slot_date}::date,
      ${slot_start}::time,
      ${slot_end}::time,
      ${notes && typeof notes === "string" ? notes.trim() || null : null},
      ${coach}
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

  // Send SMS before returning — fire-and-forget inside serverless kills the
  // function after the response is sent, so we await here and swallow errors.
  // Always point the review link at the live admin, never localhost.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.davidssoccertraining.com";
  await sendSmsViaTwilio(
    `📅 Session request with ${COACH_LABELS[coach]} from ${parent_name.trim()} for ${player_name.trim()}.\n` +
    `Slot: ${slotDateLabel} ${fmt(slot_start)} – ${fmt(slot_end)}.\n` +
    `Phone: ${phone ?? "—"}  Email: ${email ?? "—"}.\n` +
    `Review: ${baseUrl}/admin/booking-requests`,
    { to: "+17206122979" }
  ).catch(() => {});

  return Response.json({ request }, { status: 201 });
}
