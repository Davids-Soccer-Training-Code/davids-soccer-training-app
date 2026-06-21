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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;

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
    WHERE player_id = ${playerId}
    ORDER BY test_date DESC, created_at DESC
  `) as unknown as PlayerTestRow[];

  return Response.json({ tests: rows });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    test_name?: string;
    test_date?: string;
    scores?: Record<string, unknown>;
  } | null;

  const testName = String(body?.test_name ?? "").trim();
  const testDate = String(body?.test_date ?? "").trim();
  const scores = (body?.scores ?? {}) as Record<string, unknown>;

  if (!testName) return new Response("test_name is required", { status: 400 });
  if (!testDate || !/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    return new Response("test_date must be YYYY-MM-DD", { status: 400 });
  }

  const def = getTestDefinitionByName(testName);
  if (!def) return new Response("Unknown test_name", { status: 400 });

  const cleaned: Record<string, unknown> = {};
  // Only keep keys we recognize for that test (and coerce numbers where possible).
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

  const rows = (await sql`
    INSERT INTO player_tests (player_id, test_name, test_date, scores)
    VALUES (${playerId}, ${testName}, ${testDate}::date, ${JSON.stringify(
    cleaned
  )}::jsonb)
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

  return Response.json({ test }, { status: 201 });
}
