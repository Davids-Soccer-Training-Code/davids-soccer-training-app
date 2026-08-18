import { NextRequest } from "next/server";

import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { assertOwnerAccess } from "@/lib/ownerGate";
import { sendBookingConfirmationSms } from "@/lib/bookingConfirmSms";
import {
  createCrmSession,
  DEFAULT_BOOKING_ADDRESS,
  type CrmParentRef,
  type CrmPlayerRef,
} from "@/lib/crmBridge";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  parent_name: string;
  player_name: string;
  phone: string | null;
  email: string | null;
  coach: string | null;
  slot_date: string;
  slot_start: string;
  slot_end: string;
  notes: string | null;
  crm_session_id: string | null;
};

type Body = {
  /** Existing CRM parent, or null to create one from the request's own details. */
  parentId?: number | null;
  /** Existing CRM player under that parent, or null to create from player_name. */
  playerId?: number | null;
  kind?: "first" | "session";
  packageId?: number | null;
  price?: number | null;
  title?: string | null;
  location?: string | null;
  /** Persist `location` to booking_locations under this label for next time. */
  saveLocationAs?: string | null;
  sendEmailInvites?: boolean;
};

/**
 * Turn a confirmed booking request into a real CRM session.
 *
 * The CRM call goes first on purpose: only once it succeeds do we mark the
 * request confirmed and text the parent, so a CRM failure can never leave a
 * parent holding a confirmation for a session that does not exist.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const locked = await assertOwnerAccess(req);
  if (locked) return locked;

  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Body;

  const rows = (await sql`
    SELECT id, parent_name, player_name, phone, email, coach,
           slot_date::text AS slot_date,
           to_char(slot_start, 'HH24:MI') AS slot_start,
           to_char(slot_end,   'HH24:MI') AS slot_end,
           notes, crm_session_id
    FROM session_booking_requests
    WHERE id = ${requestId}
  `) as unknown as RequestRow[];

  if (rows.length === 0) return new Response("Not found", { status: 404 });
  const row = rows[0];

  // A second click would mean a second calendar invite in the parent's inbox.
  if (row.crm_session_id != null) {
    return Response.json(
      { error: "This request is already scheduled in the CRM." },
      { status: 409 }
    );
  }

  const kind = body.kind === "first" ? "first" : "session";

  const parent: CrmParentRef =
    body.parentId != null
      ? { id: Number(body.parentId) }
      : { create: { name: row.parent_name, email: row.email, phone: row.phone } };

  const player: CrmPlayerRef =
    body.playerId != null
      ? { id: Number(body.playerId) }
      : { create: { name: row.player_name } };

  // slot_date + slot_start is already the Arizona-local "datetime-local" shape
  // the CRM parses, so no timezone conversion happens on this side.
  const result = await createCrmSession({
    kind,
    parent,
    players: [player],
    session_date: `${row.slot_date}T${row.slot_start}`,
    session_end_date: `${row.slot_date}T${row.slot_end}`,
    location: body.location?.trim() || DEFAULT_BOOKING_ADDRESS,
    // A package session is already paid for; pricing it again double-counts.
    price: kind === "session" && body.packageId != null ? null : body.price ?? null,
    title: body.title?.trim() || null,
    notes: row.notes,
    package_id: kind === "session" ? body.packageId ?? null : null,
    coach_slug: row.coach,
    send_email_updates: body.sendEmailInvites === true,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  await sql`
    UPDATE session_booking_requests
    SET status = 'confirmed',
        crm_session_id = ${result.sessionId},
        crm_session_kind = ${kind},
        scheduled_at = now(),
        updated_at = now()
    WHERE id = ${requestId}
  `;

  // Optionally remember a one-off address so it's a click next time.
  const saveAs = body.saveLocationAs?.trim();
  const address = body.location?.trim();
  if (saveAs && address) {
    await sql`
      INSERT INTO booking_locations (label, address)
      SELECT ${saveAs}, ${address}
      WHERE NOT EXISTS (SELECT 1 FROM booking_locations WHERE address = ${address})
    `;
  }

  await sendBookingConfirmationSms(row);

  return Response.json({
    ok: true,
    crmSessionId: result.sessionId,
    crmSessionKind: kind,
    crmParentId: result.parentId,
    crmPlayerIds: result.playerIds,
  });
}
