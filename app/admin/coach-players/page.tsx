import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { COACH_LABELS, COACH_SLUGS, type CoachSlug } from "@/lib/bookingSchedule";
import { CoachPlayersClient, type CoachPlayer } from "./ui/CoachPlayersClient";

export const dynamic = "force-dynamic";

type Row = {
  coach: string;
  crm_player_id: number;
  name: string;
  app_id: string | null;
  parent_name: string | null;
  parent_app_id: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  second_parent_name: string | null;
  with_coach: number;
  last_session: string | null;
  upcoming: number;
  next_session: string | null;
  recent: boolean;
  package_type: string | null;
  total_sessions: number | null;
  done: number;
  booked: number;
  siblings: number;
  has_shirt: boolean;
  has_photo: boolean;
  age: number | null;
  birthdate: string | null;
  team: string | null;
  position: string | null;
  secondary_position: string | null;
  coach_notes: string | null;
  crm_notes: string | null;
  unconfirmed: boolean;
};

export default async function CoachPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; player?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  // The coach calendar links a player's name straight to their card here. The
  // tab has to come with it: the player may well not be on whichever tab this
  // page opens on by default.
  const { coach, player } = await searchParams;
  const initialCoach = (COACH_SLUGS as readonly string[]).includes(coach ?? "")
    ? (coach as CoachSlug)
    : null;
  const focusPlayer = Number.isFinite(Number(player)) && player ? Number(player) : null;

  // Every player a coach has trained or has booked, from both CRM session
  // tables.
  //
  // Who is on a session comes from crm_session_attendees, which reads the
  // junction tables *and* the older single-player column on the session row —
  // the CRM writes whichever suits how the session was created, and reading
  // only the junction tables is what kept a booked first session off the
  // roster until someone attached the player by hand.
  //
  // Coach attribution matches the Coach Calendar exactly (the assigned coach
  // wins, then a "Coach Simon/Simpson" title, otherwise David) so a player
  // can't appear on one page's list and a different page's calendar.
  //
  // Packages hang off the parent, not the player, and `sessions_completed` on
  // crm_packages has drifted badly out of date — so sessions used is counted
  // live from the sessions actually carrying that package_id.
  const rows = (await sql`
    WITH att AS (
      SELECT
        CASE
          WHEN st.slug = ANY(${COACH_SLUGS as unknown as string[]}) THEN st.slug
          WHEN lower(btrim(s.title)) LIKE 'coach simpson%' THEN 'simpson'
          WHEN lower(btrim(s.title)) LIKE 'coach simon%'   THEN 'simon'
          ELSE 'david'
        END AS coach,
        pl.id AS crm_player_id,
        s.session_date,
        ((s.session_date::timestamptz) <= now()) AS is_past,
        false AS inferred
      FROM crm_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      JOIN crm_session_attendees a ON a.source = 'regular' AND a.session_id = s.id
      JOIN crm_players pl ON pl.id = a.player_id
      WHERE s.cancelled IS NOT TRUE
      UNION ALL
      SELECT
        CASE
          WHEN st.slug = ANY(${COACH_SLUGS as unknown as string[]}) THEN st.slug
          WHEN lower(btrim(s.title)) LIKE 'coach simpson%' THEN 'simpson'
          WHEN lower(btrim(s.title)) LIKE 'coach simon%'   THEN 'simon'
          ELSE 'david'
        END AS coach,
        pl.id,
        s.session_date,
        ((s.session_date::timestamptz) <= now()) AS is_past,
        false
      FROM crm_first_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      JOIN crm_session_attendees a ON a.source = 'first' AND a.session_id = s.id
      JOIN crm_players pl ON pl.id = a.player_id
      WHERE s.cancelled IS NOT TRUE
      -- A session can be booked without anyone attaching a player to it — a
      -- first session booked off a phone call, most often. The session is real
      -- and the coach still has to show up for it, so fall back to the family
      -- on the booking and flag the card rather than dropping the session off
      -- the roster entirely.
      --
      -- Upcoming sessions only. Doing this for past ones would credit every
      -- sibling in the family with a session only one of them attended, which
      -- inflates session counts, package math and the score card. A booking
      -- ahead carries none of that weight — it just says "someone from this
      -- family is coming, go find out who".
      UNION ALL
      SELECT
        CASE
          WHEN st.slug = ANY(${COACH_SLUGS as unknown as string[]}) THEN st.slug
          WHEN lower(btrim(s.title)) LIKE 'coach simpson%' THEN 'simpson'
          WHEN lower(btrim(s.title)) LIKE 'coach simon%'   THEN 'simon'
          ELSE 'david'
        END AS coach,
        pl.id,
        s.session_date,
        ((s.session_date::timestamptz) <= now()) AS is_past,
        true
      FROM crm_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      JOIN crm_players pl ON pl.parent_id = s.parent_id
      WHERE s.cancelled IS NOT TRUE
        AND (s.session_date::timestamptz) > now()
        AND NOT EXISTS (
          SELECT 1 FROM crm_session_attendees a
          WHERE a.source = 'regular' AND a.session_id = s.id
        )
      UNION ALL
      SELECT
        CASE
          WHEN st.slug = ANY(${COACH_SLUGS as unknown as string[]}) THEN st.slug
          WHEN lower(btrim(s.title)) LIKE 'coach simpson%' THEN 'simpson'
          WHEN lower(btrim(s.title)) LIKE 'coach simon%'   THEN 'simon'
          ELSE 'david'
        END AS coach,
        pl.id,
        s.session_date,
        ((s.session_date::timestamptz) <= now()) AS is_past,
        true
      FROM crm_first_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      JOIN crm_players pl ON pl.parent_id = s.parent_id
      WHERE s.cancelled IS NOT TRUE
        AND (s.session_date::timestamptz) > now()
        AND NOT EXISTS (
          SELECT 1 FROM crm_session_attendees a
          WHERE a.source = 'first' AND a.session_id = s.id
        )
    ),
    -- One active package per family; if there are several, the most recent one.
    pkg AS (
      SELECT DISTINCT ON (parent_id) parent_id, id, total_sessions, package_type
      FROM crm_packages
      WHERE is_active
      ORDER BY parent_id, start_date DESC NULLS LAST, id DESC
    ),
    -- A session booked for next week has not been used yet. Counting it as
    -- used is what made a package with nothing delivered read "1 of 6 used".
    used AS (
      SELECT
        package_id,
        count(*) FILTER (WHERE (session_date::timestamptz) <= now())::int AS done,
        count(*) FILTER (WHERE (session_date::timestamptz) >  now())::int AS booked
      FROM crm_sessions
      WHERE package_id IS NOT NULL AND cancelled IS NOT TRUE
      GROUP BY package_id
    )
    SELECT
      a.coach,
      pl.id           AS crm_player_id,
      pl.name,
      app.id          AS app_id,
      p.name          AS parent_name,
      pa.id           AS parent_app_id,
      -- The CRM is where a parent's number actually gets kept up to date, so it
      -- wins; the app account is the fallback for families added through
      -- signup rather than through the CRM.
      COALESCE(NULLIF(btrim(p.phone), ''), NULLIF(btrim(pa.phone), '')) AS parent_phone,
      COALESCE(NULLIF(btrim(p.email), ''), NULLIF(btrim(pa.email), '')) AS parent_email,
      NULLIF(btrim(p.secondary_parent_name), '') AS second_parent_name,
      count(*) FILTER (WHERE a.is_past)::int AS with_coach,
      to_char((max(a.session_date) FILTER (WHERE a.is_past))::timestamptz
                AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD') AS last_session,
      count(*) FILTER (WHERE NOT a.is_past)::int AS upcoming,
      to_char((min(a.session_date) FILTER (WHERE NOT a.is_past))::timestamptz
                AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD') AS next_session,
      -- A player with nothing behind them yet is not "recent"; the COALESCE
      -- keeps that a real false rather than a null from an empty max().
      COALESCE(
        max(a.session_date) FILTER (WHERE a.is_past)::timestamptz
          >= now() - interval '6 weeks',
        false
      ) AS recent,
      pk.package_type,
      pk.total_sessions,
      COALESCE(u.done, 0) AS done,
      COALESCE(u.booked, 0) AS booked,
      (SELECT count(*)::int FROM crm_players sib WHERE sib.parent_id = pl.parent_id) AS siblings,
      COALESCE(pc.has_shirt, false) AS has_shirt,
      COALESCE(pc.has_photo, false) AS has_photo,
      -- The player's own details, resolved best-source-first. The app account
      -- wins because that's what the profile page and printed sheet show; the
      -- app-side details table catches players who had no account when a coach
      -- typed them in; the CRM is the original intake answer.
      COALESCE(app.age, pd.age, pl.age) AS age,
      app.birthdate::text AS birthdate,
      COALESCE(
        NULLIF(btrim(app.team_level), ''),
        NULLIF(btrim(pd.team), ''),
        NULLIF(btrim(pl.team), '')
      ) AS team,
      COALESCE(
        NULLIF(btrim(app.primary_position), ''),
        NULLIF(btrim(pd.position), '')
      ) AS position,
      NULLIF(btrim(app.secondary_position), '') AS secondary_position,
      COALESCE(
        NULLIF(btrim(app.long_term_development_notes), ''),
        NULLIF(btrim(pd.notes), '')
      ) AS coach_notes,
      NULLIF(btrim(pl.notes), '') AS crm_notes,
      -- An upcoming session with no player attached in the CRM, matched to
      -- this player only because they're in the family on the booking.
      COALESCE(bool_or(a.inferred) FILTER (WHERE NOT a.is_past), false) AS unconfirmed
    FROM att a
    JOIN crm_players pl ON pl.id = a.crm_player_id
    LEFT JOIN crm_parents p ON p.id = pl.parent_id
    LEFT JOIN parents pa ON pa.crm_parent_id = p.id
    LEFT JOIN players app ON app.crm_player_id = pl.id
    LEFT JOIN pkg pk ON pk.parent_id = pl.parent_id
    LEFT JOIN used u ON u.package_id = pk.id
    LEFT JOIN player_checklist pc ON pc.crm_player_id = pl.id
    LEFT JOIN player_details pd ON pd.crm_player_id = pl.id
    GROUP BY a.coach, pl.id, pl.name, pl.parent_id, app.id, p.name, pa.id,
             p.phone, p.email, p.secondary_parent_name, pa.phone, pa.email,
             pk.package_type, pk.total_sessions, u.done, u.booked,
             pc.has_shirt, pc.has_photo,
             pl.age, pl.team, pl.notes, pd.age, pd.team, pd.position, pd.notes,
             app.age, app.birthdate, app.team_level, app.primary_position,
             app.secondary_position, app.long_term_development_notes
    -- A player booked for next week but never yet trained belongs on the
    -- roster: that session is exactly what the coach needs to prepare for.
    -- They sort first (nulls first here, then pinned to the top in the client)
    -- rather than trailing the players with the oldest history.
    ORDER BY max(a.session_date) FILTER (WHERE a.is_past) DESC NULLS FIRST
  `) as unknown as Row[];

  const byCoach = {} as Record<CoachSlug, CoachPlayer[]>;
  for (const slug of COACH_SLUGS) byCoach[slug] = [];

  // A player shows up once per coach who has trained them, so the same player
  // can appear on several tabs. Collect every coach per player first, to tell
  // each card who else has had this player.
  const coachesByPlayer = new Map<number, CoachSlug[]>();
  for (const r of rows) {
    const slug = r.coach as CoachSlug;
    if (!byCoach[slug]) continue;
    const seen = coachesByPlayer.get(r.crm_player_id) ?? [];
    if (!seen.includes(slug)) seen.push(slug);
    coachesByPlayer.set(r.crm_player_id, seen);
  }

  for (const r of rows) {
    const slug = r.coach as CoachSlug;
    if (!byCoach[slug]) continue;
    byCoach[slug].push({
      otherCoaches: (coachesByPlayer.get(r.crm_player_id) ?? [])
        .filter((s) => s !== slug)
        .map((s) => COACH_LABELS[s]),
      crmPlayerId: r.crm_player_id,
      appId: r.app_id,
      hasShirt: r.has_shirt,
      hasPhoto: r.has_photo,
      name: r.name,
      age: r.age,
      birthdate: r.birthdate,
      team: r.team,
      position: r.position,
      secondaryPosition: r.secondary_position,
      coachNotes: r.coach_notes,
      crmNotes: r.crm_notes,
      unconfirmed: r.unconfirmed,
      parentName: r.parent_name,
      parentAppId: r.parent_app_id,
      parentPhone: r.parent_phone,
      parentEmail: r.parent_email,
      secondParentName: r.second_parent_name,
      withCoach: r.with_coach,
      lastSession: r.last_session,
      upcoming: r.upcoming,
      nextSession: r.next_session,
      // A booked session ahead counts as being in the program, even if the last
      // one was more than six weeks ago.
      active: r.recent || r.upcoming > 0,
      recent: r.recent,
      pkg:
        r.package_type && r.total_sessions != null
          ? {
              type: r.package_type,
              total: r.total_sessions,
              done: r.done,
              booked: r.booked,
              // Sessions not yet delivered — booked ones included, since a
              // booking hasn't happened yet.
              left: Math.max(0, r.total_sessions - r.done),
              // Of those, the ones with no date on the calendar yet.
              unbooked: Math.max(0, r.total_sessions - r.done - r.booked),
              shared: r.siblings > 1,
            }
          : null,
    });
  }

  // Players with something on the calendar float to the top — that's who the
  // coach needs to prepare for. Everyone else keeps most-recent-first.
  for (const slug of COACH_SLUGS) {
    byCoach[slug].sort((a, b) => {
      if (a.upcoming > 0 !== b.upcoming > 0) return a.upcoming > 0 ? -1 : 1;
      if (a.upcoming > 0 && b.upcoming > 0) {
        return (a.nextSession ?? "").localeCompare(b.nextSession ?? "");
      }
      // A player with no history yet sorts last among the ones with nothing
      // booked — there's nothing for the coach to prepare from.
      return (b.lastSession ?? "").localeCompare(a.lastSession ?? "");
    });
  }

  const coaches = COACH_SLUGS.map((slug) => ({
    slug,
    label: COACH_LABELS[slug],
    players: byCoach[slug],
  }));

  const total = rows.length;

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Coach Players</h1>
            <p className="mt-1 text-sm text-gray-600">
              {total === 0
                ? "No players yet."
                : "Players each coach trains or has booked, with package balances and session counts."}
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
          >
            Back to admin
          </Link>
        </div>

        <CoachPlayersClient
          coaches={coaches}
          initialCoach={initialCoach}
          focusPlayer={focusPlayer}
        />
      </main>
    </div>
  );
}
