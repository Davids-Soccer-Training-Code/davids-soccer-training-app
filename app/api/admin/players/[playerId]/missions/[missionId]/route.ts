import { NextRequest } from "next/server";
import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { EARNED_RANKS } from "@/lib/rankSystem";
import type { Mission } from "@/lib/getPlayerRank";

export const dynamic = "force-dynamic";

const VALID_RANKS = new Set<string>(EARNED_RANKS);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string; missionId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId, missionId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Partial<{
    target_rank: string;
    test_category: string | null;
    title: string;
    description: string | null;
    video_url: string | null;
    is_youtube: boolean;
    status: "assigned" | "completed";
  }> | null;

  if (!body) return new Response("Invalid JSON", { status: 400 });

  if (body.target_rank !== undefined && !VALID_RANKS.has(body.target_rank)) {
    return new Response("target_rank must be a valid rank", { status: 400 });
  }
  if (body.status !== undefined && !["assigned", "completed"].includes(body.status)) {
    return new Response("invalid status", { status: 400 });
  }
  if (body.title !== undefined && !String(body.title).trim()) {
    return new Response("title cannot be empty", { status: 400 });
  }

  const wantsRank = body.target_rank !== undefined;
  const wantsCategory = body.test_category !== undefined;
  const wantsTitle = body.title !== undefined;
  const wantsDescription = body.description !== undefined;
  const wantsVideo = body.video_url !== undefined;
  const wantsYoutube = body.is_youtube !== undefined;
  const wantsStatus = body.status !== undefined;

  const title = wantsTitle ? String(body.title).trim() : null;
  const description = wantsDescription
    ? body.description
      ? String(body.description).trim() || null
      : null
    : null;
  const testCategory = wantsCategory
    ? body.test_category
      ? String(body.test_category).trim() || null
      : null
    : null;
  const videoUrl = wantsVideo
    ? body.video_url
      ? String(body.video_url).trim() || null
      : null
    : null;

  const rows = (await sql`
    UPDATE player_missions
    SET
      target_rank   = CASE WHEN ${wantsRank} THEN ${body.target_rank ?? null} ELSE target_rank END,
      test_category = CASE WHEN ${wantsCategory} THEN ${testCategory} ELSE test_category END,
      title         = CASE WHEN ${wantsTitle} THEN ${title} ELSE title END,
      description   = CASE WHEN ${wantsDescription} THEN ${description} ELSE description END,
      video_url     = CASE WHEN ${wantsVideo} THEN ${videoUrl} ELSE video_url END,
      is_youtube    = CASE WHEN ${wantsYoutube} THEN ${body.is_youtube === true} ELSE is_youtube END,
      status        = CASE WHEN ${wantsStatus} THEN ${body.status ?? null} ELSE status END,
      completed_at  = CASE
                        WHEN ${wantsStatus} AND ${body.status === "completed"} THEN now()
                        WHEN ${wantsStatus} AND ${body.status === "assigned"} THEN NULL
                        ELSE completed_at
                      END
    WHERE id = ${missionId} AND player_id = ${playerId}
    RETURNING
      id, player_id, target_rank, test_category, title, description,
      video_url, is_youtube, status, completed_at::text AS completed_at,
      created_at::text AS created_at, updated_at::text AS updated_at
  `) as unknown as Mission[];

  const mission = rows[0];
  if (!mission) return new Response("Not found", { status: 404 });

  return Response.json({ mission });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string; missionId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId, missionId } = await ctx.params;

  const rows = (await sql`
    DELETE FROM player_missions
    WHERE id = ${missionId} AND player_id = ${playerId}
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  if (!rows[0]) return new Response("Not found", { status: 404 });

  return Response.json({ ok: true });
}
