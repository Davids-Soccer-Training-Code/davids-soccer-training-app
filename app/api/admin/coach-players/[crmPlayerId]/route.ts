import { NextRequest } from "next/server";

import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** Trimmed text, with an empty string meaning "clear it". */
function parseText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * Toggle the kit/photo checkboxes on a player's coach-roster card, and edit
 * the player's own details (age, team, position, notes).
 *
 * Coach-accessible (no owner code): this is the coaches' own admin surface,
 * and keeping a roster up to date is exactly the work they're there to do.
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
    age?: unknown;
    team?: unknown;
    position?: unknown;
    notes?: unknown;
  };

  const hasShirt = typeof body.hasShirt === "boolean" ? body.hasShirt : null;
  const hasPhoto = typeof body.hasPhoto === "boolean" ? body.hasPhoto : null;

  const team = parseText(body.team);
  const position = parseText(body.position);
  const notes = parseText(body.notes);

  let age: number | null | undefined = undefined;
  if (body.age !== undefined) {
    if (body.age === null || String(body.age).trim() === "") {
      age = null;
    } else {
      const parsed = Number(body.age);
      // A roster is players, not staff: anything outside this is a typo.
      if (!Number.isInteger(parsed) || parsed < 3 || parsed > 25) {
        return new Response("Age must be a whole number from 3 to 25.", {
          status: 400,
        });
      }
      age = parsed;
    }
  }

  const hasDetails =
    age !== undefined ||
    team !== undefined ||
    position !== undefined ||
    notes !== undefined;

  if (hasShirt === null && hasPhoto === null && !hasDetails) {
    return new Response("Nothing to update", { status: 400 });
  }

  // The app account, when there is one. Details belong on it rather than in the
  // app-side details table, so the roster card and the player's own profile
  // page can't drift apart.
  const players = (await sql`
    SELECT app.id
    FROM crm_players pl
    LEFT JOIN players app ON app.crm_player_id = pl.id
    WHERE pl.id = ${id}
    LIMIT 1
  `) as unknown as Array<{ id: string | null }>;
  if (players.length === 0) return new Response("Not found", { status: 404 });
  const appId = players[0].id;

  if (hasShirt !== null || hasPhoto !== null) {
    // COALESCE keeps the field the caller didn't send, so the two checkboxes can
    // be toggled independently without one clobbering the other.
    await sql`
      INSERT INTO player_checklist (crm_player_id, has_shirt, has_photo)
      VALUES (${id}, COALESCE(${hasShirt}, false), COALESCE(${hasPhoto}, false))
      ON CONFLICT (crm_player_id) DO UPDATE
      SET has_shirt  = COALESCE(${hasShirt}, player_checklist.has_shirt),
          has_photo  = COALESCE(${hasPhoto}, player_checklist.has_photo),
          updated_at = now()
    `;
  }

  if (hasDetails) {
    // A field the caller left out keeps its stored value; one sent as null is
    // cleared. That's what the CASE pairs below say, on both write paths.
    if (appId) {
      await sql`
        UPDATE players
        SET age = CASE WHEN ${age !== undefined} THEN ${age ?? null}::int ELSE age END,
            team_level = CASE
              WHEN ${team !== undefined} THEN ${team ?? null}::text ELSE team_level END,
            primary_position = CASE
              WHEN ${position !== undefined} THEN ${position ?? null}::text
              ELSE primary_position END,
            long_term_development_notes = CASE
              WHEN ${notes !== undefined} THEN ${notes ?? null}::text
              ELSE long_term_development_notes END,
            updated_at = now()
        WHERE id = ${appId}
      `;
    } else {
      await sql`
        INSERT INTO player_details (crm_player_id, age, team, position, notes)
        VALUES (${id}, ${age ?? null}, ${team ?? null}, ${position ?? null}, ${notes ?? null})
        ON CONFLICT (crm_player_id) DO UPDATE
        SET age = CASE
              WHEN ${age !== undefined} THEN ${age ?? null}::int ELSE player_details.age END,
            team = CASE
              WHEN ${team !== undefined} THEN ${team ?? null}::text
              ELSE player_details.team END,
            position = CASE
              WHEN ${position !== undefined} THEN ${position ?? null}::text
              ELSE player_details.position END,
            notes = CASE
              WHEN ${notes !== undefined} THEN ${notes ?? null}::text
              ELSE player_details.notes END,
            updated_at = now()
      `;
    }
  }

  return Response.json({ ok: true });
}
