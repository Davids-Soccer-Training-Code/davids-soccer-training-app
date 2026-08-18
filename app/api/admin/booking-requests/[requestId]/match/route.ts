import { NextRequest } from "next/server";

import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { assertOwnerAccess } from "@/lib/ownerGate";
import { matchBookingRequest } from "@/lib/crmMatch";

export const dynamic = "force-dynamic";

type RequestRow = {
  parent_name: string;
  player_name: string;
  phone: string | null;
  email: string | null;
  crm_session_id: string | null;
  crm_session_kind: string | null;
};

/**
 * Candidate CRM families for one booking request, plus what the confirm dialog
 * should pre-select. Read-only — nothing is created until /schedule is called.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  // Same gate as confirming: seeing who a request might be is owner data.
  const locked = await assertOwnerAccess(req);
  if (locked) return locked;

  const { requestId } = await ctx.params;

  const rows = (await sql`
    SELECT parent_name, player_name, phone, email, crm_session_id, crm_session_kind
    FROM session_booking_requests
    WHERE id = ${requestId}
  `) as unknown as RequestRow[];

  if (rows.length === 0) return new Response("Not found", { status: 404 });
  const row = rows[0];

  const match = await matchBookingRequest({
    parentName: row.parent_name,
    playerName: row.player_name,
    phone: row.phone,
    email: row.email,
  });

  const locations = (await sql`
    SELECT id, label, address FROM booking_locations ORDER BY created_at ASC
  `) as unknown as Array<{ id: string; label: string; address: string }>;

  return Response.json({
    ...match,
    locations,
    alreadyScheduled: row.crm_session_id != null,
    crmSessionId: row.crm_session_id,
    crmSessionKind: row.crm_session_kind,
  });
}
