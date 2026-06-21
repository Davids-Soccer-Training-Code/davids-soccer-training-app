import { NextRequest } from "next/server";
import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { EARNED_RANKS } from "@/lib/rankSystem";
import type { Mission } from "@/lib/getPlayerRank";

export const dynamic = "force-dynamic";

const VALID_RANKS = new Set<string>(EARNED_RANKS);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;

  const rows = (await sql`
    SELECT
      id, player_id, target_rank, test_category, title, description,
      video_url, is_youtube, status, completed_at::text AS completed_at,
      created_at::text AS created_at, updated_at::text AS updated_at
    FROM player_missions
    WHERE player_id = ${playerId}
    ORDER BY created_at DESC
  `) as unknown as Mission[];

  return Response.json({ missions: rows });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    target_rank?: unknown;
    test_category?: unknown;
    title?: unknown;
    description?: unknown;
    video_url?: unknown;
    is_youtube?: unknown;
  } | null;

  const targetRank = String(body?.target_rank ?? "").trim();
  const title = String(body?.title ?? "").trim();

  if (!VALID_RANKS.has(targetRank)) {
    return new Response("target_rank must be a valid rank", { status: 400 });
  }
  if (!title) return new Response("title is required", { status: 400 });

  const description =
    body?.description && typeof body.description === "string"
      ? body.description.trim() || null
      : null;
  const testCategory =
    body?.test_category && typeof body.test_category === "string"
      ? body.test_category.trim() || null
      : null;
  const videoUrl =
    body?.video_url && typeof body.video_url === "string"
      ? body.video_url.trim() || null
      : null;

  const rows = (await sql`
    INSERT INTO player_missions
      (player_id, target_rank, test_category, title, description, video_url, is_youtube)
    VALUES (
      ${playerId}, ${targetRank}, ${testCategory}, ${title},
      ${description}, ${videoUrl}, ${body?.is_youtube === true}
    )
    RETURNING
      id, player_id, target_rank, test_category, title, description,
      video_url, is_youtube, status, completed_at::text AS completed_at,
      created_at::text AS created_at, updated_at::text AS updated_at
  `) as unknown as Mission[];

  return Response.json({ mission: rows[0] }, { status: 201 });
}
