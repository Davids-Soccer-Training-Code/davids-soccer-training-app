import { NextRequest } from "next/server";

import { assertAdmin } from "@/lib/adminAuth";
import { sql } from "@/db";
import { getTestDefinitionByName } from "@/lib/testDefinitions";

type PlayerTestRow = {
  id: string;
  player_id: string;
  test_name: string;
  test_date: string; // YYYY-MM-DD
  scores: unknown;
  created_at: string;
  updated_at: string;
};

function cleanScores(testName: string, scores: Record<string, unknown>) {
  const def = getTestDefinitionByName(testName);
  if (!def) return { ok: false as const, error: "Unknown test_name" };

  const cleaned: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = scores[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      cleaned[f.key] = n;
    } else {
      cleaned[f.key] = String(v);
    }
  }

  return { ok: true as const, cleaned };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string; testId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId, testId } = await ctx.params;

  const rows = (await sql`
    SELECT
      id,
      player_id,
      test_name,
      test_date::text AS test_date,
      scores,
      created_at,
      updated_at
    FROM player_tests
    WHERE id = ${testId} AND player_id = ${playerId}
    LIMIT 1
  `) as unknown as PlayerTestRow[];

  const test = rows[0];
  if (!test) return new Response("Not found", { status: 404 });

  return Response.json({ test });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string; testId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId, testId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Partial<{
    test_name: string;
    test_date: string; // YYYY-MM-DD
    scores: Record<string, unknown>;
  }> | null;

  const wantsName = body?.test_name !== undefined;
  const wantsDate = body?.test_date !== undefined;
  const wantsScores = body?.scores !== undefined;

  if (!wantsName && !wantsDate && !wantsScores) {
    return new Response("Nothing to update.", { status: 400 });
  }

  // If we need to clean scores, we need to know the effective test_name.
  let effectiveTestName: string | null = null;
  if (wantsName) {
    effectiveTestName = String(body?.test_name ?? "").trim();
    if (!effectiveTestName) {
      return new Response("test_name cannot be empty", { status: 400 });
    }
  } else if (wantsScores) {
    const existing = (await sql`
      SELECT test_name
      FROM player_tests
      WHERE id = ${testId} AND player_id = ${playerId}
      LIMIT 1
    `) as unknown as Array<{ test_name: string }>;
    if (!existing[0]) return new Response("Not found", { status: 404 });
    effectiveTestName = existing[0].test_name;
  }

  const testDate = wantsDate ? String(body?.test_date ?? "").trim() : null;
  if (wantsDate && (!testDate || !/^\d{4}-\d{2}-\d{2}$/.test(testDate))) {
    return new Response("test_date must be YYYY-MM-DD", { status: 400 });
  }

  let cleanedScoresJson: string | null = null;
  if (wantsScores) {
    const raw = (body?.scores ?? {}) as Record<string, unknown>;
    const cleaned = cleanScores(effectiveTestName ?? "", raw);
    if (!cleaned.ok) return new Response(cleaned.error, { status: 400 });
    cleanedScoresJson = JSON.stringify(cleaned.cleaned);
  }

  const rows = (await sql`
    UPDATE player_tests
    SET
      test_name = CASE WHEN ${wantsName} THEN ${effectiveTestName} ELSE test_name END,
      test_date = CASE WHEN ${wantsDate} THEN ${testDate}::date ELSE test_date END,
      scores = CASE WHEN ${wantsScores} THEN ${cleanedScoresJson}::jsonb ELSE scores END
    WHERE id = ${testId} AND player_id = ${playerId}
    RETURNING
      id,
      player_id,
      test_name,
      test_date::text AS test_date,
      scores,
      created_at,
      updated_at
  `) as unknown as PlayerTestRow[];

  const test = rows[0];
  if (!test) return new Response("Not found", { status: 404 });

  return Response.json({ test });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string; testId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId, testId } = await ctx.params;

  const rows = (await sql`
    DELETE FROM player_tests
    WHERE id = ${testId} AND player_id = ${playerId}
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  if (!rows[0]) return new Response("Not found", { status: 404 });

  return Response.json({ ok: true });
}
