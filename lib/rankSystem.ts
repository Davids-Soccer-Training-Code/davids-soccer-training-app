// Rank system: Black → Green → Red → Blue → Platinum → Diamond → Master.
//
// Single source of truth for the rank ladder, per-test rank requirements, and the
// pure functions that auto-derive a player's rank from the scores the coach enters.
//
// A player progresses by passing every requirement for a rank. Each of the 8 rank
// tests stores one comprehensive score schema covering every tier's drill, so the
// system can evaluate which rank that test has reached. The overall ("main") rank is
// gated by: all 8 tests at >= that rank, the session minimum, and that rank's Coach
// Mission being completed.

export type RankKey =
  | "black"
  | "green"
  | "red"
  | "blue"
  | "platinum"
  | "diamond"
  | "master";

export type RankDef = {
  key: RankKey;
  index: number;
  name: string; // full display name
  shortName: string;
  color: string; // hex, used for ladders / badges
};

export const RANKS: RankDef[] = [
  { key: "black", index: 0, name: "Black Foundation", shortName: "Black", color: "#111827" },
  { key: "green", index: 1, name: "Green Control", shortName: "Green", color: "#16a34a" },
  { key: "red", index: 2, name: "Red Competitor", shortName: "Red", color: "#dc2626" },
  { key: "blue", index: 3, name: "Blue Playmaker", shortName: "Blue", color: "#2563eb" },
  { key: "platinum", index: 4, name: "Platinum Technician", shortName: "Platinum", color: "#94a3b8" },
  { key: "diamond", index: 5, name: "Diamond Elite", shortName: "Diamond", color: "#38bdf8" },
  { key: "master", index: 6, name: "Master Rank", shortName: "Master", color: "#7c3aed" },
];

// Ranks that must be earned, in progression order (Black is the base everyone starts at).
export const EARNED_RANKS: Exclude<RankKey, "black">[] = [
  "green",
  "red",
  "blue",
  "platinum",
  "diamond",
  "master",
];

export const RANK_BY_KEY: Record<RankKey, RankDef> = Object.fromEntries(
  RANKS.map((r) => [r.key, r])
) as Record<RankKey, RankDef>;

export function getRank(key: RankKey): RankDef {
  return RANK_BY_KEY[key];
}

export function rankFromIndex(index: number): RankDef {
  const clamped = Math.max(0, Math.min(RANKS.length - 1, index));
  return RANKS[clamped];
}

// Blend two hex colors (t = 0 → a, 1 → b).
function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const ai = [0, 2, 4].map((i) => parseInt(pa.slice(i, i + 2), 16));
  const bi = [0, 2, 4].map((i) => parseInt(pb.slice(i, i + 2), 16));
  const mixed = ai.map((v, i) => Math.round(v + (bi[i] - v) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Player-card banner gradient: brand green on one side fading into the rank
// color on the other ("half green, half rank"), so both colors read distinctly
// rather than blending into one muddy tone. Black/base keeps plain green (null).
export function rankBannerGradient(
  rankKey: RankKey
): { from: string; to: string } | null {
  if (rankKey === "black") return null;
  const rc = RANK_BY_KEY[rankKey].color;
  return {
    from: mixHex("#10b981", rc, 0.25), // mostly brand green
    to: mixHex("#0f7a52", rc, 0.85), // mostly rank color (not 100%)
  };
}

// Session minimums per rank (gate). Sequential gating enforces Blue's 16 before Platinum.
export const SESSION_MINIMUMS: Record<RankKey, number> = {
  black: 0,
  green: 6,
  red: 12,
  blue: 16,
  platinum: 12,
  diamond: 12,
  master: 12,
};

// The 8 rank tests, by their stored `test_name`. Order is used for display.
export const RANK_TESTS = [
  "Juggling",
  "Dribbling",
  "Passing",
  "Power",
  "Distance",
  "Skill Moves",
  "Shooting Accuracy",
  "First Touch",
] as const;
export type RankTestName = (typeof RANK_TESTS)[number];

export function isRankTest(name: string): name is RankTestName {
  return (RANK_TESTS as readonly string[]).includes(name);
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

type Scores = Record<string, unknown>;

function num(scores: Scores, key: string): number | null {
  const v = scores[key];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function atLeast(value: number | null, min: number): boolean {
  return value !== null && value >= min;
}

function bestOf(scores: Scores, keys: string[]): number | null {
  const nums = keys
    .map((k) => num(scores, k))
    .filter((x): x is number => x !== null);
  return nums.length ? Math.max(...nums) : null;
}


// ---------------------------------------------------------------------------
// Per-test, per-rank requirements (label + machine check)
// ---------------------------------------------------------------------------

// A requirement is a label + one or more numeric conditions (value >= min).
// All conditions must pass; "progress" is the weakest condition's ratio.
type Condition = { value: (s: Scores) => number | null; min: number };

export type RankRequirement = {
  label: string;
  conditions: Condition[];
};

type TestRequirements = Record<Exclude<RankKey, "black">, RankRequirement>;

const POWER_STRONG = ["power_strong_1", "power_strong_2", "power_strong_3", "power_strong_4"];
const POWER_WEAK = ["power_weak_1", "power_weak_2", "power_weak_3", "power_weak_4"];
const DIST_STRONG = ["serve_strong_1", "serve_strong_2", "serve_strong_3", "serve_strong_4"];
const DIST_WEAK = ["serve_weak_1", "serve_weak_2", "serve_weak_3", "serve_weak_4"];

const cNum = (key: string, min: number): Condition => ({ value: (s) => num(s, key), min });
const cBest = (keys: string[], min: number): Condition => ({ value: (s) => bestOf(s, keys), min });
const cEach = (keys: string[], min: number): Condition[] => keys.map((k) => cNum(k, min));

function powerReq(min: number): RankRequirement {
  return {
    label: `Power ${min}+ (strong and weak)`,
    conditions: [cBest(POWER_STRONG, min), cBest(POWER_WEAK, min)],
  };
}
function distanceReq(strong: number, weak: number): RankRequirement {
  return {
    label: `${strong} yds strong, ${weak} yds weak`,
    conditions: [cBest(DIST_STRONG, strong), cBest(DIST_WEAK, weak)],
  };
}

const FIG8 = ["figure8_strong", "figure8_weak", "figure8_both"];
const CROSS = ["crossdribble_strong", "crossdribble_weak", "crossdribble_both"];
const OBST = ["obstacle_strong", "obstacle_weak", "obstacle_both"];

export const REQUIREMENTS: Record<RankTestName, TestRequirements> = {
  Juggling: {
    green: { label: "50 juggles (any surface)", conditions: [cNum("juggle_any", 50)] },
    red: { label: "100 juggles, feet only", conditions: [cNum("juggle_feet_only", 100)] },
    blue: { label: "14 body-part juggling challenge", conditions: [cNum("juggle_bodypart", 14)] },
    platinum: { label: "300 speed touches in 3 min", conditions: [cNum("juggle_speed_3min", 300)] },
    diamond: { label: "14-in-14 touches", conditions: [cNum("juggle_14in14_reps", 1)] },
    master: {
      label: "Weak-foot ladder 100 + 14-in-14 three in a row",
      conditions: [cNum("juggle_weakfoot_ladder", 100), cNum("juggle_14in14_reps", 3)],
    },
  },
  Dribbling: {
    green: { label: "6 figure-8 loops (strong/weak/both)", conditions: cEach(FIG8, 6) },
    red: { label: "7.5 figure-8 loops (strong/weak/both)", conditions: cEach(FIG8, 7.5) },
    blue: { label: "15 cross-dribble loops (strong/weak/both)", conditions: cEach(CROSS, 15) },
    platinum: { label: "20 cross-dribble loops (strong/weak/both)", conditions: cEach(CROSS, 20) },
    diamond: { label: "4.00+ obstacle shuttle sets (strong/weak/both)", conditions: cEach(OBST, 4) },
    master: { label: "6.00+ obstacle shuttle sets (strong/weak/both)", conditions: cEach(OBST, 6) },
  },
  Passing: {
    green: { label: "2 strong + 2 weak gate passes", conditions: [cNum("passing_strong", 2), cNum("passing_weak", 2)] },
    red: { label: "3 strong + 3 weak gate passes", conditions: [cNum("passing_strong", 3), cNum("passing_weak", 3)] },
    blue: { label: "4 strong + 4 weak gate passes", conditions: [cNum("passing_strong", 4), cNum("passing_weak", 4)] },
    platinum: { label: "10 each foot to color mini-goal", conditions: [cNum("passing_color_strong", 10), cNum("passing_color_weak", 10)] },
    diamond: { label: "10+ each foot, read raised color", conditions: [cNum("passing_color_read_strong", 10), cNum("passing_color_read_weak", 10)] },
    master: { label: "10+ each foot through 2-yd gate", conditions: [cNum("passing_gate2yd_strong", 10), cNum("passing_gate2yd_weak", 10)] },
  },
  Power: {
    green: powerReq(30), red: powerReq(40), blue: powerReq(45),
    platinum: powerReq(50), diamond: powerReq(55), master: powerReq(60),
  },
  Distance: {
    green: distanceReq(15, 12), red: distanceReq(21, 18), blue: distanceReq(25, 20),
    platinum: distanceReq(30, 30), diamond: distanceReq(35, 35), master: distanceReq(40, 40),
  },
  "Skill Moves": {
    green: { label: "4 different moves each foot", conditions: [cNum("skill_moves_count", 4)] },
    red: { label: "8 different moves", conditions: [cNum("skill_moves_count", 8)] },
    blue: { label: "12 moves + live application 75%+", conditions: [cNum("skill_moves_count", 12), cNum("skill_live_app_pct", 75)] },
    platinum: { label: "12 moves + 4 combos", conditions: [cNum("skill_moves_count", 12), cNum("skill_combos_count", 4)] },
    diamond: { label: "12 moves + 8 combos + live 75%+", conditions: [cNum("skill_moves_count", 12), cNum("skill_combos_count", 8), cNum("skill_live_app_pct", 75)] },
    master: { label: "12 moves + 12 combos + live 75%+", conditions: [cNum("skill_moves_count", 12), cNum("skill_combos_count", 12), cNum("skill_live_app_pct", 75)] },
  },
  "Shooting Accuracy": {
    green: { label: "Bottom corners 6× — penalty/inside box (10 balls)", conditions: [cNum("shoot_bottom_pen", 6)] },
    red: { label: "Bottom corners 6× — top of 18 (10 balls)", conditions: [cNum("shoot_bottom_top18", 6)] },
    blue: { label: "Bottom corners 8× — moving ball, top of 18 (15 balls)", conditions: [cNum("shoot_bottom_moving", 8)] },
    platinum: { label: "All 4 corners once — penalty spot (10 balls)", conditions: [cNum("shoot_4corners_pen", 4)] },
    diamond: { label: "All 4 corners once — top of 18 (10 balls)", conditions: [cNum("shoot_4corners_top18", 4)] },
    master: { label: "All 4 corners twice — moving ball (15 balls)", conditions: [cNum("shoot_4corners_moving", 4)] },
  },
  "First Touch": {
    green: { label: "5x5 box, ground, reach 15 yds (max 3 touches)", conditions: [cNum("ft_ground_5x5_yards", 15)] },
    red: { label: "5x5 box, ground, reach 20 yds (max 3 touches)", conditions: [cNum("ft_ground_5x5_yards", 20)] },
    blue: { label: "3x3 box, ground, reach 25 yds (1 touch)", conditions: [cNum("ft_ground_3x3_1touch_yards", 25)] },
    platinum: { label: "3x3 box, aerial, reach 10 yds (max 3 touches)", conditions: [cNum("ft_aerial_3x3_yards", 10)] },
    diamond: { label: "3x3 box, aerial, reach 15 yds (max 3 touches)", conditions: [cNum("ft_aerial_3x3_yards", 15)] },
    master: { label: "3x3 box, aerial, reach 20 yds (1 touch)", conditions: [cNum("ft_aerial_3x3_1touch_yards", 20)] },
  },
};

export function checkRequirement(req: RankRequirement, s: Scores): boolean {
  return req.conditions.every((c) => atLeast(c.value(s), c.min));
}

// Merge a test's score rows (ordered newest-first) into one effective score
// object, taking the most recent non-blank value for each field. Different rank
// tiers of the same test use different fields (e.g. Dribbling green/red read the
// figure-8 loops, blue reads the cross-dribble loops), and a coach often records
// only one tier in a given session. Evaluating rank from the single latest row
// alone would treat the untouched fields as blank and wipe out earned progress,
// so we carry each field's last recorded reading forward.
export function mergeScoreHistory(
  rowsNewestFirst: Array<Scores | null | undefined>
): Scores {
  const merged: Scores = {};
  for (const row of rowsNewestFirst) {
    if (!row) continue;
    for (const [key, value] of Object.entries(row)) {
      if (key in merged) continue;
      if (value === null || value === undefined || value === "") continue;
      merged[key] = value;
    }
  }
  return merged;
}

// 0..1 — how close the scores are to satisfying the requirement (weakest link).
export function requirementProgress(req: RankRequirement, s: Scores): number {
  if (!req.conditions.length) return 1;
  let worst = 1;
  for (const c of req.conditions) {
    const v = c.value(s) ?? 0;
    const ratio = c.min <= 0 ? 1 : Math.max(0, Math.min(1, v / c.min));
    if (ratio < worst) worst = ratio;
  }
  return worst;
}

export function testRankProgress(
  testName: string,
  rank: Exclude<RankKey, "black">,
  scores: Scores
): number {
  const req = REQUIREMENTS[testName as RankTestName]?.[rank];
  return req ? requirementProgress(req, scores) : 0;
}

// ---------------------------------------------------------------------------
// Field relevance per rank
// ---------------------------------------------------------------------------
// The lowest rank (index) at which each score field / metric becomes relevant.
// Used to hide advanced-rank fields from players who aren't there yet (e.g. a
// Green player shouldn't see the Platinum "color mini-goal" passing inputs).
// Fields not listed here (Power, Distance attempts, etc.) are always relevant.
export const RANK_TEST_FIELD_TIERS: Record<string, Record<string, number>> = {
  Juggling: {
    juggle_any: 1,
    juggle_feet_only: 2,
    juggle_bodypart: 3,
    juggle_speed_3min: 4,
    juggle_14in14_reps: 5,
    juggle_weakfoot_ladder: 6,
  },
  Dribbling: {
    figure8_strong: 1,
    figure8_weak: 1,
    figure8_both: 1,
    crossdribble_strong: 3,
    crossdribble_weak: 3,
    crossdribble_both: 3,
    obstacle_strong: 5,
    obstacle_weak: 5,
    obstacle_both: 5,
  },
  Passing: {
    passing_strong: 1,
    passing_weak: 1,
    passing_color_strong: 4,
    passing_color_weak: 4,
    passing_color_read_strong: 5,
    passing_color_read_weak: 5,
    passing_gate2yd_strong: 6,
    passing_gate2yd_weak: 6,
  },
  "Skill Moves": {
    skill_moves_count: 1,
    skill_live_app_pct: 3,
    skill_combos_count: 4,
  },
  "Shooting Accuracy": {
    shoot_bottom_pen: 1,
    shoot_bottom_top18: 2,
    shoot_bottom_moving: 3,
    shoot_4corners_pen: 4,
    shoot_4corners_top18: 5,
    shoot_4corners_moving: 6,
  },
  "First Touch": {
    ft_ground_5x5_yards: 1,
    ft_ground_3x3_1touch_yards: 3,
    ft_aerial_3x3_yards: 4,
    ft_aerial_3x3_1touch_yards: 6,
  },
};

// Lowest rank index at which a field/metric key matters (default 1 = always shown).
export function metricRankIndex(testName: string, key: string): number {
  return RANK_TEST_FIELD_TIERS[testName]?.[key] ?? 1;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type TestRankResult = {
  // Raw per-rank pass/fail (a higher tier can pass even if a lower one is blank).
  passedByRank: Record<RankKey, boolean>;
  // Highest *contiguous* rank reached from Green upward (the displayed rank for the test).
  rankIndex: number;
  rank: RankKey;
};

export function evaluateTest(testName: string, scores: Scores | null | undefined): TestRankResult {
  const s = scores ?? {};
  const req = REQUIREMENTS[testName as RankTestName];
  const passedByRank: Record<RankKey, boolean> = {
    black: true,
    green: false,
    red: false,
    blue: false,
    platinum: false,
    diamond: false,
    master: false,
  };

  let rankIndex = 0;
  let contiguous = true;
  for (const rk of EARNED_RANKS) {
    const passed = req ? checkRequirement(req[rk], s) : false;
    passedByRank[rk] = passed;
    if (passed && contiguous) {
      rankIndex = RANK_BY_KEY[rk].index;
    } else {
      contiguous = false;
    }
  }

  return { passedByRank, rankIndex, rank: rankFromIndex(rankIndex).key };
}

export type OverallRankResult = {
  rankIndex: number;
  rank: RankKey;
};

export function computeOverallRank(args: {
  perTest: Record<string, TestRankResult>;
  sessionCount: number;
  missionDoneByRank: Record<RankKey, boolean>;
}): OverallRankResult {
  let rankIndex = 0;
  for (const rk of EARNED_RANKS) {
    const allTestsPass = RANK_TESTS.every(
      (t) => args.perTest[t]?.passedByRank?.[rk] === true
    );
    const sessionsOk = args.sessionCount >= SESSION_MINIMUMS[rk];
    const missionOk = args.missionDoneByRank[rk] === true;
    if (allTestsPass && sessionsOk && missionOk) {
      rankIndex = RANK_BY_KEY[rk].index;
    } else {
      break;
    }
  }
  return { rankIndex, rank: rankFromIndex(rankIndex).key };
}

// ---------------------------------------------------------------------------
// Next-rank checklist (drives the player "how to rank up" UI)
// ---------------------------------------------------------------------------

export type ChecklistItem = {
  key: string; // test name, "sessions", or "mission"
  kind: "test" | "sessions" | "mission";
  label: string;
  requirement: string;
  ok: boolean;
  progress: number; // 0..1 how close to meeting this item
  detail?: string;
};

export type NextRankChecklist = {
  targetRank: RankKey | null; // null when already at Master
  items: ChecklistItem[];
};

export function nextRankChecklist(args: {
  currentRankIndex: number;
  perTest: Record<string, TestRankResult>;
  sessionCount: number;
  missionDoneByRank: Record<RankKey, boolean>;
  latestScores?: Record<string, Scores>;
}): NextRankChecklist {
  const targetIndex = args.currentRankIndex + 1;
  if (targetIndex >= RANKS.length) {
    return { targetRank: null, items: [] };
  }
  const target = RANKS[targetIndex];
  const rk = target.key as Exclude<RankKey, "black">;

  const items: ChecklistItem[] = RANK_TESTS.map((t) => {
    const ok = args.perTest[t]?.passedByRank?.[rk] === true;
    const progress = ok
      ? 1
      : testRankProgress(t, rk, args.latestScores?.[t] ?? {});
    return {
      key: t,
      kind: "test" as const,
      label: t,
      requirement: REQUIREMENTS[t][rk].label,
      ok,
      progress,
    };
  });

  const min = SESSION_MINIMUMS[rk];
  items.push({
    key: "sessions",
    kind: "sessions",
    label: "Sessions",
    requirement: `${min} sessions completed`,
    ok: args.sessionCount >= min,
    progress: min <= 0 ? 1 : Math.max(0, Math.min(1, args.sessionCount / min)),
    detail: `${args.sessionCount} / ${min}`,
  });

  const missionOk = args.missionDoneByRank[rk] === true;
  items.push({
    key: "mission",
    kind: "mission",
    label: "Coach Mission",
    requirement: `Complete the ${target.shortName} coach mission`,
    ok: missionOk,
    progress: missionOk ? 1 : 0,
  });

  return { targetRank: target.key, items };
}

// Build the missionDoneByRank map from a list of the player's missions.
export function missionDoneByRankFrom(
  missions: Array<{ target_rank: string; status: string }>
): Record<RankKey, boolean> {
  const done: Record<RankKey, boolean> = {
    black: true,
    green: false,
    red: false,
    blue: false,
    platinum: false,
    diamond: false,
    master: false,
  };
  for (const m of missions) {
    if (m.status === "completed" && m.target_rank in done) {
      done[m.target_rank as RankKey] = true;
    }
  }
  return done;
}
