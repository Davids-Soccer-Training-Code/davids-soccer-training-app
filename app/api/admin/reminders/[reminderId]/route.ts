import { NextRequest } from "next/server";

import { sql } from "@/db";
import { assertAdmin, getAdminActorId } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// PATCH { status: "done" | "open" } — the Done button, and its undo. Report
// reminders normally close themselves from the data, but a coach can still
// close one by hand (e.g. the player has no account, so no report can exist).
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ reminderId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { reminderId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status === "open" ? "open" : "done";
  const actor = await getAdminActorId(req);

  const rows = (await sql`
    UPDATE coach_reminders
    SET status   = ${status},
        done_at  = CASE WHEN ${status} = 'done' THEN now() ELSE NULL END,
        done_by  = ${status === "done" ? actor : null}
    WHERE id = ${reminderId}
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  if (rows.length === 0) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}
