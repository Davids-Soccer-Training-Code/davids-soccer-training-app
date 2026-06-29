import { getTestDefinitionByName } from "./testDefinitions";
import {
  RANK_TESTS,
  type RankKey,
  type TestRankResult,
  type NextRankChecklist,
  evaluateTest,
  computeOverallRank,
  nextRankChecklist,
  missionDoneByRankFrom,
  mergeScoreHistory,
} from "./rankSystem";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export type PlayerTestRow = {
  id: string;
  player_id: string;
  test_name: string;
  test_date: string; // YYYY-MM-DD
  scores: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MissionLite = { target_rank: string; status: string };

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function num(scores: Record<string, unknown>, key: string) {
  return toFiniteNumber(scores[key]);
}

function mean(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length !== values.length || nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function meanOfFour(values: Array<number | null>): number | null {
  if (values.length !== 4) return null;
  return mean(values);
}

function avgOfAll(values: Array<number | null>): number | null {
  return mean(values);
}

function minOfAll(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length !== values.length || nums.length === 0) return null;
  return Math.min(...nums);
}

function maxOfAll(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length !== values.length || nums.length === 0) return null;
  return Math.max(...nums);
}

function maxOf(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

function safeAsymmetryPct(
  strong: number | null,
  weak: number | null
): number | null {
  if (strong === null || weak === null) return null;
  if (strong === 0) return null;
  return ((strong - weak) / strong) * 100;
}

function pctChange(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function delta(current: number | null, previous: number | null) {
  return current === null || previous === null ? null : current - previous;
}

function pickLatestByTest(tests: PlayerTestRow[]) {
  const byName = new Map<string, PlayerTestRow[]>();
  for (const t of tests) {
    if (!byName.has(t.test_name)) byName.set(t.test_name, []);
    byName.get(t.test_name)!.push(t);
  }
  const latest = new Map<string, PlayerTestRow>();
  for (const [name, list] of byName.entries()) {
    list.sort((a, b) =>
      a.test_date < b.test_date
        ? 1
        : a.test_date > b.test_date
        ? -1
        : b.created_at.localeCompare(a.created_at)
    );
    latest.set(name, list[0]);
  }
  return { byName, latest };
}

// Echo each defined numeric field of a test as a metric (used for the simple
// count/distance-style tests where the raw value is what we chart).
function echoFields(
  testName: string,
  scores: Record<string, unknown>
): Record<string, number | null> {
  const def = getTestDefinitionByName(testName);
  const m: Record<string, number | null> = {};
  if (def) {
    for (const f of def.fields) {
      if (f.type !== "number") continue;
      m[f.key] = num(scores, f.key);
    }
  }
  return m;
}

function computeMetricsForSingleTest(
  testName: string,
  scores: Record<string, unknown>
): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};

  // POWER (best + averages of each foot)
  if (testName === "Power") {
    const strong = [1, 2, 3, 4].map((i) => num(scores, `power_strong_${i}`));
    const weak = [1, 2, 3, 4].map((i) => num(scores, `power_weak_${i}`));
    const strongAvg = meanOfFour(strong);
    const weakAvg = meanOfFour(weak);
    metrics.shot_power_strong_avg = strongAvg;
    metrics.shot_power_weak_avg = weakAvg;
    metrics.shot_power_strong_max = maxOf(strong);
    metrics.shot_power_weak_max = maxOf(weak);
    metrics.shot_power_asymmetry_pct = safeAsymmetryPct(strongAvg, weakAvg);
    return metrics;
  }

  // DISTANCE (best + averages of each foot)
  if (testName === "Distance") {
    const strong = [1, 2, 3, 4].map((i) => num(scores, `serve_strong_${i}`));
    const weak = [1, 2, 3, 4].map((i) => num(scores, `serve_weak_${i}`));
    const strongAvg = meanOfFour(strong);
    const weakAvg = meanOfFour(weak);
    metrics.serve_distance_strong_avg = strongAvg;
    metrics.serve_distance_weak_avg = weakAvg;
    metrics.serve_distance_strong_max = maxOf(strong);
    metrics.serve_distance_weak_max = maxOf(weak);
    metrics.serve_distance_asymmetry_pct = safeAsymmetryPct(strongAvg, weakAvg);
    return metrics;
  }

  // 5-10-5 AGILITY (lower is better)
  if (testName === "5-10-5 Agility") {
    const trials = [1, 2, 3].map((i) => num(scores, `agility_${i}`));
    metrics.agility_5_10_5_best_time = minOfAll(trials);
    metrics.agility_5_10_5_avg_time = avgOfAll(trials);
    metrics.agility_5_10_5_worst_time = maxOfAll(trials);
    return metrics;
  }

  // SINGLE-LEG HOP
  if (testName === "Single-leg Hop") {
    const left = [1, 2, 3].map((i) => num(scores, `hop_left_${i}`));
    const right = [1, 2, 3].map((i) => num(scores, `hop_right_${i}`));
    const leftMax = maxOfAll(left);
    const rightMax = maxOfAll(right);
    const hopMax =
      leftMax === null || rightMax === null ? null : Math.max(leftMax, rightMax);
    metrics.single_leg_hop_left = leftMax;
    metrics.single_leg_hop_right = rightMax;
    metrics.single_leg_hop_asymmetry_pct =
      hopMax === null || hopMax === 0
        ? null
        : (Math.abs((leftMax ?? 0) - (rightMax ?? 0)) / hopMax) * 100;
    metrics.single_leg_hop_left_avg = avgOfAll(left);
    metrics.single_leg_hop_right_avg = avgOfAll(right);
    return metrics;
  }

  // DOUBLE-LEG JUMPS
  if (testName === "Double-leg Jumps") {
    const jumpsArr = [1, 2, 3].map((i) => num(scores, `jump_${i}`));
    metrics.double_leg_jumps_best = maxOfAll(jumpsArr);
    metrics.double_leg_jumps_avg = avgOfAll(jumpsArr);
    return metrics;
  }

  // Juggling, Dribbling, Passing, Skill Moves, Shooting Accuracy, First Touch:
  // chart the raw entered values directly.
  Object.assign(metrics, echoFields(testName, scores));
  return metrics;
}

function computeTestProgressions(
  byName: Map<string, PlayerTestRow[]>
): PlayerProfileData["test_progressions"] {
  const progressions: NonNullable<PlayerProfileData["test_progressions"]> = {};

  for (const [testName, testList] of byName.entries()) {
    if (testList.length === 0) continue;

    const sorted = testList.slice().sort((a, b) => {
      if (a.test_date < b.test_date) return -1;
      if (a.test_date > b.test_date) return 1;
      return a.created_at.localeCompare(b.created_at);
    });

    const firstTest = sorted[0];
    const mostRecentTest = sorted[sorted.length - 1];
    const previousTest = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    const firstMetrics = computeMetricsForSingleTest(
      testName,
      firstTest.scores ?? {}
    );
    const mostRecentMetrics = computeMetricsForSingleTest(
      testName,
      mostRecentTest.scores ?? {}
    );
    const previousMetrics = previousTest
      ? computeMetricsForSingleTest(testName, previousTest.scores ?? {})
      : null;

    const timeline = sorted.map((t) => ({
      test_date: t.test_date,
      test_id: t.id,
      metrics: computeMetricsForSingleTest(testName, t.scores ?? {}),
    }));

    const since_first: Record<string, number | null> = {};
    const pct_since_first: Record<string, number | null> = {};
    const since_previous: Record<string, number | null> = {};
    const pct_since_previous: Record<string, number | null> = {};

    for (const key of Object.keys(mostRecentMetrics)) {
      const current = mostRecentMetrics[key];
      const first = firstMetrics[key];
      const prev = previousMetrics?.[key] ?? null;

      since_first[key] = delta(current, first);
      pct_since_first[key] = pctChange(current, first);

      if (previousMetrics) {
        since_previous[key] = delta(current, prev);
        pct_since_previous[key] = pctChange(current, prev);
      }
    }

    const firstDate = new Date(firstTest.test_date);
    const mostRecentDate = new Date(mostRecentTest.test_date);
    const date_range_days = Math.round(
      (mostRecentDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    progressions[testName] = {
      first_test: {
        test_date: firstTest.test_date,
        test_id: firstTest.id,
        metrics: firstMetrics,
      },
      most_recent_test: {
        test_date: mostRecentTest.test_date,
        test_id: mostRecentTest.id,
        metrics: mostRecentMetrics,
      },
      previous_test: previousTest
        ? {
            test_date: previousTest.test_date,
            test_id: previousTest.id,
            metrics: previousMetrics!,
          }
        : undefined,
      changes: {
        since_first,
        pct_since_first,
        since_previous: previousMetrics ? since_previous : undefined,
        pct_since_previous: previousMetrics ? pct_since_previous : undefined,
      },
      test_count: sorted.length,
      date_range_days,
      timeline,
    };
  }

  return progressions;
}

export type ProfileRanks = {
  overall: { rank: RankKey; index: number };
  per_test: Record<
    string,
    { rank: RankKey; index: number; passed_by_rank: Record<RankKey, boolean> }
  >;
  session_count: number;
  mission_done_by_rank: Record<RankKey, boolean>;
  next_checklist: NextRankChecklist;
};

export type PlayerProfileData = {
  version: 2;
  computed_at: string;
  sources: {
    tests_total: number;
    latest_tests: Array<{ id: string; test_name: string; test_date: string }>;
  };
  raw_tests: Array<{
    id: string;
    test_name: string;
    test_date: string;
    scores: Record<string, unknown>;
  }>;
  inputs: Record<string, Json>;
  metrics: Record<string, number | null>;
  ranks: ProfileRanks;
  comparisons?: {
    previous_profile_id: string;
    deltas: Record<string, number | null>;
    pct_changes: Record<string, number | null>;
  };
  test_progressions?: Record<
    string,
    {
      first_test: {
        test_date: string;
        test_id: string;
        metrics: Record<string, number | null>;
      };
      most_recent_test: {
        test_date: string;
        test_id: string;
        metrics: Record<string, number | null>;
      };
      previous_test?: {
        test_date: string;
        test_id: string;
        metrics: Record<string, number | null>;
      };
      changes: {
        since_first: Record<string, number | null>;
        since_previous?: Record<string, number | null>;
        pct_since_first: Record<string, number | null>;
        pct_since_previous?: Record<string, number | null>;
      };
      test_count: number;
      date_range_days: number;
      timeline: Array<{
        test_date: string;
        test_id: string;
        metrics: Record<string, number | null>;
      }>;
    }
  >;
};

export function computePlayerProfile(args: {
  tests: PlayerTestRow[];
  nowIso: string;
  sessionCount?: number;
  missions?: MissionLite[];
  previousProfile?: { id: string; data: PlayerProfileData } | null;
}): PlayerProfileData {
  const { byName, latest } = pickLatestByTest(args.tests);

  const metrics: Record<string, number | null> = {};
  const inputs: Record<string, Json> = {};

  const latestTests = Array.from(latest.values()).map((t) => ({
    id: t.id,
    test_name: t.test_name,
    test_date: t.test_date,
  }));

  // Merge per-test metrics from the latest entry of each test.
  for (const t of latest.values()) {
    Object.assign(metrics, computeMetricsForSingleTest(t.test_name, t.scores ?? {}));
    inputs[t.test_name] = (t.scores ?? {}) as Json;
  }

  // --- Rank computation ---------------------------------------------------
  const sessionCount = args.sessionCount ?? 0;
  const missionDoneByRank = missionDoneByRankFrom(args.missions ?? []);

  // For rank evaluation, merge each test's full history (newest-first) so that a
  // rank tier reads its own field's last recorded value even when the most recent
  // session only covered a different tier's fields (e.g. cross-dribble loops
  // entered later must not wipe earlier figure-8 loop progress). pickLatestByTest
  // sorts each byName list newest-first.
  const mergedScoresByTest = (testName: string) =>
    mergeScoreHistory((byName.get(testName) ?? []).map((t) => t.scores ?? {}));

  const perTest: Record<string, TestRankResult> = {};
  for (const testName of RANK_TESTS) {
    perTest[testName] = evaluateTest(testName, mergedScoresByTest(testName));
  }

  const overall = computeOverallRank({
    perTest,
    sessionCount,
    missionDoneByRank,
  });

  const latestScores = Object.fromEntries(
    RANK_TESTS.map((t) => [t, mergedScoresByTest(t)])
  );
  const next = nextRankChecklist({
    currentRankIndex: overall.rankIndex,
    perTest,
    sessionCount,
    missionDoneByRank,
    latestScores,
  });

  const ranks: ProfileRanks = {
    overall: { rank: overall.rank, index: overall.rankIndex },
    per_test: Object.fromEntries(
      RANK_TESTS.map((t) => [
        t,
        {
          rank: perTest[t].rank,
          index: perTest[t].rankIndex,
          passed_by_rank: perTest[t].passedByRank,
        },
      ])
    ),
    session_count: sessionCount,
    mission_done_by_rank: missionDoneByRank,
    next_checklist: next,
  };

  // --- Comparisons vs previous snapshot -----------------------------------
  let comparisons: PlayerProfileData["comparisons"] | undefined = undefined;
  if (args.previousProfile?.data?.metrics) {
    const prev = args.previousProfile.data.metrics;
    const deltas: Record<string, number | null> = {};
    const pct_changes: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(metrics)) {
      const prevV = prev[k] ?? null;
      deltas[k] = delta(v, prevV);
      pct_changes[k] = pctChange(v, prevV);
    }
    comparisons = {
      previous_profile_id: args.previousProfile.id,
      deltas,
      pct_changes,
    };
  }

  const test_progressions = computeTestProgressions(byName);

  return {
    version: 2,
    computed_at: args.nowIso,
    sources: {
      tests_total: args.tests.length,
      latest_tests: latestTests,
    },
    raw_tests: args.tests.map((t) => ({
      id: t.id,
      test_name: t.test_name,
      test_date: t.test_date,
      scores: t.scores ?? {},
    })),
    inputs,
    metrics,
    ranks,
    comparisons,
    test_progressions,
  };
}
