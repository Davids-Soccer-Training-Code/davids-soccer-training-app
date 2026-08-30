import "server-only";

import { sql } from "@/db";

// The reminder rules. Generation and closing live together so a rule and the
// condition that satisfies it can't drift apart.
//
// Everything is scoped to a recent-activity window: without it, the first run
// would open a reminder for every session and every player the CRM has ever
// held, and the page would be unusable on day one.
export type ReminderKind =
  | "mini_note"
  | "initial_report"
  | "progress_report"
  | "parent_checkin"
  | "media"
  | "data_collection"
  | "goal_setup"
  | "goal_checkin";

// Report reminders point at a report type; the other two have no artifact.
export const REPORT_TYPE: Partial<Record<ReminderKind, "blurb" | "baseline" | "progress">> = {
  mini_note: "blurb",
  initial_report: "baseline",
  progress_report: "progress",
};

export const KIND_LABEL: Record<ReminderKind, string> = {
  mini_note: "Session note",
  initial_report: "Initial report",
  progress_report: "Progress report",
  parent_checkin: "Parent check-in",
  media: "Photos & video",
  data_collection: "Collect test data",
  goal_setup: "Set a period goal",
  goal_checkin: "Goal check-in",
};

export const KIND_ORDER: ReminderKind[] = [
  "media",
  "mini_note",
  "progress_report",
  "initial_report",
  "parent_checkin",
  "data_collection",
  "goal_setup",
  "goal_checkin",
];

// How far ahead of a session the photos/video prompt appears. "Right before
// the session" — not the night before, and not first thing in the morning for
// an evening session. One place to change it.
const MEDIA_LEAD_TIME = "1 hour";

// Nothing before this date raises a reminder. The CRM holds years of sessions
// and back-filling all of them buries the genuinely current work. Move it
// earlier when you're ready to pull from the past — reminders already raised
// are never removed by changing it.
const START_DATE = "2026-08-18";

// Each rule applies the cutoff inline, comparing the session's Arizona calendar
// day rather than its stored UTC instant — an evening session must not fall on
// the wrong side of the boundary.

// A first session is a trial, not the start of a program, and a coach who has
// met a player once owes them one thing: the session note. So every rule below
// except the session note is gated on `crm_players_in_program` — the players
// with a session behind them that wasn't the trial. No photos, no two-week
// check-in, no goals, no baseline report until then, and everything opens up on
// its own the moment they train again. The view lives in the migration next to
// coach_player_sessions, which it reads; see migrations/0055_session_attendees.sql.

export type SyncResult = Record<string, number>;

// One note per session that hasn't been written up yet. Deliberately ungated:
// this is the whole of what a first session asks of a coach.
async function generateMiniNotes(): Promise<number> {
  const rows = (await sql`
    WITH unwritten AS (
      SELECT DISTINCT ON (v.crm_player_id)
        v.coach_slug, v.crm_player_id, v.source, v.session_id, v.session_date
      FROM coach_player_sessions v
      LEFT JOIN players app ON app.crm_player_id = v.crm_player_id
      WHERE (v.session_date::timestamptz) <= now()
        AND ((v.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
              >= ${START_DATE}::date
        AND NOT EXISTS (
        SELECT 1 FROM player_coaching_reports r
        WHERE r.player_id = app.id
          AND r.type = 'blurb'
          AND r.report_date >= ((v.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
        )
      ORDER BY v.crm_player_id, v.session_date DESC
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      u.coach_slug, u.crm_player_id, 'mini_note',
      'session:' || u.source || ':' || u.session_id,
      ((u.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    FROM unwritten u
    WHERE NOT EXISTS (
      SELECT 1 FROM coach_reminders o
      WHERE o.crm_player_id = u.crm_player_id AND o.kind = 'mini_note' AND o.status = 'open'
    )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// One baseline per player, once they've started training.
async function generateInitialReports(): Promise<number> {
  const rows = (await sql`
    WITH firsts AS (
      SELECT
        crm_player_id,
        min(session_date) AS first_at,
        (array_agg(coach_slug ORDER BY session_date DESC))[1] AS coach_slug,
        count(*) AS past_sessions,
        count(*) FILTER (WHERE package_id IS NOT NULL) AS package_sessions
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
      GROUP BY crm_player_id
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      f.coach_slug,
      f.crm_player_id,
      'initial_report',
      'intro',
      ((f.first_at::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    FROM firsts f
    LEFT JOIN players app ON app.crm_player_id = f.crm_player_id
    WHERE (f.package_sessions >= 1 OR f.past_sessions >= 2)
      AND ((f.first_at::timestamptz) AT TIME ZONE 'America/Phoenix')::date >= ${START_DATE}::date
      AND EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = f.crm_player_id
      )
      AND NOT EXISTS (
      SELECT 1 FROM player_coaching_reports r
      WHERE r.player_id = app.id AND r.type = 'baseline'
    )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Every sixth session, counted across all coaches — a progress report is about
// the player, not about who happened to run the session. Only the most recent
// milestone is raised, so a player who is several reports behind gets one
// reminder rather than a stack of them.
async function generateProgressReports(): Promise<number> {
  const rows = (await sql`
    WITH ranked AS (
      SELECT
        crm_player_id,
        coach_slug,
        session_date,
        row_number() OVER (
          PARTITION BY crm_player_id ORDER BY session_date, source, session_id
        ) AS n
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
    ),
    milestones AS (
      SELECT DISTINCT ON (crm_player_id) crm_player_id, coach_slug, session_date, n
      FROM ranked
      WHERE n % 6 = 0
        AND ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
              >= ${START_DATE}::date
      ORDER BY crm_player_id, n DESC
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      m.coach_slug,
      m.crm_player_id,
      'progress_report',
      'count:' || m.n,
      ((m.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    FROM milestones m
    LEFT JOIN players app ON app.crm_player_id = m.crm_player_id
    WHERE EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = m.crm_player_id
      )
      AND NOT EXISTS (
      SELECT 1 FROM player_coaching_reports r
      WHERE r.player_id = app.id
        AND r.type = 'progress'
        AND r.report_date >= ((m.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Two weeks since the last check-in was marked done — and only one open at a
// time, so a player can't accumulate a fortnight's worth of them.
async function generateParentCheckins(): Promise<number> {
  const rows = (await sql`
    WITH last_seen AS (
      SELECT
        crm_player_id,
        max(session_date) AS last_at,
        (array_agg(coach_slug ORDER BY session_date DESC))[1] AS coach_slug
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
      GROUP BY crm_player_id
    ),
    last_done AS (
      SELECT crm_player_id, max(done_at) AS done_at
      FROM coach_reminders
      WHERE kind = 'parent_checkin' AND status = 'done'
      GROUP BY crm_player_id
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      l.coach_slug,
      l.crm_player_id,
      'parent_checkin',
      'due:' || to_char(now() AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD'),
      (now() AT TIME ZONE 'America/Phoenix')::date
    FROM last_seen l
    LEFT JOIN last_done d ON d.crm_player_id = l.crm_player_id
    WHERE ((l.last_at::timestamptz) AT TIME ZONE 'America/Phoenix')::date >= ${START_DATE}::date
      AND EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = l.crm_player_id
      )
      AND (d.done_at IS NULL OR d.done_at < now() - interval '14 days')
      AND NOT EXISTS (
        SELECT 1 FROM coach_reminders o
        WHERE o.crm_player_id = l.crm_player_id
          AND o.kind = 'parent_checkin'
          AND o.status = 'open'
      )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Every other session, raised *before* the session it applies to: once an odd
// number of sessions is behind them, the next booked session is the one to
// bring a camera to. Anchored on that upcoming session, so it appears in the
// gap between the two.
async function generateMedia(): Promise<number> {
  const rows = (await sql`
    WITH counts AS (
      SELECT crm_player_id, count(*) AS n
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
      GROUP BY crm_player_id
    ),
    next_up AS (
      SELECT DISTINCT ON (crm_player_id)
        crm_player_id, coach_slug, source, session_id, session_date
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) > now()
        -- Only once the session is close; see MEDIA_LEAD_TIME.
        AND (session_date::timestamptz) <= now() + (${MEDIA_LEAD_TIME})::interval
        -- Never for the session that is the trial itself.
        AND source <> 'first'
      ORDER BY crm_player_id, session_date
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      nu.coach_slug,
      nu.crm_player_id,
      'media',
      'before:' || nu.source || ':' || nu.session_id,
      ((nu.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    FROM next_up nu
    JOIN counts c ON c.crm_player_id = nu.crm_player_id
    WHERE c.n % 2 = 1
      AND EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = nu.crm_player_id
      )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Data collection rides the same triggers as the reports it feeds: the sixth
// session, and the intro point. A progress report without fresh numbers behind
// it is guesswork, so the two are raised together.
async function generateDataCollection(): Promise<number> {
  const milestone = (await sql`
    WITH ranked AS (
      SELECT
        crm_player_id,
        coach_slug,
        session_date,
        row_number() OVER (
          PARTITION BY crm_player_id ORDER BY session_date, source, session_id
        ) AS n
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
    ),
    milestones AS (
      SELECT DISTINCT ON (crm_player_id) crm_player_id, coach_slug, session_date, n
      FROM ranked
      WHERE n % 6 = 0
        AND ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
              >= ${START_DATE}::date
      ORDER BY crm_player_id, n DESC
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      m.coach_slug,
      m.crm_player_id,
      'data_collection',
      'count:' || m.n,
      ((m.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    FROM milestones m
    LEFT JOIN players app ON app.crm_player_id = m.crm_player_id
    WHERE EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = m.crm_player_id
      )
      AND NOT EXISTS (
      SELECT 1 FROM player_tests t
      WHERE t.player_id = app.id
        AND t.test_date >= ((m.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  const intro = (await sql`
    WITH firsts AS (
      SELECT
        crm_player_id,
        min(session_date) AS first_at,
        (array_agg(coach_slug ORDER BY session_date DESC))[1] AS coach_slug,
        count(*) AS past_sessions,
        count(*) FILTER (WHERE package_id IS NOT NULL) AS package_sessions
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
      GROUP BY crm_player_id
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      f.coach_slug,
      f.crm_player_id,
      'data_collection',
      'intro',
      ((f.first_at::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    FROM firsts f
    LEFT JOIN players app ON app.crm_player_id = f.crm_player_id
    WHERE (f.package_sessions >= 1 OR f.past_sessions >= 2)
      AND ((f.first_at::timestamptz) AT TIME ZONE 'America/Phoenix')::date >= ${START_DATE}::date
      AND EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = f.crm_player_id
      )
      AND NOT EXISTS (
      SELECT 1 FROM player_tests t WHERE t.player_id = app.id
    )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  return milestone.length + intro.length;
}

// No period goal covering today. Only period goals count — the old flat
// player_goals table is no longer written to or shown anywhere.
async function generateGoalSetup(): Promise<number> {
  const rows = (await sql`
    WITH last_seen AS (
      SELECT
        crm_player_id,
        max(session_date) AS last_at,
        (array_agg(coach_slug ORDER BY session_date DESC))[1] AS coach_slug
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
      GROUP BY crm_player_id
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      l.coach_slug,
      l.crm_player_id,
      'goal_setup',
      'no-active-goal',
      (now() AT TIME ZONE 'America/Phoenix')::date
    FROM last_seen l
    LEFT JOIN players app ON app.crm_player_id = l.crm_player_id
    WHERE ((l.last_at::timestamptz) AT TIME ZONE 'America/Phoenix')::date >= ${START_DATE}::date
      AND EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = l.crm_player_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM player_period_goals g
        WHERE g.player_id = app.id
          AND g.end_date >= (now() AT TIME ZONE 'America/Phoenix')::date
      )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Every other session, review the live goal with the player. Anchored on the
// session count so it lands once per pair, not once per cron run.
async function generateGoalCheckins(): Promise<number> {
  const rows = (await sql`
    WITH ranked AS (
      SELECT
        crm_player_id,
        coach_slug,
        session_date,
        row_number() OVER (
          PARTITION BY crm_player_id ORDER BY session_date, source, session_id
        ) AS n
      FROM coach_player_sessions
      WHERE (session_date::timestamptz) <= now()
    ),
    every_other AS (
      SELECT DISTINCT ON (crm_player_id) crm_player_id, coach_slug, session_date, n
      FROM ranked
      WHERE n % 2 = 0
        AND ((session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
              >= ${START_DATE}::date
      ORDER BY crm_player_id, n DESC
    )
    INSERT INTO coach_reminders (coach_slug, crm_player_id, kind, anchor, anchor_date)
    SELECT
      e.coach_slug,
      e.crm_player_id,
      'goal_checkin',
      'count:' || e.n,
      ((e.session_date::timestamptz) AT TIME ZONE 'America/Phoenix')::date
    FROM every_other e
    LEFT JOIN players app ON app.crm_player_id = e.crm_player_id
    -- Only worth asking about progress when there's a goal to progress against;
    -- otherwise goal_setup is the reminder that applies.
    WHERE EXISTS (
      SELECT 1 FROM player_period_goals g
      WHERE g.player_id = app.id
        AND g.end_date >= (now() AT TIME ZONE 'America/Phoenix')::date
    )
      AND EXISTS (
        SELECT 1 FROM crm_players_in_program ip WHERE ip.crm_player_id = e.crm_player_id
      )
    ON CONFLICT (kind, crm_player_id, anchor) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// A goal_setup reminder answers itself the moment a live period goal exists.
// See closeSatisfied for what `onlyPlayer` is doing.
async function closeSatisfiedGoals(onlyPlayer: string | null = null): Promise<number> {
  const rows = (await sql`
    UPDATE coach_reminders cr
    SET status = 'done', done_at = now()
    FROM players app
    WHERE app.crm_player_id = cr.crm_player_id
      AND cr.status = 'open'
      AND cr.kind = 'goal_setup'
      AND (${onlyPlayer}::uuid IS NULL OR app.id = ${onlyPlayer}::uuid)
      AND EXISTS (
        SELECT 1 FROM player_period_goals g
        WHERE g.player_id = app.id
          AND g.end_date >= (now() AT TIME ZONE 'America/Phoenix')::date
      )
    RETURNING cr.id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Close anything whose report has since been written. Parent check-ins and
// media prompts have no artifact to look for and are closed by hand.
//
// `onlyPlayer` (an app players.id) narrows the sweep to one player so the save
// that writes a report can close its own reminder on the spot, instead of the
// coach walking back to the list and finding it still sitting there until the
// next hourly run. Null means every player — the cron's pass.
async function closeSatisfied(onlyPlayer: string | null = null): Promise<number> {
  const rows = (await sql`
    UPDATE coach_reminders cr
    SET status = 'done', done_at = now()
    FROM players app
    WHERE app.crm_player_id = cr.crm_player_id
      AND cr.status = 'open'
      AND (${onlyPlayer}::uuid IS NULL OR app.id = ${onlyPlayer}::uuid)
      AND EXISTS (
        SELECT 1 FROM player_coaching_reports r
        WHERE r.player_id = app.id
          AND r.type = CASE cr.kind
                         WHEN 'mini_note' THEN 'blurb'
                         WHEN 'initial_report' THEN 'baseline'
                         WHEN 'progress_report' THEN 'progress'
                       END
          AND (cr.kind = 'initial_report' OR r.report_date >= cr.anchor_date)
      )
    RETURNING cr.id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Data reminders close when a test lands, the same way report reminders do.
async function closeSatisfiedData(): Promise<number> {
  const rows = (await sql`
    UPDATE coach_reminders cr
    SET status = 'done', done_at = now()
    FROM players app
    WHERE app.crm_player_id = cr.crm_player_id
      AND cr.status = 'open'
      AND cr.kind = 'data_collection'
      AND EXISTS (
        SELECT 1 FROM player_tests t
        WHERE t.player_id = app.id AND t.test_date >= cr.anchor_date
      )
    RETURNING cr.id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Everything a player who is still only a trial should never have been asked
// for. The rules above no longer raise these, so this is what clears the ones
// raised before that was true — and what tidies up when a session is cancelled
// in the CRM and a player drops back out of the program.
//
// Deleted rather than marked done: nobody did this work, and it was never owed.
// Marking a parent check-in done would also start its two-week clock, which
// would then hide the real one when the player does join the program.
async function pruneOutOfProgram(): Promise<number> {
  const rows = (await sql`
    DELETE FROM coach_reminders cr
    WHERE cr.status = 'open'
      AND cr.kind <> 'mini_note'
      AND NOT EXISTS (
        SELECT 1 FROM crm_players_in_program ip
        WHERE ip.crm_player_id = cr.crm_player_id
      )
    RETURNING cr.id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// Close whatever one player's newly-saved work has just satisfied. Called from
// the report and goal save routes so the reminder is already gone by the time
// the coach lands back on the list — the same rules the cron sweep uses, just
// narrowed to one player, so the two can never disagree about what "done"
// means. Tests are deliberately not included: that form saves several rows and
// then recomputes, and closing mid-way would be a lie.
export async function closeRemindersForPlayer(playerId: string): Promise<number> {
  const reports = await closeSatisfied(playerId);
  const goals = await closeSatisfiedGoals(playerId);
  return reports + goals;
}

// Generate first, then close: a report written since the last run closes the
// reminder in the same pass that would otherwise re-raise it.
export async function syncCoachReminders(): Promise<SyncResult> {
  const mini_note = await generateMiniNotes();
  const initial_report = await generateInitialReports();
  const progress_report = await generateProgressReports();
  const parent_checkin = await generateParentCheckins();
  const media = await generateMedia();
  const data_collection = await generateDataCollection();
  const goal_setup = await generateGoalSetup();
  const goal_checkin = await generateGoalCheckins();
  const pruned = await pruneOutOfProgram();
  const closed = await closeSatisfied();
  const closed_data = await closeSatisfiedData();
  const closed_goals = await closeSatisfiedGoals();

  return {
    mini_note, initial_report, progress_report, parent_checkin, media,
    data_collection, goal_setup, goal_checkin,
    pruned,
    closed: closed + closed_data + closed_goals,
  };
}
