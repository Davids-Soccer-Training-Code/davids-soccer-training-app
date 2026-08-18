import { NextRequest } from "next/server";
import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { assertOwnerAccess } from "@/lib/ownerGate";
import { sendBookingConfirmationSms } from "@/lib/bookingConfirmSms";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  // Admin login isn't enough here: the owner code gates changing bookings, not
  // just viewing them, so the page gate can't be stepped around via the API.
  const locked = await assertOwnerAccess(req);
  if (locked) return locked;

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

  // Confirming here marks the request and texts the parent but does NOT create
  // a CRM session — that path is POST .../schedule, which is what the admin UI
  // normally uses. This stays for the case where the session already exists in
  // the CRM and the request just needs to stop showing as pending.
  if (status === "confirmed") {
    await sendBookingConfirmationSms(rows[0]);
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  // Admin login isn't enough here: the owner code gates changing bookings, not
  // just viewing them, so the page gate can't be stepped around via the API.
  const locked = await assertOwnerAccess(req);
  if (locked) return locked;

  const { requestId } = await ctx.params;
  await sql`DELETE FROM session_booking_requests WHERE id = ${requestId}`;
  return new Response(null, { status: 204 });
}
