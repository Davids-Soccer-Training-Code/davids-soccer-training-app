import "server-only";

import { sql } from "@/db";
import { getPlayerRank } from "@/lib/getPlayerRank";
import {
  BASELINE_FIELDS,
  PROGRESS_SKILLS,
  PROGRESS_SUMMARY_FIELDS,
  toStringList,
} from "@/lib/coachingReports";
import { calculatePlayerBirthMeta } from "@/lib/playerAge";
import {
  mergeScoreHistory,
  requirementReadings,
  RANK_TESTS,
  RANKS,
  REQUIREMENTS,
  SESSION_MINIMUMS,
  weakestRequirementReading,
  type RankKey,
  type RankRequirement,
} from "@/lib/rankSystem";

// One row of the "8 tests" block. Each test is measured against its OWN next
// level, not against one shared target — a test already ahead of the others
// still has a next step, and that step is what the coach needs to see.
export type SheetTestRow = {
  test: string;
  level: number;
  nextLevel: number | null;
  atMax: boolean;
  tested: boolean;
  // One reading per condition, in the order the requirement label names them
  // ("strong and weak", "strong/weak/both") — collapsing these to the single
  // weakest number hides the foot that is already passing.
  bests: Array<number | null>;
  need: number | null;
  requirement: string;
  gap: number | null;
  progress: number;
};

// One reading per condition, matching the BEST column in the tests block, so
// the history shows which foot moved rather than a single collapsed number.
export type SheetHistoryPoint = {
  values: Array<number | null>;
  date: string;
};

export type SheetHistoryRow = {
  test: string;
  // Which level's metric these readings are, since different levels of the
  // same test are measured on entirely different fields.
  metricLevel: number | null;
  first: SheetHistoryPoint | null;
  previous: SheetHistoryPoint | null;
  latest: SheetHistoryPoint | null;
  deltas: Array<number | null>;
};

export type SheetGoalStep = { title: string; completed: boolean };

export type SheetGoal = {
  title: string;
  startDate: string;
  endDate: string;
  steps: SheetGoalStep[];
};

export type SheetReport = {
  kind: "baseline" | "progress";
  title: string;
  date: string;
  ratings: Array<{ label: string; value: number | null }>;
  fields: Array<{ label: string; text: string }>;
};

export type SheetPhoto = { bytes: Uint8Array; kind: "png" | "jpg" };

export type PlayerSheetData = {
  generatedAt: string;
  player: {
    name: string;
    age: number | null;
    birthdate: string | null;
    birthYear: number | null;
    ageGroup: string | null;
    teamLevel: string | null;
    location: string | null;
    shirtSize: string | null;
    primaryPosition: string | null;
    secondaryPosition: string | null;
    dominantFoot: string | null;
    focusAreas: string | null;
  };
  parent: {
    name: string | null;
    secondaryName: string | null;
    email: string | null;
    phone: string | null;
  };
  currentLevel: number;
  targetLevel: number | null;
  sessions: { count: number; required: number; ok: boolean };
  mission: { title: string | null; ok: boolean };
  tests: SheetTestRow[];
  history: SheetHistoryRow[];
  goal: SheetGoal | null;
  report: SheetReport | null;
  photo: SheetPhoto | null;
};

type PlayerRow = {
  id: string;
  name: string;
  birthdate: string | null;
  birth_year: number | null;
  team_level: string | null;
  location: string | null;
  shirt_size: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  dominant_foot: string | null;
  focus_areas: string | null;
  profile_photo_url: string | null;
  parent_name: string | null;
  secondary_parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
};

type TestRow = {
  test_name: string;
  test_date: string;
  scores: Record<string, unknown>;
};

function levelOf(rank: RankKey) {
  return RANKS.find((r) => r.key === rank)?.level ?? 1;
}

// The rank a given test is chasing next: one step up from where that test
// currently sits. Returns null once the test is maxed out.
function nextRequirement(
  test: string,
  currentRank: RankKey
): { rank: Exclude<RankKey, "black">; req: RankRequirement } | null {
  const currentIndex = RANKS.find((r) => r.key === currentRank)?.index ?? 0;
  const next = RANKS[currentIndex + 1];
  if (!next) return null;
  const rank = next.key as Exclude<RankKey, "black">;
  return { rank, req: REQUIREMENTS[test as keyof typeof REQUIREMENTS][rank] };
}

// pdf-lib embeds PNG and JPEG only. Anything else (or an unreachable URL) falls
// back to the initials placeholder rather than failing the whole sheet.
async function loadPhoto(url: string | null): Promise<SheetPhoto | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());

    // Sniff the magic bytes; the content-type header is not always honest.
    const isPng =
      bytes.length > 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;

    if (isPng) return { bytes, kind: "png" };
    if (isJpg) return { bytes, kind: "jpg" };
    if (contentType.includes("png")) return { bytes, kind: "png" };
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      return { bytes, kind: "jpg" };
    }
    return null;
  } catch {
    return null;
  }
}

function buildReport(row: {
  type: string;
  title: string;
  report_date: string;
  content: Record<string, unknown>;
} | undefined): SheetReport | null {
  if (!row) return null;
  const content = row.content ?? {};

  if (row.type === "progress") {
    const ratings = PROGRESS_SKILLS.map((skill) => {
      const area = content[skill.key];
      const rating =
        area && typeof area === "object" && !Array.isArray(area)
          ? (area as Record<string, unknown>).rating
          : null;
      const parsed = Number(rating);
      return {
        label: skill.label,
        value: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      };
    });
    const fields = PROGRESS_SUMMARY_FIELDS.map((field) => ({
      label: field.label,
      text: String(content[field.key] ?? "").trim(),
    })).filter((f) => f.text);
    return {
      kind: "progress",
      title: row.title,
      date: row.report_date,
      ratings,
      fields,
    };
  }

  const fields = BASELINE_FIELDS.map((field) => {
    const raw = content[field.key];
    const text = field.list
      ? toStringList(raw)
          .map((item) => `• ${item}`)
          .join("  ")
      : String(raw ?? "").trim();
    return { label: field.label.replace(/ \(one per line\)$/, ""), text };
  }).filter((f) => f.text);

  return {
    kind: "baseline",
    title: row.title,
    date: row.report_date,
    ratings: [],
    fields,
  };
}

export async function getPlayerSheetData(
  playerId: string
): Promise<PlayerSheetData | null> {
  const playerRows = (await sql`
    SELECT
      p.id, p.name, p.birthdate::text AS birthdate, p.birth_year,
      p.team_level, p.location, p.shirt_size, p.primary_position,
      p.secondary_position, p.dominant_foot, p.focus_areas,
      p.profile_photo_url,
      pa.name AS parent_name,
      pa.secondary_parent_name,
      pa.email AS parent_email,
      pa.phone AS parent_phone
    FROM players p
    JOIN parents pa ON pa.id = p.parent_id
    WHERE p.id = ${playerId}
    LIMIT 1
  `) as unknown as PlayerRow[];

  const player = playerRows[0];
  if (!player) return null;

  const [rank, testRows, goalRows, reportRows] = await Promise.all([
    getPlayerRank(playerId),
    sql`
      SELECT test_name, test_date::text AS test_date, scores
      FROM player_tests
      WHERE player_id = ${playerId}
      ORDER BY test_date ASC, created_at ASC
    ` as unknown as Promise<TestRow[]>,
    sql`
      SELECT
        g.id, g.title, g.start_date::text AS start_date,
        g.end_date::text AS end_date,
        COALESCE(
          json_agg(
            json_build_object('title', s.title, 'completed', s.completed)
            ORDER BY s.sort_order, s.created_at
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS steps
      FROM player_period_goals g
      LEFT JOIN player_goal_steps s ON s.period_goal_id = g.id
      WHERE g.player_id = ${playerId}
      GROUP BY g.id
      ORDER BY g.end_date DESC, g.start_date DESC
      LIMIT 1
    ` as unknown as Promise<
      Array<{
        title: string;
        start_date: string;
        end_date: string;
        steps: SheetGoalStep[];
      }>
    >,
    sql`
      SELECT type, title, report_date::text AS report_date, content
      FROM player_coaching_reports
      WHERE player_id = ${playerId} AND type IN ('progress', 'baseline')
      ORDER BY report_date DESC, created_at DESC
      LIMIT 1
    ` as unknown as Promise<
      Array<{
        type: string;
        title: string;
        report_date: string;
        content: Record<string, unknown>;
      }>
    >,
  ]);

  const targetRank = rank.next_checklist.targetRank;
  const targetLevel = targetRank ? levelOf(targetRank) : null;

  // Rows arrive oldest-first. Group per test for both the merged current
  // scores (newest-first, as the rank system expects) and the timeline.
  const rowsByTest = new Map<string, TestRow[]>();
  for (const row of testRows) {
    if (!rowsByTest.has(row.test_name)) rowsByTest.set(row.test_name, []);
    rowsByTest.get(row.test_name)!.push(row);
  }

  const tests: SheetTestRow[] = [];
  const history: SheetHistoryRow[] = [];

  for (const test of RANK_TESTS) {
    const rows = rowsByTest.get(test) ?? [];
    const merged = mergeScoreHistory(
      [...rows].reverse().map((r) => r.scores ?? {})
    );
    const perTest = rank.per_test[test];
    const currentRank = perTest?.rank ?? "black";
    const next = nextRequirement(test, currentRank);
    const readings = next ? requirementReadings(next.req, merged) : [];
    const reading = next ? weakestRequirementReading(next.req, merged) : null;
    const tested = rows.length > 0;

    tests.push({
      test,
      level: levelOf(currentRank),
      nextLevel: next ? levelOf(next.rank) : null,
      atMax: !next,
      tested,
      bests: readings.map((r) => r.current),
      need: reading?.min ?? null,
      requirement: next?.req.label ?? "",
      gap:
        !reading || reading.current === null
          ? null
          : Math.round((reading.min - reading.current) * 100) / 100,
      progress: reading?.ratio ?? 0,
    });

    // Track the number the player needs to move next. When that metric has
    // never been recorded, walk back down the ladder to the highest level that
    // does have readings — the coach entered those scores and should see them,
    // rather than an empty row.
    const currentIndex = RANKS.find((r) => r.key === currentRank)?.index ?? 0;
    const candidates: Array<{ req: RankRequirement; level: number }> = [];
    if (next) candidates.push({ req: next.req, level: levelOf(next.rank) });
    for (let i = currentIndex; i >= 1; i -= 1) {
      const def = RANKS[i];
      candidates.push({
        req: REQUIREMENTS[test as keyof typeof REQUIREMENTS][
          def.key as Exclude<RankKey, "black">
        ],
        level: def.level,
      });
    }

    let timeline: SheetHistoryPoint[] = [];
    let metricLevel: number | null = null;
    for (const candidate of candidates) {
      const points: SheetHistoryPoint[] = [];
      for (const row of rows) {
        const values = requirementReadings(candidate.req, row.scores ?? {}).map(
          (r) => r.current
        );
        // Keep the row if any condition was recorded — a session where only
        // one foot was measured is still a reading worth showing.
        if (!values.some((v) => v !== null)) continue;
        points.push({ values, date: row.test_date });
      }
      if (points.length) {
        timeline = points;
        metricLevel = candidate.level;
        break;
      }
    }

    const latest = timeline[timeline.length - 1] ?? null;
    const first = timeline.length > 1 ? timeline[0] : null;
    // With only two readings the middle column would just repeat the first, so
    // it stays empty until there is a genuine third point to show.
    const previous =
      timeline.length > 2 ? timeline[timeline.length - 2] : null;

    const compareTo = previous ?? first;
    history.push({
      test,
      metricLevel,
      first,
      previous,
      latest,
      deltas:
        latest && compareTo
          ? latest.values.map((value, i) => {
              const before = compareTo.values[i];
              if (value === null || before === null || before === undefined) {
                return null;
              }
              return Math.round((value - before) * 100) / 100;
            })
          : [],
    });
  }

  // Never tested first, then closest to its own next level, maxed tests last.
  tests.sort((a, b) => {
    const bucket = (t: SheetTestRow) => (!t.tested ? 0 : t.atMax ? 2 : 1);
    const diff = bucket(a) - bucket(b);
    if (diff !== 0) return diff;
    if (bucket(a) === 1) return b.progress - a.progress;
    return RANK_TESTS.indexOf(a.test as never) -
      RANK_TESTS.indexOf(b.test as never);
  });

  const requiredSessions = targetRank ? SESSION_MINIMUMS[targetRank] : 0;
  const targetMission = targetRank
    ? rank.missions.find((m) => m.target_rank === targetRank)
    : undefined;

  const goalRow = goalRows[0];

  return {
    generatedAt: new Date().toISOString(),
    player: {
      name: player.name,
      ...calculatePlayerBirthMeta(player.birthdate),
      birthdate: player.birthdate,
      birthYear: player.birth_year,
      teamLevel: player.team_level,
      location: player.location,
      shirtSize: player.shirt_size,
      primaryPosition: player.primary_position,
      secondaryPosition: player.secondary_position,
      dominantFoot: player.dominant_foot,
      focusAreas: player.focus_areas,
    },
    parent: {
      name: player.parent_name,
      secondaryName: player.secondary_parent_name,
      email: player.parent_email,
      phone: player.parent_phone,
    },
    currentLevel: levelOf(rank.overall.rank),
    targetLevel,
    sessions: {
      count: rank.session_count,
      required: requiredSessions,
      ok: rank.session_count >= requiredSessions,
    },
    mission: {
      title: targetMission?.title ?? null,
      ok: targetRank ? rank.mission_done_by_rank[targetRank] === true : true,
    },
    tests,
    history,
    goal: goalRow
      ? {
          title: goalRow.title,
          startDate: goalRow.start_date,
          endDate: goalRow.end_date,
          steps: Array.isArray(goalRow.steps) ? goalRow.steps : [],
        }
      : null,
    report: buildReport(reportRows[0]),
    photo: await loadPhoto(player.profile_photo_url),
  };
}
