-- Who is actually on a session.
--
-- Two places record that, and which one gets written depends on how the
-- session was created in the CRM: the junction tables (crm_session_players /
-- crm_first_session_players), and the older single-player column on the
-- session row itself. Every query in this app read only the junction tables,
-- so a first session booked straight into the CRM arrived here with nobody
-- attached — the player was on it all along, in the column nobody read. That
-- is what kept a scheduled first session off the coach's roster until someone
-- went back and attached the player by hand.
--
-- One view now answers the question, so the roster, the calendar, the score
-- card and the reminder rules can't disagree about who is training.
--
-- The legacy columns are read only if they still exist: the CRM owns this
-- schema and may drop them, and this migration must not be what breaks then.
DO $$
DECLARE
  regular_src text :=
    'SELECT sp.session_id AS session_id, sp.player_id AS player_id
       FROM crm_session_players sp WHERE sp.player_id IS NOT NULL';
  first_src text :=
    'SELECT fsp.first_session_id AS session_id, fsp.player_id AS player_id
       FROM crm_first_session_players fsp WHERE fsp.player_id IS NOT NULL';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'crm_sessions'::regclass
      AND attname = 'player_id' AND attnum > 0 AND NOT attisdropped
  ) THEN
    regular_src := regular_src ||
      ' UNION SELECT s.id, s.player_id FROM crm_sessions s WHERE s.player_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'crm_first_sessions'::regclass
      AND attname = 'player_id' AND attnum > 0 AND NOT attisdropped
  ) THEN
    first_src := first_src ||
      ' UNION SELECT s.id, s.player_id FROM crm_first_sessions s WHERE s.player_id IS NOT NULL';
  END IF;

  EXECUTE
    'CREATE OR REPLACE VIEW crm_session_attendees AS ' ||
    'SELECT ''regular''::text AS source, r.session_id, r.player_id FROM (' || regular_src || ') r ' ||
    'UNION ALL ' ||
    'SELECT ''first''::text AS source, f.session_id, f.player_id FROM (' || first_src || ') f';
END $$;

-- Attributed sessions, rebuilt on the attendee view. Attribution is unchanged
-- except that Girish is no longer in the slug list: he stopped coaching and is
-- already out of COACH_SLUGS, so a reminder raised under his slug had no tab
-- to appear on. His sessions now fall to David, the same way they already do
-- on the roster and the calendar.
CREATE OR REPLACE VIEW coach_player_sessions AS
SELECT
  'regular'::text AS source,
  s.id            AS session_id,
  CASE
    WHEN st.slug IN ('david','simon','simpson','george','tyrone') THEN st.slug
    WHEN lower(btrim(s.title)) LIKE 'coach simpson%' THEN 'simpson'
    WHEN lower(btrim(s.title)) LIKE 'coach simon%'   THEN 'simon'
    ELSE 'david'
  END             AS coach_slug,
  pl.id           AS crm_player_id,
  s.session_date,
  s.package_id
FROM crm_sessions s
LEFT JOIN crm_staff st ON st.id = s.coach_id
JOIN crm_session_attendees a ON a.source = 'regular' AND a.session_id = s.id
JOIN crm_players pl ON pl.id = a.player_id
WHERE s.cancelled IS NOT TRUE
UNION ALL
SELECT
  'first'::text,
  s.id,
  CASE
    WHEN st.slug IN ('david','simon','simpson','george','tyrone') THEN st.slug
    WHEN lower(btrim(s.title)) LIKE 'coach simpson%' THEN 'simpson'
    WHEN lower(btrim(s.title)) LIKE 'coach simon%'   THEN 'simon'
    ELSE 'david'
  END,
  pl.id,
  s.session_date,
  NULL::integer
FROM crm_first_sessions s
LEFT JOIN crm_staff st ON st.id = s.coach_id
JOIN crm_session_attendees a ON a.source = 'first' AND a.session_id = s.id
JOIN crm_players pl ON pl.id = a.player_id
WHERE s.cancelled IS NOT TRUE;

-- Players who are in the program: they have a session behind them that wasn't
-- the trial. Until a player is in here, a first session is all the coach has
-- done with them, and the only reminder worth raising is the session note —
-- no photos, no two-week check-in, no goals, no baseline report. The reminder
-- rules read this; see lib/coachReminders.ts.
CREATE OR REPLACE VIEW crm_players_in_program AS
SELECT DISTINCT crm_player_id
FROM coach_player_sessions
WHERE source <> 'first'
  AND (session_date::timestamptz) <= now();

-- Reminders already raised under Girish's slug were invisible: the page has no
-- tab for him. Move the open ones to David along with his sessions.
UPDATE coach_reminders
SET coach_slug = 'david', updated_at = now()
WHERE status = 'open' AND coach_slug = 'girish';
