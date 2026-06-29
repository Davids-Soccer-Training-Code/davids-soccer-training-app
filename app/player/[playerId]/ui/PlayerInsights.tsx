"use client";

import { TEST_DEFINITIONS } from "@/lib/testDefinitions";
import {
  evaluateTest,
  metricRankIndex,
  isRankTest,
  mergeScoreHistory,
  RANK_BY_KEY,
} from "@/lib/rankSystem";
import { RankBadge } from "./RankLadder";
import { useEffect, useMemo, useRef, useState } from "react";

type Profile = {
  id: string;
  player_id: string;
  name: string;
  computed_at: string;
  data: {
    raw_tests?: Array<{
      id: string;
      test_name: string;
      test_date: string;
      scores: Record<string, unknown>;
    }>;
    inputs?: Record<string, unknown>;
    metrics?: Record<string, number | null>;
    comparisons?: { deltas?: Record<string, number | null> };
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
};

type PlayerTest = {
  id: string;
  player_id: string;
  test_name: string;
  test_date: string; // YYYY-MM-DD
  scores: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};


function fmt(n: number | null | undefined, decimals = 2) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(decimals);
}

function fmtInt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return String(Math.round(n));
}

function fmtPct(n: number | null | undefined, decimals = 1) {
  if (n === null || n === undefined) return "—";
  return `${Number(n).toFixed(decimals)}%`;
}

function fmtSigned(n: number | null | undefined, decimals = 2) {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}`;
}

function nonZeroDelta(
  n: number | null | undefined,
  epsilon = 1e-9
): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.abs(v) < epsilon ? null : v;
}

function normalizeTestLookup(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

type DerivedMetric = {
  key: string;
  label: string;
  description: string;
  valueFmt?: (n: number | null | undefined) => string;
  deltaFmt?: (n: number | null | undefined) => string | null;
};

const PROGRESS_METRICS_BY_TEST: Record<
  string,
  Array<{
    key: string;
    label: string;
    valueFmt?: (n: number | null | undefined) => string;
    lowerIsBetter?: boolean;
  }>
> = {
  Power: [
    { key: "shot_power_strong_max", label: "Strong best", valueFmt: fmtInt },
    { key: "shot_power_weak_max", label: "Weak best", valueFmt: fmtInt },
    {
      key: "shot_power_asymmetry_pct",
      label: "Asymmetry",
      valueFmt: fmtPct,
      lowerIsBetter: true,
    },
  ],
  Distance: [
    { key: "serve_distance_strong_max", label: "Strong best", valueFmt: fmtInt },
    { key: "serve_distance_weak_max", label: "Weak best", valueFmt: fmtInt },
    {
      key: "serve_distance_asymmetry_pct",
      label: "Asymmetry",
      valueFmt: fmtPct,
      lowerIsBetter: true,
    },
  ],
  Dribbling: [
    { key: "figure8_strong", label: "Figure-8 strong", valueFmt: fmt },
    { key: "crossdribble_strong", label: "Cross-dribble strong", valueFmt: fmt },
    { key: "obstacle_strong", label: "Obstacle strong", valueFmt: fmt },
  ],
  Passing: [
    { key: "passing_strong", label: "Gate strong", valueFmt: fmtInt },
    { key: "passing_weak", label: "Gate weak", valueFmt: fmtInt },
    { key: "passing_color_strong", label: "Color goal strong", valueFmt: fmtInt },
    { key: "passing_color_weak", label: "Color goal weak", valueFmt: fmtInt },
    { key: "passing_color_read_strong", label: "Read-color strong", valueFmt: fmtInt },
    { key: "passing_color_read_weak", label: "Read-color weak", valueFmt: fmtInt },
    { key: "passing_gate2yd_strong", label: "2-yd gate strong", valueFmt: fmtInt },
    { key: "passing_gate2yd_weak", label: "2-yd gate weak", valueFmt: fmtInt },
  ],
  Juggling: [
    { key: "juggle_any", label: "Juggles (any)", valueFmt: fmtInt },
    { key: "juggle_feet_only", label: "Feet only", valueFmt: fmtInt },
  ],
  "Skill Moves": [
    { key: "skill_moves_count", label: "Moves", valueFmt: fmtInt },
    { key: "skill_combos_count", label: "Combos", valueFmt: fmtInt },
  ],
  "Shooting Accuracy": [
    { key: "shoot_bottom_pen", label: "Bottom (penalty)", valueFmt: fmtInt },
    { key: "shoot_bottom_top18", label: "Bottom (top 18)", valueFmt: fmtInt },
  ],
  "First Touch": [
    { key: "ft_ground_5x5_yards", label: "Ground reach (yds)", valueFmt: fmtInt },
    { key: "ft_aerial_3x3_yards", label: "Aerial reach (yds)", valueFmt: fmtInt },
  ],
  "5-10-5 Agility": [
    {
      key: "agility_5_10_5_best_time",
      label: "Best time",
      valueFmt: fmt,
      lowerIsBetter: true,
    },
    {
      key: "agility_5_10_5_avg_time",
      label: "Avg time",
      valueFmt: fmt,
      lowerIsBetter: true,
    },
  ],
  "Single-leg Hop": [
    { key: "single_leg_hop_left", label: "Left max", valueFmt: fmtInt },
    { key: "single_leg_hop_right", label: "Right max", valueFmt: fmtInt },
    {
      key: "single_leg_hop_asymmetry_pct",
      label: "Asymmetry",
      valueFmt: fmtPct,
      lowerIsBetter: true,
    },
  ],
  "Double-leg Jumps": [
    { key: "double_leg_jumps_best", label: "Best distance", valueFmt: fmtInt },
    { key: "double_leg_jumps_avg", label: "Avg distance", valueFmt: fmt },
  ],
};

const DERIVED_METRICS_BY_TEST: Record<string, DerivedMetric[]> = {
  Power: [
    {
      key: "shot_power_strong_avg",
      label: "Strong avg",
      description: "Average of the 4 strong-foot shot power attempts.",
      valueFmt: fmt,
    },
    {
      key: "shot_power_weak_avg",
      label: "Weak avg",
      description: "Average of the 4 weak-foot shot power attempts.",
      valueFmt: fmt,
    },
    {
      key: "shot_power_asymmetry_pct",
      label: "Asymmetry",
      description:
        "Percent difference between strong and weak averages (higher = bigger gap).",
      valueFmt: fmtPct,
    },
    {
      key: "shot_power_strong_max",
      label: "Strong max",
      description: "Best (highest) strong-foot shot power attempt.",
      valueFmt: fmtInt,
    },
    {
      key: "shot_power_weak_max",
      label: "Weak max",
      description: "Best (highest) weak-foot shot power attempt.",
      valueFmt: fmtInt,
    },
  ],
  Distance: [
    {
      key: "serve_distance_strong_max",
      label: "Strong best",
      description: "Best (farthest) strong-foot distance.",
      valueFmt: fmtInt,
    },
    {
      key: "serve_distance_weak_max",
      label: "Weak best",
      description: "Best (farthest) weak-foot distance.",
      valueFmt: fmtInt,
    },
    {
      key: "serve_distance_strong_avg",
      label: "Strong avg",
      description: "Average of the 4 strong-foot distances.",
      valueFmt: fmt,
    },
    {
      key: "serve_distance_weak_avg",
      label: "Weak avg",
      description: "Average of the 4 weak-foot distances.",
      valueFmt: fmt,
    },
  ],
  Dribbling: [
    {
      key: "figure8_strong",
      label: "Figure-8 strong",
      description: "Figure-8 loops, strong foot (Green/Red).",
      valueFmt: fmt,
    },
    {
      key: "figure8_weak",
      label: "Figure-8 weak",
      description: "Figure-8 loops, weak foot.",
      valueFmt: fmt,
    },
    {
      key: "figure8_both",
      label: "Figure-8 both",
      description: "Figure-8 loops, both feet.",
      valueFmt: fmt,
    },
    {
      key: "crossdribble_strong",
      label: "Cross strong",
      description: "Cross-dribble loops, strong foot (Blue/Platinum).",
      valueFmt: fmt,
    },
    {
      key: "crossdribble_weak",
      label: "Cross weak",
      description: "Cross-dribble loops, weak foot.",
      valueFmt: fmt,
    },
    {
      key: "crossdribble_both",
      label: "Cross both",
      description: "Cross-dribble loops, both feet.",
      valueFmt: fmt,
    },
    {
      key: "obstacle_strong",
      label: "Obstacle strong",
      description: "Obstacle shuttle score, strong foot (Diamond/Master).",
      valueFmt: fmt,
    },
    {
      key: "obstacle_weak",
      label: "Obstacle weak",
      description: "Obstacle shuttle score, weak foot.",
      valueFmt: fmt,
    },
    {
      key: "obstacle_both",
      label: "Obstacle both",
      description: "Obstacle shuttle score, both feet.",
      valueFmt: fmt,
    },
  ],
  Passing: [
    {
      key: "passing_strong",
      label: "Gate strong",
      description: "Gate passes, strong foot (Green/Red/Blue).",
      valueFmt: fmtInt,
    },
    {
      key: "passing_weak",
      label: "Gate weak",
      description: "Gate passes, weak foot.",
      valueFmt: fmtInt,
    },
    {
      key: "passing_color_strong",
      label: "Color strong",
      description: "Color mini-goal passes, strong foot (Platinum).",
      valueFmt: fmtInt,
    },
    {
      key: "passing_color_weak",
      label: "Color weak",
      description: "Color mini-goal passes, weak foot.",
      valueFmt: fmtInt,
    },
    {
      key: "passing_gate2yd_strong",
      label: "2-yd strong",
      description: "2-yard gate passes, strong foot (Master).",
      valueFmt: fmtInt,
    },
    {
      key: "passing_gate2yd_weak",
      label: "2-yd weak",
      description: "2-yard gate passes, weak foot.",
      valueFmt: fmtInt,
    },
  ],
  Juggling: [
    {
      key: "juggle_any",
      label: "Any surface",
      description: "Best juggles, any surface (Green).",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_feet_only",
      label: "Feet only",
      description: "Best juggles, feet only (Red).",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_bodypart",
      label: "Body-part",
      description: "Body-part challenge parts completed (Blue).",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_speed_3min",
      label: "Speed (3 min)",
      description: "Speed touches in 3 minutes (Platinum).",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_14in14_reps",
      label: "14-in-14 reps",
      description: "14-in-14 completions in a row (Diamond/Master).",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_weakfoot_ladder",
      label: "Weak-foot ladder",
      description: "Weak-foot ladder touches up & down (Master).",
      valueFmt: fmtInt,
    },
  ],
  "Skill Moves": [
    {
      key: "skill_moves_count",
      label: "Moves",
      description: "Different moves executed.",
      valueFmt: fmtInt,
    },
    {
      key: "skill_combos_count",
      label: "Combos",
      description: "Combos executed (Platinum+).",
      valueFmt: fmtInt,
    },
    {
      key: "skill_live_app_pct",
      label: "Live app %",
      description: "Live application success rate (need 75%+).",
      valueFmt: fmtPct,
    },
  ],
  "Shooting Accuracy": [
    {
      key: "shoot_bottom_pen",
      label: "Bottom (pen)",
      description: "Bottom corners hit from penalty/inside box (Green).",
      valueFmt: fmtInt,
    },
    {
      key: "shoot_bottom_top18",
      label: "Bottom (top 18)",
      description: "Bottom corners hit from top of the 18 (Red).",
      valueFmt: fmtInt,
    },
    {
      key: "shoot_bottom_moving",
      label: "Bottom (moving)",
      description: "Bottom corners hit, moving ball (Blue).",
      valueFmt: fmtInt,
    },
    {
      key: "shoot_4corners_pen",
      label: "4 corners (pen)",
      description: "Distinct corners hit from penalty spot (Platinum).",
      valueFmt: fmtInt,
    },
    {
      key: "shoot_4corners_top18",
      label: "4 corners (top 18)",
      description: "Distinct corners hit from top of the 18 (Diamond).",
      valueFmt: fmtInt,
    },
    {
      key: "shoot_4corners_moving",
      label: "4 corners (moving)",
      description: "Corners hit twice, moving ball (Master).",
      valueFmt: fmtInt,
    },
  ],
  "First Touch": [
    {
      key: "ft_ground_5x5_yards",
      label: "Ground 5x5",
      description: "Max distance reached, ground 5x5 (Green/Red).",
      valueFmt: fmtInt,
    },
    {
      key: "ft_ground_3x3_1touch_yards",
      label: "Ground 3x3 (1 touch)",
      description: "Max distance reached, ground 3x3 1-touch (Blue).",
      valueFmt: fmtInt,
    },
    {
      key: "ft_aerial_3x3_yards",
      label: "Aerial 3x3",
      description: "Max distance reached, aerial 3x3 (Platinum/Diamond).",
      valueFmt: fmtInt,
    },
    {
      key: "ft_aerial_3x3_1touch_yards",
      label: "Aerial 3x3 (1 touch)",
      description: "Max distance reached, aerial 3x3 1-touch (Master).",
      valueFmt: fmtInt,
    },
  ],
  "5-10-5 Agility": [
    {
      key: "agility_5_10_5_best_time",
      label: "Best",
      description: "Fastest trial time (lower is better).",
      valueFmt: fmt,
    },
    {
      key: "agility_5_10_5_avg_time",
      label: "Avg",
      description: "Average trial time (lower is better).",
      valueFmt: fmt,
    },
    {
      key: "agility_5_10_5_worst_time",
      label: "Worst",
      description: "Slowest trial time (lower is better).",
      valueFmt: fmt,
    },
    {
      key: "agility_5_10_5_consistency_range",
      label: "Range",
      description: "Worst minus best time (lower = more consistent).",
      valueFmt: fmt,
    },
  ],
  "Reaction Sprint": [
    {
      key: "reaction_5m_total_time_best",
      label: "Total best",
      description: "Fastest total time (lower is better).",
      valueFmt: fmt,
    },
    {
      key: "reaction_5m_total_time_avg",
      label: "Total avg",
      description: "Average total time (lower is better).",
      valueFmt: fmt,
    },
    {
      key: "reaction_5m_total_time_worst",
      label: "Total worst",
      description: "Slowest total time (lower is better).",
      valueFmt: fmt,
    },
    {
      key: "reaction_5m_reaction_time_best",
      label: "Cue best",
      description: "Fastest reaction time (lower is better).",
      valueFmt: fmt,
    },
    {
      key: "reaction_5m_reaction_time_avg",
      label: "Cue avg",
      description: "Average reaction time (lower is better).",
      valueFmt: fmt,
    },
  ],
  "Single-leg Hop": [
    {
      key: "single_leg_hop_left",
      label: "Left max",
      description: "Best (highest) left-leg hop.",
      valueFmt: fmtInt,
    },
    {
      key: "single_leg_hop_right",
      label: "Right max",
      description: "Best (highest) right-leg hop.",
      valueFmt: fmtInt,
    },
    {
      key: "single_leg_hop_left_avg",
      label: "Left avg",
      description: "Average left-leg hop across attempts.",
      valueFmt: fmt,
    },
    {
      key: "single_leg_hop_right_avg",
      label: "Right avg",
      description: "Average right-leg hop across attempts.",
      valueFmt: fmt,
    },
    {
      key: "single_leg_hop_asymmetry_pct",
      label: "Asymmetry",
      description:
        "Percent difference between left and right max hop (higher = bigger gap).",
      valueFmt: fmtPct,
    },
  ],
  "Double-leg Jumps": [
    {
      key: "double_leg_jumps_best",
      label: "Best distance",
      description: "Best (longest) double-leg jump across attempts.",
      valueFmt: fmtInt,
    },
    {
      key: "double_leg_jumps_avg",
      label: "Avg distance",
      description: "Average double-leg jump distance across attempts.",
      valueFmt: fmt,
    },
  ],
};

const TEST_DESCRIPTIONS: Record<string, string> = {
  Power:
    "Measures shot speed. Players shoot with both strong and weak foot — the best of each foot drives the rank.",
  Distance:
    "How far a ball travels in the air on each foot. The best strong-foot and weak-foot distance drives the rank.",
  Dribbling:
    "Figure-8 loops (Green/Red), then cross-dribble loops (Blue/Platinum), then scored obstacle-shuttle sets (Diamond/Master) — strong, weak, and both feet.",
  Passing:
    "Gate passes for the lower ranks, then color mini-goal and 2-yard-gate passing drills for the advanced ranks.",
  "Skill Moves":
    "Different moves and combos executed, plus the live-application success rate (coach calls a move on command).",
  "Shooting Accuracy":
    "Hitting target corners under harder conditions each rank — bottom corners, then all four corners, from farther out and off a moving ball.",
  "First Touch":
    "A 5-minute ladder test: control and reach a target distance with a tightening box, aerial balls, and tighter touch limits each rank.",
  "5-10-5 Agility":
    "Timed change-of-direction drill in seconds. Tests how quickly a player can turn and accelerate in different directions.",
  Juggling:
    "Different juggling challenges per rank — 50 juggles, 100 feet-only, the 14 body-part challenge, 300 speed touches, 14-in-14, and the weak-foot ladder.",
  "Single-leg Hop":
    "Explosive single-leg hop for distance. Score is in feet and inches — 5.2 means 5 feet 2 inches.",
};

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="group inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        aria-label="Metric info"
      >
        i
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left text-xs font-medium text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100">
          {text}
        </span>
      </button>
    </span>
  );
}

function ProgressMetricRow({
  label,
  firstValue,
  latestValue,
  delta,
  pctChange,
  lowerIsBetter = false,
  sparklineValues,
  dotColors,
}: {
  label: string;
  firstValue: string;
  latestValue: string;
  delta: number | null;
  pctChange: number | null;
  lowerIsBetter?: boolean;
  sparklineValues?: Array<number | null>;
  dotColors?: Array<string | null>;
}) {
  const hasChange = delta !== null && Math.abs(delta) > 0.001;
  const isImproved = hasChange
    ? lowerIsBetter
      ? delta < 0
      : delta > 0
    : null;

  const changeColor = isImproved
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : isImproved === false
    ? "text-red-700 bg-red-50 border-red-200"
    : "text-gray-700 bg-gray-50 border-gray-200";

  const arrow = isImproved ? "↑" : isImproved === false ? "↓" : "—";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {hasChange && (
          <div
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${changeColor}`}
          >
            {fmtSigned(delta)} ({fmtSigned(pctChange)}%) {arrow}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <div className="text-gray-600">
          <span className="font-medium">First:</span> {firstValue}
        </div>
        <div className="text-gray-400">→</div>
        <div className="font-semibold text-gray-900">
          <span className="font-medium text-gray-600">Latest:</span>{" "}
          {latestValue}
        </div>
      </div>
      {sparklineValues && sparklineValues.length > 1 && (
        <Sparkline
          values={sparklineValues}
          lowerIsBetter={lowerIsBetter}
          dotColors={dotColors}
        />
      )}
    </div>
  );
}

function ProgressSection({
  testName,
  progression,
  metricsToShow,
  scoresByTestId,
}: {
  testName: string;
  progression: NonNullable<Profile["data"]["test_progressions"]>[string];
  metricsToShow: Array<{
    key: string;
    label: string;
    valueFmt?: (n: number | null | undefined) => string;
    lowerIsBetter?: boolean;
  }>;
  scoresByTestId?: Map<string, Record<string, unknown>>;
}) {
  if (progression.test_count < 2) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="text-sm text-gray-600">
          No progress data yet. Add another test on a different date to see
          progress tracking.
        </div>
      </div>
    );
  }

  const dateRangeText =
    progression.date_range_days === 0
      ? "same day"
      : progression.date_range_days === 1
      ? "1 day"
      : `${progression.date_range_days} days`;

  // For rank tests, color each sparkline dot by the rank that test was at on
  // that date (so progress shows black → green → red → blue as they climb).
  const dotColors = isRankTest(testName)
    ? progression.timeline.map((entry) => {
        const scores = scoresByTestId?.get(entry.test_id) ?? {};
        const r = evaluateTest(testName, scores);
        return RANK_BY_KEY[r.rank].color;
      })
    : undefined;

  // Only chart metrics that actually have 2+ recorded points; first/latest are
  // taken from the recorded points (so a drill that starts at a later rank
  // doesn't show a misleading "First: —" or an empty left half).
  const rows = metricsToShow
    .map((metric) => {
      const timelineValues = progression.timeline.map(
        (t) => t.metrics[metric.key]
      );
      const nonNull = timelineValues.filter(
        (v): v is number => typeof v === "number"
      );
      if (nonNull.length < 2) return null;
      const firstVal = nonNull[0];
      const latestVal = nonNull[nonNull.length - 1];
      const delta = latestVal - firstVal;
      const pct = firstVal !== 0 ? (delta / firstVal) * 100 : null;
      return { metric, timelineValues, firstVal, latestVal, delta, pct };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">
          Progress Tracking
        </div>
        <div className="text-xs text-gray-600">
          {progression.test_count} tests over {dateRangeText}
        </div>
      </div>

      <div className="space-y-4">
        {rows.map(({ metric, timelineValues, firstVal, latestVal, delta, pct }) => {
          const formatter = metric.valueFmt ?? fmt;
          return (
            <ProgressMetricRow
              key={metric.key}
              label={metric.label}
              firstValue={formatter(firstVal)}
              latestValue={formatter(latestVal)}
              delta={delta}
              pctChange={pct}
              lowerIsBetter={metric.lowerIsBetter ?? false}
              sparklineValues={timelineValues}
              dotColors={dotColors}
            />
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({
  values,
  lowerIsBetter = false,
  dates,
  dotColors,
}: {
  values: Array<number | null>;
  lowerIsBetter?: boolean;
  dates?: Array<string>;
  dotColors?: Array<string | null>;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // Only the recorded points, kept with their original timeline index (for
  // dates + rank dot colors), then laid out edge-to-edge so the line fills the
  // chart instead of bunching where data happens to exist.
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => typeof p.v === "number");
  if (present.length < 2) return null;

  const nums = present.map((p) => p.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const w = 220;
  const h = 40;
  const pad = 4;

  const points = present.map((p, pos) => {
    const x =
      (present.length === 1 ? 0.5 : pos / (present.length - 1)) * (w - pad * 2) +
      pad;
    const t = max === min ? 0.5 : (p.v - min) / (max - min);
    // Flip y-axis for "lower is better" metrics so graph goes down when improving
    const y = lowerIsBetter
      ? t * (h - pad * 2) + pad
      : (1 - t) * (h - pad * 2) + pad;
    return [x, y, p.v, p.i] as const;
  });

  const d = points
    .map(
      ([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    )
    .join(" ");

  const last = nums[nums.length - 1];
  const first = nums[0];
  const improved = lowerIsBetter ? last < first : last > first;

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className="relative" onMouseLeave={() => setHoveredIndex(null)}>
      {/* SVG for the line only */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-10 w-full rounded-xl border border-emerald-200 bg-white"
        preserveAspectRatio="none"
      >
        <path d={d} fill="none" stroke="#059669" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Absolutely positioned dots that don't scale */}
      {points.map(([x, y, , index], i) => {
        const xPercent = (x / w) * 100;
        const yPercent = (y / h) * 100;
        const isLast = i === points.length - 1;
        const isHovered = hoveredIndex === i;

        return (
          <div
            key={i}
            className="absolute cursor-pointer transition-all"
            style={{
              left: `${xPercent}%`,
              top: `${yPercent}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseEnter={() => setHoveredIndex(i)}
          >
            <div
              className="rounded-full"
              style={{
                width: isHovered ? '14px' : '10px',
                height: isHovered ? '14px' : '10px',
                backgroundColor:
                  dotColors?.[index] ??
                  (isLast ? (improved ? '#059669' : '#111827') : '#059669'),
                opacity: isHovered ? 1 : isLast ? 1 : 0.85,
              }}
            />
          </div>
        );
      })}
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-gray-900 shadow-lg"
          style={{
            left: `${(hoveredPoint[0] / w) * 100}%`,
            top: "-2.5rem",
            transform: "translateX(-50%)",
          }}
        >
          <div className="whitespace-nowrap">
            {dates && dates[hoveredPoint[3]]
              ? dates[hoveredPoint[3]]
              : `Point ${hoveredPoint[3] + 1}`}
          </div>
          <div className="font-semibold text-emerald-700">
            {hoveredPoint[2].toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  delta,
  unit,
  spark,
  details,
}: {
  title: string;
  value: string;
  delta?: string | null;
  unit?: string;
  spark: React.ReactNode;
  details?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">
            {value}
            {unit ? (
              <span className="ml-1 text-sm text-gray-600">{unit}</span>
            ) : null}
          </div>
        </div>
        {delta ? (
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {delta}
          </div>
        ) : null}
      </div>
      <div className="mt-3">{spark}</div>
      {details ? <div className="mt-4">{details}</div> : null}
    </div>
  );
}

export function PlayerInsights({ 
  playerId,
  isAdminMode,
  targetTestId,
}: { 
  playerId: string;
  isAdminMode?: boolean;
  targetTestId?: string | null;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tests, setTests] = useState<PlayerTest[]>([]);
  const [loading, setLoading] = useState(true);
  const lastAppliedTargetRef = useRef<string | null>(null);
  const [filterTest, setFilterTest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const profilesEndpoint = isAdminMode 
          ? `/api/admin/players/${playerId}/profiles`
          : `/api/players/${playerId}/profiles`;
        const testsEndpoint = isAdminMode
          ? `/api/admin/players/${playerId}/tests`
          : `/api/players/${playerId}/tests`;
        
        const [profilesRes, testsRes] = await Promise.all([
          fetch(profilesEndpoint, { cache: "no-store" }),
          fetch(testsEndpoint, { cache: "no-store" }),
        ]);

        if (profilesRes.ok) {
          const data = (await profilesRes.json()) as { profiles: Profile[] };
          if (!cancelled) setProfiles(data.profiles ?? []);
        }

        if (testsRes.ok) {
          const data = (await testsRes.json()) as { tests: PlayerTest[] };
          if (!cancelled) setTests(data.tests ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [playerId, isAdminMode]);

  const latest = profiles.length ? profiles[profiles.length - 1] : null;
  const rawTests = latest?.data?.raw_tests ?? [];
  const latestMetrics = latest?.data?.metrics ?? {};
  const latestDeltas = latest?.data?.comparisons?.deltas ?? {};
  const testProgressions = latest?.data?.test_progressions ?? {};

  const latestByTestName = useMemo(() => {
    // Gather every row per test (deduped by id), so we can show the accumulated
    // picture rather than just the newest session. A test's rank tiers use
    // different fields (e.g. Dribbling green/red = figure-8 loops, blue = cross-
    // dribble loops); a session that records only one tier shouldn't blank out
    // the others. We carry each field's most recent value forward.
    const rowsByName = new Map<
      string,
      Array<{ id?: string; test_date: string; scores: Record<string, unknown> }>
    >();
    const seen = new Set<string>();
    const collect = (t: {
      id?: string;
      test_name: string;
      test_date: string;
      scores?: Record<string, unknown> | null;
    }) => {
      if (t.id && seen.has(t.id)) return;
      if (t.id) seen.add(t.id);
      if (!rowsByName.has(t.test_name)) rowsByName.set(t.test_name, []);
      rowsByName
        .get(t.test_name)!
        .push({ id: t.id, test_date: t.test_date, scores: t.scores ?? {} });
    };
    for (const t of tests) collect(t);
    for (const t of rawTests) collect(t);

    const map = new Map<
      string,
      { test_date: string; scores: Record<string, unknown> }
    >();
    for (const [name, rows] of rowsByName) {
      const newestFirst = rows
        .slice()
        .sort((a, b) => (a.test_date < b.test_date ? 1 : a.test_date > b.test_date ? -1 : 0));
      map.set(name, {
        test_date: newestFirst[0].test_date,
        scores: mergeScoreHistory(newestFirst.map((r) => r.scores)),
      });
    }
    return map;
  }, [rawTests, tests]);

  // id -> scores, for coloring each progress dot by its rank-at-that-date.
  const scoresByTestId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const t of rawTests) map.set(t.id, t.scores ?? {});
    for (const t of tests) map.set(t.id, t.scores ?? {});
    return map;
  }, [rawTests, tests]);

  const availableTestNames = useMemo(
    () =>
      TEST_DEFINITIONS.filter((d) => latestByTestName.has(d.name)).map(
        (d) => d.name
      ),
    [latestByTestName]
  );

  useEffect(() => {
    if (!targetTestId) {
      lastAppliedTargetRef.current = null;
      return;
    }
    if (lastAppliedTargetRef.current === targetTestId) return;

    const normalizedTarget = normalizeTestLookup(targetTestId);
    if (!normalizedTarget) return;

    const matchingDefinition = TEST_DEFINITIONS.find((definition) => {
      return (
        normalizeTestLookup(definition.id) === normalizedTarget ||
        normalizeTestLookup(definition.name) === normalizedTarget
      );
    });

    if (!matchingDefinition) return;
    if (!latestByTestName.has(matchingDefinition.name)) return;

    window.requestAnimationFrame(() => {
      const element = document.getElementById(
        `player-test-${matchingDefinition.id}`,
      );
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    lastAppliedTargetRef.current = targetTestId;
  }, [latestByTestName, targetTestId]);

  if (loading) {
    return (
      <div className="text-sm text-gray-600">
        Loading insights…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Most recent tests
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Showing the latest entry for each test.
        </p>

        {availableTestNames.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterTest(null)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filterTest === null
                  ? "bg-emerald-600 text-white"
                  : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              All tests
            </button>
            {availableTestNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setFilterTest(name === filterTest ? null : name)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  filterTest === name
                    ? "bg-emerald-600 text-white"
                    : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {tests.length === 0 && rawTests.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-gray-600">
            No tests recorded yet.
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            {(filterTest
              ? TEST_DEFINITIONS.filter((d) => d.name === filterTest)
              : TEST_DEFINITIONS
            ).map((def) => {
              const t = latestByTestName.get(def.name);
              if (!t) return null;

              // For rank tests, only show fields/metrics relevant up to the
              // rank the player is working toward (current rank + 1 tier).
              const rankTest = def.isRankTest === true;
              const testRank = rankTest
                ? evaluateTest(def.name, t.scores ?? {})
                : null;
              const showThreshold = testRank ? testRank.rankIndex + 1 : 99;
              const relevant = (key: string) =>
                !rankTest || metricRankIndex(def.name, key) <= showThreshold;

              const visibleFields = def.fields.filter((f) => relevant(f.key));
              const visibleProgress = (
                PROGRESS_METRICS_BY_TEST[def.name] ?? []
              ).filter((m) => relevant(m.key));
              const visibleDerived = (
                DERIVED_METRICS_BY_TEST[def.name] ?? []
              ).filter((m) => relevant(m.key));

              return (
                <div
                  key={def.id}
                  id={`player-test-${def.id}`}
                  className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">
                        {def.name}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {t.test_date}
                      </div>
                      {TEST_DESCRIPTIONS[def.name] && (
                        <p className="mt-2 text-xs leading-relaxed text-gray-500">
                          {TEST_DESCRIPTIONS[def.name]}
                        </p>
                      )}
                    </div>
                    {testRank ? (
                      <RankBadge
                        name={RANK_BY_KEY[testRank.rank].shortName}
                        color={RANK_BY_KEY[testRank.rank].color}
                        size="sm"
                      />
                    ) : (
                      <div className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Latest
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {visibleFields.map((f) => {
                      const raw = t.scores?.[f.key];
                      const value =
                        raw === null || raw === undefined || raw === ""
                          ? "—"
                          : String(raw);

                      // Text fields (e.g. skill move names) render full-width as
                      // a label-on-top block so long lists read cleanly.
                      if (f.type === "text") {
                        const names = value
                          .split(",")
                          .map((n) => n.trim())
                          .filter(Boolean);
                        return (
                          <div
                            key={f.key}
                            className="rounded-xl border border-emerald-200 bg-white px-3 py-2 sm:col-span-2"
                          >
                            <div className="text-sm text-gray-700">{f.label}</div>
                            {names.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {names.map((n, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
                                  >
                                    {n}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-1 text-sm font-semibold text-gray-900">
                                —
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Check if there's a delta for this raw field
                      const rawDelta = nonZeroDelta(latestDeltas[f.key]);
                      const delta =
                        rawDelta !== null ? fmtSigned(rawDelta, 2) : null;

                      return (
                        <div
                          key={f.key}
                          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2"
                        >
                          <div className="text-sm text-gray-700">{f.label}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-gray-900">
                              {value}
                            </div>
                            {delta ? (
                              <div className="text-xs font-semibold text-gray-500">
                                ({delta})
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {testProgressions[def.name] && visibleProgress.length ? (
                    <div className="mt-4 border-t border-emerald-200 pt-4">
                      <ProgressSection
                        testName={def.name}
                        progression={testProgressions[def.name]}
                        metricsToShow={visibleProgress}
                        scoresByTestId={scoresByTestId}
                      />
                    </div>
                  ) : null}

                  {visibleDerived.length ? (
                    <div className="mt-4 border-t border-emerald-200 pt-4">
                      <div className="text-xs font-semibold text-gray-900">
                        Derived metrics
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {visibleDerived.map((m) => {
                          const rawValue = latestMetrics[m.key];
                          const rawDelta = nonZeroDelta(latestDeltas[m.key]);
                          const value = (m.valueFmt ?? fmt)(rawValue);
                          const delta = fmtSigned(rawDelta, 2);
                          return (
                            <div
                              key={m.key}
                              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2"
                            >
                              <div className="flex items-center gap-2 text-sm text-gray-700">
                                <span>{m.label}</span>
                                <InfoTip text={m.description} />
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-gray-900">
                                  {value}
                                </div>
                                {delta ? (
                                  <div className="text-xs font-semibold text-gray-500">
                                    ({delta})
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
