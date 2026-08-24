import { NextRequest } from "next/server";

import { assertAdmin } from "@/lib/adminAuth";
import { sql } from "@/db";
import { getPlayerContact, fireAdminSms } from "@/lib/adminSms";
import { closeRemindersForPlayer } from "@/lib/coachReminders";

function parseDate(raw: unknown): string | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { error: "date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: "date must be YYYY-MM-DD" };
  return s;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> },
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;

  const goalRows = (await sql`
    SELECT
      id,
      player_id,
      title,
      description,
      start_date::text AS start_date,
      end_date::text   AS end_date,
      created_at,
      updated_at
    FROM player_period_goals
    WHERE player_id = ${playerId}
    ORDER BY start_date DESC
  `) as unknown as Array<{
    id: string;
    player_id: string;
    title: string;
    description: string | null;
    start_date: string;
    end_date: string;
    created_at: string;
    updated_at: string;
  }>;

  const stepRows = (await sql`
    SELECT
      s.id,
      s.period_goal_id,
      s.title,
      s.description,
      s.target_date::text AS target_date,
      s.completed,
      s.completed_at,
      s.sort_order
    FROM player_goal_steps s
    JOIN player_period_goals g ON g.id = s.period_goal_id
    WHERE g.player_id = ${playerId}
    ORDER BY s.sort_order ASC, s.created_at ASC
  `) as unknown as Array<{
    id: string;
    period_goal_id: string;
    title: string;
    description: string | null;
    target_date: string | null;
    completed: boolean;
    completed_at: string | null;
    sort_order: number;
  }>;

  const stepsByGoal = new Map<string, typeof stepRows>();
  for (const step of stepRows) {
    const list = stepsByGoal.get(step.period_goal_id) ?? [];
    list.push(step);
    stepsByGoal.set(step.period_goal_id, list);
  }

  const goals = goalRows.map((g) => ({ ...g, steps: stepsByGoal.get(g.id) ?? [] }));
  return Response.json({ goals });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> },
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string | null;
    start_date?: string;
    end_date?: string;
  } | null;

  const title = String(body?.title ?? "").trim();
  if (!title) return new Response("title is required", { status: 400 });

  const startDate = parseDate(body?.start_date);
  if (typeof startDate === "object") return new Response(startDate.error, { status: 400 });

  const endDate = parseDate(body?.end_date);
  if (typeof endDate === "object") return new Response(endDate.error, { status: 400 });

  const description = body?.description ? String(body.description).trim() || null : null;

  const rows = (await sql`
    INSERT INTO player_period_goals (player_id, title, description, start_date, end_date)
    VALUES (${playerId}, ${title}, ${description}, ${startDate}::date, ${endDate}::date)
    RETURNING
      id,
      player_id,
      title,
      description,
      start_date::text AS start_date,
      end_date::text   AS end_date,
      created_at,
      updated_at
  `) as unknown as Array<{
    id: string;
    player_id: string;
    title: string;
    description: string | null;
    start_date: string;
    end_date: string;
    created_at: string;
    updated_at: string;
  }>;

  // A live goal is exactly what the "set a period goal" reminder was asking
  // for, so close it here instead of leaving it up until the next sweep.
  await closeRemindersForPlayer(playerId);

  const contact = await getPlayerContact(playerId);
  if (contact?.phone) {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    fireAdminSms(
      contact.phone,
      `Hi! Coach David just set a new goal for ${contact.player_name}: "${title}". Check it out: ${appUrl}/player/${playerId}/goals`
    );
  }

  return Response.json({ goal: { ...rows[0], steps: [] } }, { status: 201 });
}
