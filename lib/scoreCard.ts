import { sql } from "@/db";
import { COACH_LABELS, COACH_SLUGS, type CoachSlug } from "@/lib/bookingSchedule";

// The 14 cells a coach fills in by hand on the printed card.
//
// One cell per measurement, not per level. The value itself is what the rank
// engine reads, so the same Dribbling column serves Level 2 and Level 7 — only
// the number has to get bigger. Whoever does the data entry afterwards expands
// these 14 into the app's individual score fields.
// `units` is the column's share of the table width. A one-cell test needs more
// than one cell of a three-cell test because its header has to spell out the
// name; Power and Distance need more again because all four attempts per foot
// go in the one box.
export type ScoreCardGroup = { test: string; cells: string[]; units: number };

export const SCORE_CARD_GROUPS: ScoreCardGroup[] = [
  { test: "Juggling", cells: ["Score"], units: 1.35 },
  { test: "Dribbling", cells: ["Strong", "Weak", "Both"], units: 3 },
  { test: "Passing", cells: ["Strong", "Weak"], units: 2 },
  { test: "Power", cells: ["Strong x4", "Weak x4"], units: 3.4 },
  { test: "Distance", cells: ["Strong x4", "Weak x4"], units: 3.4 },
  { test: "Skill Moves", cells: ["Moves", "Combos"], units: 2 },
  { test: "Shooting", cells: ["Corners"], units: 1.35 },
  { test: "First Touch", cells: ["Yards"], units: 1.35 },
];

// Printed under the table so the coach knows what number belongs in each cell:
// the unit, which drill applies at which level, and any scoring rule that
// isn't obvious from the column header.
// The one rule that makes a collapsed card readable afterwards: where the same
// column holds different drills whose numbers overlap, the level is written
// first. Printed above the per-test key.
export const SCORE_CARD_PREFIX_RULE =
  "Where a test uses a different drill at each level, write the level first, " +
  "then the score, joined by a dash: 7-6 is an obstacle score of 6 at Level 7. " +
  "Needed on Juggling, Shooting and First Touch always, Dribbling at Levels 6-7, " +
  "and Passing at Levels 5-7. Power, Distance and Skill Moves never need it.";

export const SCORE_CARD_LEGEND: Array<{ test: string; unit: string; note: string }> = [
  { test: "Juggling", unit: "touches",
    note: "Always prefix the level. L2 any surface / L3 feet only (two best runs added) / L4 body parts / L5 speed / L6-7 14-in-14" },
  { test: "Dribbling", unit: "loops or sets, to the quarter",
    note: "L2-3 figure-8 / L4-5 cross / L6-7 obstacle (prefix the level on these). 1 min each foot. Deduct 0.25 per wrong-foot touch" },
  { test: "Passing", unit: "passes completed in 1 min",
    note: "Tally under the foot actually used. L2-4 gates, no prefix. L5 colour called / L6 colour read / L7 2-yd gate - prefix these" },
  { test: "Power", unit: "mph",
    note: "Write all four attempts in the box, separated by commas. The rank uses the best on each foot; both feet must clear the level" },
  { test: "Distance", unit: "yards, after the alley penalty",
    note: "All four attempts in the box, commas between. Deduct 2 / 4 / 8 by band: 30 yds in the -4 band is written 26" },
  { test: "Skill Moves", unit: "count in 4 min",
    note: "Distinct moves, both feet. A combo is two single moves chained together" },
  { test: "Shooting", unit: "corners hit",
    note: "Always prefix the level. L2-4 bottom corners / L5-7 all four. Must land in the marked zone" },
  { test: "First Touch", unit: "yards measured",
    note: "Always prefix the level. One touch only. L2-3 5x5 ground / L4 3x3 paced / L5-7 aerial. Measure to the middle cone" },
];

export const SCORE_CARD_CELLS = SCORE_CARD_GROUPS.reduce(
  (n, g) => n + g.cells.length,
  0
);

export type ScoreCardPlayer = {
  crmPlayerId: number;
  name: string;
  lastSession: string;
};

export type ScoreCardData = {
  coach: CoachSlug;
  coachLabel: string;
  players: ScoreCardPlayer[];
};

// Every player this coach has actually trained in the last six weeks.
//
// Coach attribution matches the Coach Players roster and the Coach Calendar
// exactly — assigned coach wins, then a "Coach Simon/Simpson" title, otherwise
// David — so a player can't be on one page's list and missing from the card.
export async function getScoreCardData(
  coach: CoachSlug
): Promise<ScoreCardData> {
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
        pl.name,
        s.session_date
      FROM crm_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      JOIN crm_session_attendees a ON a.source = 'regular' AND a.session_id = s.id
      JOIN crm_players pl ON pl.id = a.player_id
      WHERE s.cancelled IS NOT TRUE
        AND (s.session_date::timestamptz) <= now()
        AND (s.session_date::timestamptz) >= now() - interval '6 weeks'
      UNION ALL
      SELECT
        CASE
          WHEN st.slug = ANY(${COACH_SLUGS as unknown as string[]}) THEN st.slug
          WHEN lower(btrim(s.title)) LIKE 'coach simpson%' THEN 'simpson'
          WHEN lower(btrim(s.title)) LIKE 'coach simon%'   THEN 'simon'
          ELSE 'david'
        END AS coach,
        pl.id,
        pl.name,
        s.session_date
      FROM crm_first_sessions s
      LEFT JOIN crm_staff st ON st.id = s.coach_id
      JOIN crm_session_attendees a ON a.source = 'first' AND a.session_id = s.id
      JOIN crm_players pl ON pl.id = a.player_id
      WHERE s.cancelled IS NOT TRUE
        AND (s.session_date::timestamptz) <= now()
        AND (s.session_date::timestamptz) >= now() - interval '6 weeks'
    )
    SELECT
      crm_player_id,
      name,
      to_char(max(session_date)::timestamptz AT TIME ZONE 'America/Phoenix',
              'YYYY-MM-DD') AS last_session
    FROM att
    WHERE coach = ${coach}
    GROUP BY crm_player_id, name
    ORDER BY name
  `) as unknown as Array<{
    crm_player_id: number;
    name: string;
    last_session: string;
  }>;

  return {
    coach,
    coachLabel: COACH_LABELS[coach] ?? coach,
    players: rows.map((r) => ({
      crmPlayerId: r.crm_player_id,
      name: r.name,
      lastSession: r.last_session,
    })),
  };
}
