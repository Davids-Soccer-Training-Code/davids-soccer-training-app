import { NextRequest } from "next/server";

import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Toggle the kit/photo checkboxes on a player's coach-roster card.
 *
 * Coach-accessible (no owner code): this is the coaches' own admin surface,
 * and ticking a box is exactly the work they're there to do.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ crmPlayerId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { crmPlayerId } = await ctx.params;
  const id = Number(crmPlayerId);
  if (!Number.isInteger(id)) return new Response("Invalid player id", { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    hasShirt?: unknown;
    hasPhoto?: unknown;
  };

  const hasShirt = typeof body.hasShirt === "boolean" ? body.hasShirt : null;
  const hasPhoto = typeof body.hasPhoto === "boolean" ? body.hasPhoto : null;
  if (hasShirt === null && hasPhoto === null) {
    return new Response("hasShirt or hasPhoto is required", { status: 400 });
  }

  const exists = (await sql`
    SELECT 1 FROM crm_players WHERE id = ${id}
  `) as unknown as unknown[];
  if (exists.length === 0) return new Response("Not found", { status: 404 });

  // COALESCE keeps the field the caller didn't send, so the two checkboxes can
  // be toggled independently without one clobbering the other.
  const rows = (await sql`
    INSERT INTO player_checklist (crm_player_id, has_shirt, has_photo)
    VALUES (${id}, COALESCE(${hasShirt}, false), COALESCE(${hasPhoto}, false))
    ON CONFLICT (crm_player_id) DO UPDATE
    SET has_shirt  = COALESCE(${hasShirt}, player_checklist.has_shirt),
        has_photo  = COALESCE(${hasPhoto}, player_checklist.has_photo),
        updated_at = now()
    RETURNING has_shirt, has_photo
  `) as unknown as Array<{ has_shirt: boolean; has_photo: boolean }>;

  return Response.json({ hasShirt: rows[0].has_shirt, hasPhoto: rows[0].has_photo });
}
