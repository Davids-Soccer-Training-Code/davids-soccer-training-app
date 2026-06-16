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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

function sumTop2OfFour(values: Array<number | null>): number | null {
  if (values.length !== 4) return null;
  if (values.some((v) => v === null)) return null;
  const sorted = (values as number[]).slice().sort((a, b) => b - a);
  return sorted[0] + sorted[1];
}

function sumOfAll(values: Array<number | null>): number | null {
  if (values.length === 0) return null;
  if (values.some((v) => v === null)) return null;
  return (values as number[]).reduce((acc, v) => acc + v, 0);
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

function safeRatio(
  numerator: number | null,
  denominator: number | null
): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
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

function computeMetricsForSingleTest(
  testName: string,
  scores: Record<string, unknown>
): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};

  // POWER
  if (testName === "Power") {
    const strong = [1, 2, 3, 4].map((i) => num(scores, `power_strong_${i}`));
    const weak = [1, 2, 3, 4].map((i) => num(scores, `power_weak_${i}`));
    const strongAvg = meanOfFour(strong);
    const weakAvg = meanOfFour(weak);
    const strongMax = maxOf(strong);
    const weakMax = maxOf(weak);
    metrics.shot_power_strong_avg = strongAvg;
    metrics.shot_power_weak_avg = weakAvg;
    metrics.shot_power_strong_max = strongMax;
    metrics.shot_power_weak_max = weakMax;
    metrics.shot_power_asymmetry_pct = safeAsymmetryPct(strongAvg, weakAvg);
  }

  // SERVE DISTANCE
  if (testName === "Serve Distance") {
    const strong = [1, 2, 3, 4].map((i) => num(scores, `serve_strong_${i}`));
    const weak = [1, 2, 3, 4].map((i) => num(scores, `serve_weak_${i}`));
    const strongAvg = meanOfFour(strong);
    const weakAvg = meanOfFour(weak);
    const strongMax = maxOf(strong);
    const weakMax = maxOf(weak);
    metrics.serve_distance_strong_avg = strongAvg;
    metrics.serve_distance_weak_avg = weakAvg;
    metrics.serve_distance_strong_max = strongMax;
    metrics.serve_distance_weak_max = weakMax;
    metrics.serve_distance_asymmetry_pct = safeAsymmetryPct(strongAvg, weakAvg);
  }

  // FIGURE 8
  if (testName === "Figure 8 Loops") {
    const strong = num(scores, "figure8_strong");
    const weak = num(scores, "figure8_weak");
    const both = num(scores, "figure8_both");
    metrics.figure8_loops_strong = strong;
    metrics.figure8_loops_weak = weak;
    metrics.figure8_loops_both = both;
    metrics.figure8_asymmetry_pct = safeAsymmetryPct(strong, weak);
  }

  // PASSING GATES
  if (testName === "Passing Gates") {
    const strong = num(scores, "passing_strong");
    const weak = num(scores, "passing_weak");
    const total = strong === null || weak === null ? null : strong + weak;
    metrics.passing_gates_strong_hits = strong;
    metrics.passing_gates_weak_hits = weak;
    metrics.passing_gates_total_hits = total;
    metrics.passing_gates_asymmetry_pct = safeAsymmetryPct(strong, weak);
  }

  // 1V1
  if (testName === "1v1") {
    const roundsRaw = (scores as { rounds?: unknown }).rounds;
    const rounds = Array.isArray(roundsRaw)
      ? roundsRaw.slice(0, 50).map((v) => toFiniteNumber(v))
      : extractIndexedNumbers(scores, "onevone_round_").slice(0, 50);
    metrics.one_v_one_avg_score = avgOfAll(rounds);
    metrics.one_v_one_total_score = sumOfAll(rounds);
    metrics.one_v_one_best_round = maxOfAll(rounds);
    metrics.one_v_one_worst_round = minOfAll(rounds);
    const best = maxOfAll(rounds);
    const worst = minOfAll(rounds);
    metrics.one_v_one_consistency_range =
      best === null || worst === null ? null : best - worst;
  }

  // JUGGLING
  if (testName === "Juggling") {
    const attempts = [1, 2, 3, 4].map((i) => num(scores, `juggling_${i}`));
    metrics.juggle_best = maxOfAll(attempts);
    metrics.juggle_best2_sum = sumTop2OfFour(attempts);
    metrics.juggle_avg_all = meanOfFour(attempts);
    metrics.juggle_total = sumOfAll(attempts);
    const maxV = maxOfAll(attempts);
    const minV = minOfAll(attempts);
    metrics.juggle_consistency_range =
      maxV === null || minV === null ? null : maxV - minV;
  }

  // SKILL MOVES
  if (testName === "Skill Moves") {
    const movesRaw = (scores as { moves?: unknown }).moves;
    const moves = Array.isArray(movesRaw)
      ? movesRaw.slice(0, 50).map((m) => {
          const obj = (m ?? {}) as Record<string, unknown>;
          const score = toFiniteNumber(obj.score);
          return score;
        })
      : [];
    const ratings =
      moves.length > 0 ? moves : extractIndexedNumbers(scores, "skillmove_").slice(0, 50);
    metrics.skill_moves_avg_rating = avgOfAll(ratings);
    metrics.skill_moves_total_rating = sumOfAll(ratings);
    metrics.skill_moves_best_rating = maxOfAll(ratings);
    metrics.skill_moves_worst_rating = minOfAll(ratings);
    const best = maxOfAll(ratings);
    const worst = minOfAll(ratings);
    metrics.skill_moves_consistency_range =
      best === null || worst === null ? null : best - worst;
  }

  // AGILITY
  if (testName === "5-10-5 Agility") {
    const trials = [1, 2, 3].map((i) => num(scores, `agility_${i}`));
    metrics.agility_5_10_5_best_time = minOfAll(trials);
    metrics.agility_5_10_5_avg_time = avgOfAll(trials);
    metrics.agility_5_10_5_worst_time = maxOfAll(trials);
    const best = minOfAll(trials);
    const worst = maxOfAll(trials);
    metrics.agility_5_10_5_consistency_range =
      best === null || worst === null ? null : worst - best;
  }

  // REACTION SPRINT
  if (testName === "Reaction Sprint") {
    const reactionTimes = [1, 2, 3].map((i) => num(scores, `reaction_cue_${i}`));
    const totalTimes = [1, 2, 3].map((i) => num(scores, `reaction_total_${i}`));
    metrics.reaction_5m_reaction_time_avg = avgOfAll(reactionTimes);
    metrics.reaction_5m_total_time_avg = avgOfAll(totalTimes);
    metrics.reaction_5m_reaction_time_best = minOfAll(reactionTimes);
    metrics.reaction_5m_total_time_best = minOfAll(totalTimes);
    metrics.reaction_5m_reaction_time_worst = maxOfAll(reactionTimes);
    metrics.reaction_5m_total_time_worst = maxOfAll(totalTimes);
  }

  // SINGLE-LEG HOP
  if (testName === "Single-leg Hop") {
    const left = [1, 2, 3].map((i) => num(scores, `hop_left_${i}`));
    const right = [1, 2, 3].map((i) => num(scores, `hop_right_${i}`));
    const leftMax = maxOfAll(left);
    const rightMax = maxOfAll(right);
    const hopMax =
      leftMax === null || rightMax === null
        ? null
        : Math.max(leftMax, rightMax);
    metrics.single_leg_hop_left = leftMax;
    metrics.single_leg_hop_right = rightMax;
    metrics.single_leg_hop_asymmetry_pct =
      hopMax === null || hopMax === 0
        ? null
        : (Math.abs((leftMax ?? 0) - (rightMax ?? 0)) / hopMax) * 100;
    metrics.single_leg_hop_left_avg = avgOfAll(left);
    metrics.single_leg_hop_right_avg = avgOfAll(right);
  }

  // DOUBLE-LEG JUMPS
  if (testName === "Double-leg Jumps") {
    const jumpsArr = [1, 2, 3].map((i) => num(scores, `jump_${i}`));
    metrics.double_leg_jumps_best = maxOfAll(jumpsArr);
    metrics.double_leg_jumps_avg = avgOfAll(jumpsArr);
  }

  // ANKLE DORSIFLEXION
  if (testName === "Ankle Dorsiflexion") {
    const leftIn = num(scores, "ankle_left");
    const rightIn = num(scores, "ankle_right");
    const leftCm = leftIn === null ? null : leftIn * 2.54;
    const rightCm = rightIn === null ? null : rightIn * 2.54;
    const avgCm =
      leftCm === null || rightCm === null ? null : (leftCm + rightCm) / 2;
    const ankleMax =
      leftCm === null || rightCm === null ? null : Math.max(leftCm, rightCm);
    metrics.ankle_dorsiflex_left_cm = leftCm;
    metrics.ankle_dorsiflex_right_cm = rightCm;
    metrics.ankle_dorsiflex_avg_cm = avgCm;
    metrics.ankle_dorsiflex_asymmetry_pct =
      ankleMax === null || ankleMax === 0
        ? null
        : (Math.abs((leftCm ?? 0) - (rightCm ?? 0)) / ankleMax) * 100;
  }

  // CORE PLANK
  if (testName === "Core Plank") {
    const hold = num(scores, "plank_time");
    const formFlag = num(scores, "plank_form");
    const goodForm =
      hold === null || formFlag === null ? null : formFlag === 1 ? hold : 0;
    metrics.core_plank_hold_sec = hold;
    metrics.core_plank_form_flag = formFlag;
    metrics.core_plank_hold_sec_if_good_form = goodForm;
  }

  return metrics;
}

function num(scores: Record<string, unknown>, key: string) {
  return toFiniteNumber(scores[key]);
}

function extractIndexedNumbers(
  scores: Record<string, unknown>,
  prefix: string
) {
  const entries = Object.entries(scores)
    .map(([k, v]) => {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(k);
      if (!m) return null;
      return [Number(m[1]), toFiniteNumber(v)] as const;
    })
    .filter(Boolean) as Array<readonly [number, number | null]>;

  entries.sort((a, b) => a[0] - b[0]);
  return entries.map((e) => e[1]);
}

function computeTestProgressions(
  byName: Map<string, PlayerTestRow[]>
): PlayerProfileData["test_progressions"] {
  const progressions: NonNullable<PlayerProfileData["test_progressions"]> = {};

  for (const [testName, testList] of byName.entries()) {
    if (testList.length === 0) continue;

    // Sort by date ascending (oldest first)
    const sorted = testList.slice().sort((a, b) => {
      if (a.test_date < b.test_date) return -1;
      if (a.test_date > b.test_date) return 1;
      return a.created_at.localeCompare(b.created_at);
    });

    const firstTest = sorted[0];
    const mostRecentTest = sorted[sorted.length - 1];
    const previousTest = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    // Compute metrics for each test
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

    // Compute timeline (all tests)
    const timeline = sorted.map((t) => ({
      test_date: t.test_date,
      test_id: t.id,
      metrics: computeMetricsForSingleTest(testName, t.scores ?? {}),
    }));

    // Compute changes
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

    // Calculate date range in days
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

export type PlayerProfileData = {
  version: 1;
  computed_at: string;
  sources: {
    tests_total: number;
    latest_tests: Array<{ id: string; test_name: string; test_date: string }>;
  };
  // Full raw test rows (all datapoints entered so far), stored for audit/history and future analysis.
  raw_tests: Array<{
    id: string;
    test_name: string;
    test_date: string;
    scores: Record<string, unknown>;
  }>;
  inputs: Record<string, Json>;
  metrics: Record<string, number | null>;
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

  function setMetric(key: string, value: number | null) {
    metrics[key] = value;
  }

  // POWER
  const power = latest.get("Power");
  if (power) {
    const s = power.scores ?? {};
    const strong = [1, 2, 3, 4].map((i) => num(s, `power_strong_${i}`));
    const weak = [1, 2, 3, 4].map((i) => num(s, `power_weak_${i}`));
    const strongAvg = meanOfFour(strong);
    const weakAvg = meanOfFour(weak);
    const strongMax = maxOf(strong);
    const weakMax = maxOf(weak);
    inputs.power = { strong, weak };
    setMetric("shot_power_strong_avg", strongAvg);
    setMetric("shot_power_weak_avg", weakAvg);
    setMetric("shot_power_strong_max", strongMax);
    setMetric("shot_power_weak_max", weakMax);
    setMetric("shot_power_weak_to_strong_ratio", safeRatio(weakAvg, strongAvg));
    setMetric("shot_power_asymmetry_pct", safeAsymmetryPct(strongAvg, weakAvg));
    setMetric(
      "shot_power_weak_to_strong_ratio_max",
      safeRatio(weakMax, strongMax)
    );
    setMetric(
      "shot_power_asymmetry_pct_max",
      safeAsymmetryPct(strongMax, weakMax)
    );
  }

  // SERVE DISTANCE
  const serve = latest.get("Serve Distance");
  if (serve) {
    const s = serve.scores ?? {};
    const strong = [1, 2, 3, 4].map((i) => num(s, `serve_strong_${i}`));
    const weak = [1, 2, 3, 4].map((i) => num(s, `serve_weak_${i}`));
    const strongAvg = meanOfFour(strong);
    const weakAvg = meanOfFour(weak);
    const strongMax = maxOf(strong);
    const weakMax = maxOf(weak);
    inputs.serve = { strong, weak };
    setMetric("serve_distance_strong_avg", strongAvg);
    setMetric("serve_distance_weak_avg", weakAvg);
    setMetric("serve_distance_strong_max", strongMax);
    setMetric("serve_distance_weak_max", weakMax);
    setMetric(
      "serve_distance_weak_to_strong_ratio",
      safeRatio(weakAvg, strongAvg)
    );
    setMetric(
      "serve_distance_asymmetry_pct",
      safeAsymmetryPct(strongAvg, weakAvg)
    );
    setMetric(
      "serve_distance_weak_to_strong_ratio_max",
      safeRatio(weakMax, strongMax)
    );
    setMetric(
      "serve_distance_asymmetry_pct_max",
      safeAsymmetryPct(strongMax, weakMax)
    );
  }

  // FIGURE 8
  const figure8 = latest.get("Figure 8 Loops");
  if (figure8) {
    const s = figure8.scores ?? {};
    const strong = num(s, "figure8_strong");
    const weak = num(s, "figure8_weak");
    const both = num(s, "figure8_both");
    inputs.figure8 = { strong, weak, both };
    setMetric("figure8_loops_strong", strong);
    setMetric("figure8_loops_weak", weak);
    setMetric("figure8_loops_both", both);
    setMetric("figure8_weak_to_strong_ratio", safeRatio(weak, strong));
    setMetric("figure8_both_to_strong_ratio", safeRatio(both, strong));
    setMetric("figure8_asymmetry_pct", safeAsymmetryPct(strong, weak));
  }

  // PASSING GATES
  const passing = latest.get("Passing Gates");
  if (passing) {
    const s = passing.scores ?? {};
    const strong = num(s, "passing_strong");
    const weak = num(s, "passing_weak");
    const total = strong === null || weak === null ? null : strong + weak;
    inputs.passing = { strong, weak };
    setMetric("passing_gates_strong_hits", strong);
    setMetric("passing_gates_weak_hits", weak);
    setMetric("passing_gates_total_hits", total);
    setMetric("passing_gates_weak_to_strong_ratio", safeRatio(weak, strong));
    setMetric("passing_gates_asymmetry_pct", safeAsymmetryPct(strong, weak));
    const weakShare = safeRatio(weak, total);
    setMetric(
      "passing_gates_weak_share_pct",
      weakShare === null ? null : weakShare * 100
    );
  }

  // 1v1
  const onevone = latest.get("1v1");
  if (onevone) {
    const s = onevone.scores ?? {};
    const roundsRaw = (s as { rounds?: unknown }).rounds;
    const rounds = Array.isArray(roundsRaw)
      ? roundsRaw.slice(0, 50).map((v) => toFiniteNumber(v))
      : extractIndexedNumbers(s, "onevone_round_").slice(0, 50);
    inputs.onevone = { rounds };
    setMetric("one_v_one_avg_score", avgOfAll(rounds));
    setMetric("one_v_one_total_score", sumOfAll(rounds));
    setMetric("one_v_one_best_round", maxOfAll(rounds));
    setMetric("one_v_one_worst_round", minOfAll(rounds));
    const best = maxOfAll(rounds);
    const worst = minOfAll(rounds);
    setMetric(
      "one_v_one_consistency_range",
      best === null || worst === null ? null : best - worst
    );
  }

  // JUGGLING
  const juggling = latest.get("Juggling");
  if (juggling) {
    const s = juggling.scores ?? {};
    const attempts = [1, 2, 3, 4].map((i) => num(s, `juggling_${i}`));
    inputs.juggling = { attempts };
    setMetric("juggle_best", maxOfAll(attempts));
    setMetric("juggle_best2_sum", sumTop2OfFour(attempts));
    setMetric("juggle_avg_all", meanOfFour(attempts));
    setMetric("juggle_total", sumOfAll(attempts));
    const maxV = maxOfAll(attempts);
    const minV = minOfAll(attempts);
    setMetric(
      "juggle_consistency_range",
      maxV === null || minV === null ? null : maxV - minV
    );
  }

  // SKILL MOVES
  const skillMoves = latest.get("Skill Moves");
  if (skillMoves) {
    const s = skillMoves.scores ?? {};
    const movesRaw = (s as { moves?: unknown }).moves;
    const moves = Array.isArray(movesRaw)
      ? movesRaw.slice(0, 50).map((m) => {
          const obj = (m ?? {}) as Record<string, unknown>;
          const name = String(obj.name ?? "").trim() || "Move";
          const score = toFiniteNumber(obj.score);
          return { name, score };
        })
      : [];

    const ratings =
      moves.length > 0
        ? moves.map((m) => m.score)
        : extractIndexedNumbers(s, "skillmove_").slice(0, 50);

    inputs.skillmoves = { moves, ratings };
    setMetric("skill_moves_avg_rating", avgOfAll(ratings));
    setMetric("skill_moves_total_rating", sumOfAll(ratings));
    setMetric("skill_moves_best_rating", maxOfAll(ratings));
    setMetric("skill_moves_worst_rating", minOfAll(ratings));
    const best = maxOfAll(ratings);
    const worst = minOfAll(ratings);
    setMetric(
      "skill_moves_consistency_range",
      best === null || worst === null ? null : best - worst
    );
  }

  // AGILITY
  const agility = latest.get("5-10-5 Agility");
  if (agility) {
    const s = agility.scores ?? {};
    const trials = [1, 2, 3].map((i) => num(s, `agility_${i}`));
    inputs.agility = { trials };
    setMetric("agility_5_10_5_best_time", minOfAll(trials));
    setMetric("agility_5_10_5_avg_time", avgOfAll(trials));
    setMetric("agility_5_10_5_worst_time", maxOfAll(trials));
    const best = minOfAll(trials);
    const worst = maxOfAll(trials);
    setMetric(
      "agility_5_10_5_consistency_range",
      best === null || worst === null ? null : worst - best
    );
  }

  // REACTION SPRINT
  const reaction = latest.get("Reaction Sprint");
  if (reaction) {
    const s = reaction.scores ?? {};
    const reactionTimes = [1, 2, 3].map((i) => num(s, `reaction_cue_${i}`));
    const totalTimes = [1, 2, 3].map((i) => num(s, `reaction_total_${i}`));
    inputs.reaction5m = { reactionTimes, totalTimes };
    setMetric("reaction_5m_reaction_time_avg", avgOfAll(reactionTimes));
    setMetric("reaction_5m_total_time_avg", avgOfAll(totalTimes));
    setMetric("reaction_5m_reaction_time_best", minOfAll(reactionTimes));
    setMetric("reaction_5m_total_time_best", minOfAll(totalTimes));
    setMetric("reaction_5m_reaction_time_worst", maxOfAll(reactionTimes));
    setMetric("reaction_5m_total_time_worst", maxOfAll(totalTimes));
    const bestR = minOfAll(reactionTimes);
    const worstR = maxOfAll(reactionTimes);
    const bestT = minOfAll(totalTimes);
    const worstT = maxOfAll(totalTimes);
    setMetric(
      "reaction_5m_reaction_consistency_range",
      bestR === null || worstR === null ? null : worstR - bestR
    );
    setMetric(
      "reaction_5m_total_consistency_range",
      bestT === null || worstT === null ? null : worstT - bestT
    );
  }

  // SINGLE-LEG HOP
  const hop = latest.get("Single-leg Hop");
  if (hop) {
    const s = hop.scores ?? {};
    const left = [1, 2, 3].map((i) => num(s, `hop_left_${i}`));
    const right = [1, 2, 3].map((i) => num(s, `hop_right_${i}`));
    const leftMax = maxOfAll(left);
    const rightMax = maxOfAll(right);
    const hopMax =
      leftMax === null || rightMax === null
        ? null
        : Math.max(leftMax, rightMax);
    inputs.hop = { left, right };
    setMetric("single_leg_hop_left", leftMax);
    setMetric("single_leg_hop_right", rightMax);
    setMetric(
      "single_leg_hop_asymmetry_pct",
      hopMax === null || hopMax === 0
        ? null
        : (Math.abs((leftMax ?? 0) - (rightMax ?? 0)) / hopMax) * 100
    );
    setMetric("single_leg_hop_left_avg", avgOfAll(left));
    setMetric("single_leg_hop_right_avg", avgOfAll(right));
    const leftRange = (() => {
      const maxV = maxOfAll(left);
      const minV = minOfAll(left);
      return maxV === null || minV === null ? null : maxV - minV;
    })();
    const rightRange = (() => {
      const maxV = maxOfAll(right);
      const minV = minOfAll(right);
      return maxV === null || minV === null ? null : maxV - minV;
    })();
    setMetric("single_leg_hop_left_consistency_range", leftRange);
    setMetric("single_leg_hop_right_consistency_range", rightRange);
  }

  // DOUBLE-LEG JUMPS
  const jumps = latest.get("Double-leg Jumps");
  if (jumps) {
    const s = jumps.scores ?? {};
    const jumpsArr = [1, 2, 3].map((i) => num(s, `jump_${i}`));
    inputs.jumps = {
      jump1: jumpsArr[0],
      jump2: jumpsArr[1],
      jump3: jumpsArr[2],
    };
    setMetric("double_leg_jumps_best", maxOfAll(jumpsArr));
    setMetric("double_leg_jumps_avg", avgOfAll(jumpsArr));
  }

  // ANKLE DORSIFLEXION (stored in inches, convert to cm like your old code)
  const ankle = latest.get("Ankle Dorsiflexion");
  if (ankle) {
    const s = ankle.scores ?? {};
    const leftIn = num(s, "ankle_left");
    const rightIn = num(s, "ankle_right");
    const leftCm = leftIn === null ? null : leftIn * 2.54;
    const rightCm = rightIn === null ? null : rightIn * 2.54;
    const avgCm =
      leftCm === null || rightCm === null ? null : (leftCm + rightCm) / 2;
    const ankleMax =
      leftCm === null || rightCm === null ? null : Math.max(leftCm, rightCm);
    inputs.ankle = { leftIn, rightIn };
    setMetric("ankle_dorsiflex_left_cm", leftCm);
    setMetric("ankle_dorsiflex_right_cm", rightCm);
    setMetric("ankle_dorsiflex_avg_cm", avgCm);
    setMetric(
      "ankle_dorsiflex_asymmetry_pct",
      ankleMax === null || ankleMax === 0
        ? null
        : (Math.abs((leftCm ?? 0) - (rightCm ?? 0)) / ankleMax) * 100
    );
    setMetric(
      "ankle_dorsiflex_left_minus_right_cm",
      leftCm === null || rightCm === null ? null : leftCm - rightCm
    );
  }

  // CORE PLANK
  const plank = latest.get("Core Plank");
  if (plank) {
    const s = plank.scores ?? {};
    const hold = num(s, "plank_time");
    const formFlag = num(s, "plank_form");
    const goodForm =
      hold === null || formFlag === null ? null : formFlag === 1 ? hold : 0;
    inputs.plank = { hold, formFlag };
    setMetric("core_plank_hold_sec", hold);
    setMetric("core_plank_form_flag", formFlag);
    setMetric("core_plank_hold_sec_if_good_form", goodForm);
  }

  // Comparisons vs previous snapshot (simple but useful)
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

  // Also include the full raw test history keys to enable future analysis.
  inputs.test_history = Array.from(byName.entries()).map(([name, list]) => ({
    test_name: name,
    entries: list
      .slice()
      .sort((a, b) =>
        a.test_date < b.test_date ? 1 : a.test_date > b.test_date ? -1 : 0
      )
      .map((t) => ({ id: t.id, test_date: t.test_date })),
  })) as unknown as Json;

  // Compute test progressions (first → latest, with timeline)
  const test_progressions = computeTestProgressions(byName);

  return {
    version: 1,
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
    comparisons,
    test_progressions,
  };
}
