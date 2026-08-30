import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { COACH_LABELS, COACH_SLUGS, type CoachSlug } from "@/lib/bookingSchedule";
import { CoachSessionsClient, type CoachSession } from "./ui/CoachSessionsClient";

export const dynamic = "force-dynamic";

// `appId` is the app-side account uuid (players.id / parents.id), or null when
// the CRM person has no linked account in this app. `crmId` is the CRM player,
// which every player on a session has — it's what the name links to, so the
// link works even for someone with no app account yet.
type PlayerRef = { appId: string | null; crmId: number; name: string };

type Row = {
  staff_slug: string | null;
  title: string | null;
  date: string;
  start: string;
  end: string;
  parent_app_id: string | null;
  parent_name: string | null;
  players: PlayerRef[];
  location: string | null;
  status: string | null;
  kind: "regular" | "first";
};

// Same attribution the public booking page uses: the assigned coach wins, then
// a "Coach Simon/Simpson" title, otherwise Coach David.
function slugFor(staffSlug: string | null, title: string | null): CoachSlug {
  if (staffSlug && (COACH_SLUGS as readonly string[]).includes(staffSlug)) return staffSlug as CoachSlug;
  const t = (title ?? "").trim().toLowerCase();
  if (t.startsWith("coach simon")) return "simon";
  if (t.startsWith("coach simpson")) return "simpson";
  return "david";
}

export default async function CoachSessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  // Upcoming (not cancelled) sessions from both CRM tables, in Arizona time.
  // session_date is a naive UTC instant (see the booking API), so compare it as
  // UTC and render it in America/Phoenix.
  const rows = (await sql`
    SELECT * FROM (
      SELECT
        st.slug AS staff_slug,
        s.title,
        to_char((s.session_date::timestamptz) AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD') AS date,
        to_char((s.session_date::timestamptz) AT TIME ZONE 'America/Phoenix', 'HH24:MI') AS start,
        to_char((COALESCE(s.session_end_date, s.session_date + interval '1 hour')::timestamptz) AT TIME ZONE 'America/Phoenix', 'HH24:MI') AS "end",
        pa.id AS parent_app_id,
        p.name AS parent_name,
        COALESCE(
          json_agg(json_build_object('appId', app.id, 'crmId', pl.id, 'name', pl.name)
                   ORDER BY pl.name)
            FILTER (WHERE pl.id IS NOT NULL),
          '[]'
        ) AS players,
        s.location,
        s.status,
        'regular' AS kind
      FROM crm_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      LEFT JOIN crm_parents p ON p.id = s.parent_id
      LEFT JOIN parents pa ON pa.crm_parent_id = p.id
      LEFT JOIN crm_session_attendees a ON a.source = 'regular' AND a.session_id = s.id
      LEFT JOIN crm_players pl ON pl.id = a.player_id
      LEFT JOIN players app ON app.crm_player_id = pl.id
      WHERE s.cancelled IS NOT TRUE
        AND (s.session_date::timestamptz) >= now() - interval '3 hours'
      GROUP BY s.id, st.slug, pa.id, p.name
      UNION ALL
      SELECT
        st.slug AS staff_slug,
        s.title,
        to_char((s.session_date::timestamptz) AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD') AS date,
        to_char((s.session_date::timestamptz) AT TIME ZONE 'America/Phoenix', 'HH24:MI') AS start,
        to_char((COALESCE(s.session_end_date, s.session_date + interval '1 hour')::timestamptz) AT TIME ZONE 'America/Phoenix', 'HH24:MI') AS "end",
        pa.id AS parent_app_id,
        p.name AS parent_name,
        COALESCE(
          json_agg(json_build_object('appId', app.id, 'crmId', pl.id, 'name', pl.name)
                   ORDER BY pl.name)
            FILTER (WHERE pl.id IS NOT NULL),
          '[]'
        ) AS players,
        s.location,
        s.status,
        'first' AS kind
      FROM crm_first_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      LEFT JOIN crm_parents p ON p.id = s.parent_id
      LEFT JOIN parents pa ON pa.crm_parent_id = p.id
      LEFT JOIN crm_session_attendees a ON a.source = 'first' AND a.session_id = s.id
      LEFT JOIN crm_players pl ON pl.id = a.player_id
      LEFT JOIN players app ON app.crm_player_id = pl.id
      WHERE s.cancelled IS NOT TRUE
        AND (s.session_date::timestamptz) >= now() - interval '3 hours'
      GROUP BY s.id, st.slug, pa.id, p.name
    ) u
    ORDER BY u.date, u.start
  `) as unknown as Row[];

  // Group into the coach tabs, attributing each session to a coach.
  const byCoach = {} as Record<CoachSlug, CoachSession[]>;
  for (const slug of COACH_SLUGS) byCoach[slug] = [];
  for (const r of rows) {
    const slug = slugFor(r.staff_slug, r.title);
    byCoach[slug].push({
      date: r.date,
      start: r.start,
      end: r.end,
      parentAppId: r.parent_app_id,
      parentName: r.parent_name,
      players: Array.isArray(r.players) ? r.players : [],
      title: r.title,
      location: r.location,
      status: r.status,
      kind: r.kind,
    });
  }

  const coaches = COACH_SLUGS.map((slug) => ({
    slug,
    label: COACH_LABELS[slug],
    sessions: byCoach[slug],
  }));

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Coach Calendar</h1>
            <p className="mt-1 text-sm text-gray-600">
              Upcoming sessions for each coach. Pick a coach to see what they have coming up.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
          >
            Back to admin
          </Link>
        </div>

        <CoachSessionsClient coaches={coaches} />
      </main>
    </div>
  );
}
