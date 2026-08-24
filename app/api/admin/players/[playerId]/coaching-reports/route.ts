import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/adminAuth";
import { sql } from "@/db";
import { getPlayerContact, fireAdminSms } from "@/lib/adminSms";
import { closeRemindersForPlayer } from "@/lib/coachReminders";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> },
) {
  const err = await assertAdmin(req);
  if (err) return err;
  const { playerId } = await ctx.params;

  const rows = (await sql`
    SELECT id, player_id, type, title, report_date::text AS report_date, content, created_at, updated_at
    FROM player_coaching_reports
    WHERE player_id = ${playerId}
    ORDER BY report_date DESC, created_at DESC
  `) as unknown as unknown[];

  return Response.json({ reports: rows });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> },
) {
  const err = await assertAdmin(req);
  if (err) return err;
  const { playerId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    type?: string;
    title?: string;
    report_date?: string;
    content?: Record<string, unknown>;
  } | null;

  const type = String(body?.type ?? "").trim();
  if (!["baseline", "progress", "blurb"].includes(type))
    return new Response("type must be baseline, progress, or blurb", { status: 400 });

  const title = String(body?.title ?? "").trim();
  if (!title) return new Response("title is required", { status: 400 });

  const reportDate = body?.report_date && /^\d{4}-\d{2}-\d{2}$/.test(body.report_date)
    ? body.report_date
    : new Date().toISOString().slice(0, 10);

  const content = body?.content && typeof body.content === "object" ? body.content : {};

  const rows = (await sql`
    INSERT INTO player_coaching_reports (player_id, type, title, report_date, content)
    VALUES (${playerId}, ${type}, ${title}, ${reportDate}::date, ${JSON.stringify(content)}::jsonb)
    RETURNING id, player_id, type, title, report_date::text AS report_date, content, created_at, updated_at
  `) as unknown as unknown[];

  const report = (rows as Record<string, unknown>[])[0];

  // Any reminder this report answers closes now rather than on the next hourly
  // sweep, so a coach who walks back to their list sees it gone.
  await closeRemindersForPlayer(playerId);

  const typeLabel = type === "baseline" ? "Baseline Snapshot" : type === "progress" ? "Progress Report" : "Coach's Note";
  const contact = await getPlayerContact(playerId);
  if (contact?.phone) {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    fireAdminSms(
      contact.phone,
      `Hi! Coach David just posted a new ${typeLabel} for ${contact.player_name}: "${title}". Read it here: ${appUrl}/player/${playerId}/reports`
    );
  }

  return Response.json({ report }, { status: 201 });
}
