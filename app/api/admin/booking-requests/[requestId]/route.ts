import { NextRequest } from "next/server";
import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { sendSmsViaTwilio } from "@/lib/twilio";
import { COACH_LABELS } from "@/lib/bookingSchedule";

export const dynamic = "force-dynamic";

function fmtTime(t: string) {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${ampm}`;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { requestId } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { status?: string };
  const status = body.status ?? "confirmed";

  if (!["confirmed", "cancelled"].includes(status)) {
    return new Response("Invalid status", { status: 400 });
  }

  const rows = (await sql`
    UPDATE session_booking_requests
    SET status = ${status}, updated_at = now()
    WHERE id = ${requestId}
    RETURNING id, parent_name, player_name, phone, coach, slot_date::text AS slot_date,
              to_char(slot_start, 'HH24:MI') AS slot_start
  `) as unknown as Array<{
    id: string;
    parent_name: string;
    player_name: string;
    phone: string | null;
    coach: string | null;
    slot_date: string;
    slot_start: string;
  }>;

  if (rows.length === 0) return new Response("Not found", { status: 404 });

  const row = rows[0];
  if (status === "confirmed" && row.phone) {
    const slotDateLabel = new Date(row.slot_date + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const coachLabel = COACH_LABELS[row.coach ?? "david"] ?? "Coach David";
    await sendSmsViaTwilio(
      `✅ Hi ${row.parent_name}, your session for ${row.player_name} with ${coachLabel} on ${slotDateLabel} at ${fmtTime(row.slot_start)} is confirmed. See you then! — ${coachLabel}`,
      { to: row.phone }
    ).catch(() => {});
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { requestId } = await ctx.params;
  await sql`DELETE FROM session_booking_requests WHERE id = ${requestId}`;
  return new Response(null, { status: 204 });
}
