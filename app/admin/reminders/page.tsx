import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { COACH_LABELS, COACH_SLUGS, type CoachSlug } from "@/lib/bookingSchedule";
import { RemindersClient, type Reminder } from "./ui/RemindersClient";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  coach_slug: string;
  kind: string;
  anchor_date: string;
  created_at: string;
  name: string;
  app_id: string | null;
  parent_name: string | null;
};

export default async function RemindersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  // The app account is resolved here rather than stored on the reminder, so a
  // player who gets an account later picks up a working link with no backfill.
  const rows = (await sql`
    SELECT
      cr.id,
      cr.coach_slug,
      cr.kind,
      cr.anchor_date::text AS anchor_date,
      cr.created_at,
      pl.name,
      app.id AS app_id,
      p.name AS parent_name
    FROM coach_reminders cr
    JOIN crm_players pl ON pl.id = cr.crm_player_id
    LEFT JOIN crm_parents p ON p.id = pl.parent_id
    LEFT JOIN players app ON app.crm_player_id = pl.id
    WHERE cr.status = 'open'
    ORDER BY cr.created_at ASC, cr.anchor_date ASC
  `) as unknown as Row[];

  const byCoach = {} as Record<CoachSlug, Reminder[]>;
  for (const slug of COACH_SLUGS) byCoach[slug] = [];

  for (const r of rows) {
    const slug = r.coach_slug as CoachSlug;
    if (!byCoach[slug]) continue;
    byCoach[slug].push({
      id: r.id,
      kind: r.kind as Reminder["kind"],
      anchorDate: r.anchor_date,
      createdAt: String(r.created_at),
      playerName: r.name,
      parentName: r.parent_name,
      appId: r.app_id,
    });
  }

  const coaches = COACH_SLUGS.map((slug) => ({
    slug,
    label: COACH_LABELS[slug],
    reminders: byCoach[slug],
  }));

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Reminders</h1>
            <p className="mt-1 text-sm text-gray-600">
              {rows.length === 0
                ? "Nothing outstanding."
                : `${rows.length} open across all coaches. Generated hourly.`}
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
          >
            Back to admin
          </Link>
        </div>

        <RemindersClient coaches={coaches} />
      </main>
    </div>
  );
}
