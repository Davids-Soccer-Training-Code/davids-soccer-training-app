"use client";

import { TEST_DEFINITIONS } from "@/lib/testDefinitions";
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

function asNullableNumber(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function getOneVOneRounds(scores: Record<string, unknown>) {
  const roundsRaw = (scores as { rounds?: unknown }).rounds;
  if (Array.isArray(roundsRaw)) {
    return roundsRaw.map((v) => asNullableNumber(v));
  }
  const entries = Object.entries(scores)
    .map(([k, v]) => {
      const m = /^onevone_round_(\d+)$/.exec(k);
      if (!m) return null;
      return [Number(m[1]), asNullableNumber(v)] as const;
    })
    .filter((x): x is readonly [number, number | null] => x !== null)
    .sort((a, b) => a[0] - b[0]);
  return entries.map((e) => e[1]);
}

function getSkillMoves(
  scores: Record<string, unknown>
): Array<{ name: string; score: number | null }> {
  const movesRaw = (scores as { moves?: unknown }).moves;
  if (Array.isArray(movesRaw)) {
    return movesRaw.map((m, i) => {
      const obj = (m ?? {}) as Record<string, unknown>;
      const name = String(obj.name ?? "").trim() || `Move ${i + 1}`;
      const score = asNullableNumber(obj.score);
      return { name, score };
    });
  }
  const entries = Object.entries(scores)
    .map(([k, v]) => {
      const m = /^skillmove_(\d+)$/.exec(k);
      if (!m) return null;
      const idx = Number(m[1]);
      const nameKey = `skillmove_name_${idx}`;
      const rawName = scores[nameKey];
      const name =
        rawName === null || rawName === undefined
          ? `Move ${idx}`
          : String(rawName).trim() || `Move ${idx}`;
      const score = asNullableNumber(v);
      return { idx, name, score };
    })
    .filter(
      (x): x is { idx: number; name: string; score: number | null } =>
        x !== null
    )
    .sort((a, b) => a.idx - b.idx);
  return entries.map(({ name, score }) => ({ name, score }));
}

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
    { key: "shot_power_strong_avg", label: "Strong avg", valueFmt: fmt },
    { key: "shot_power_weak_avg", label: "Weak avg", valueFmt: fmt },
    {
      key: "shot_power_asymmetry_pct",
      label: "Asymmetry",
      valueFmt: fmtPct,
      lowerIsBetter: true,
    },
  ],
  "Serve Distance": [
    { key: "serve_distance_strong_avg", label: "Strong avg", valueFmt: fmt },
    { key: "serve_distance_weak_avg", label: "Weak avg", valueFmt: fmt },
    {
      key: "serve_distance_asymmetry_pct",
      label: "Asymmetry",
      valueFmt: fmtPct,
      lowerIsBetter: true,
    },
  ],
  "Figure 8 Loops": [
    { key: "figure8_loops_both", label: "Both feet", valueFmt: fmtInt },
    { key: "figure8_loops_weak", label: "Weak foot", valueFmt: fmtInt },
    { key: "figure8_loops_strong", label: "Strong foot", valueFmt: fmtInt },
  ],
  "Passing Gates": [
    { key: "passing_gates_total_hits", label: "Total hits", valueFmt: fmtInt },
    {
      key: "passing_gates_asymmetry_pct",
      label: "Asymmetry",
      valueFmt: fmtPct,
      lowerIsBetter: true,
    },
  ],
  "1v1": [
    { key: "one_v_one_avg_score", label: "Avg score per round", valueFmt: fmt },
  ],
  Juggling: [
    { key: "juggle_best", label: "Best attempt", valueFmt: fmtInt },
    { key: "juggle_avg_all", label: "Average", valueFmt: fmt },
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
  "Reaction Sprint": [
    {
      key: "reaction_5m_total_time_best",
      label: "Best total time",
      valueFmt: fmt,
      lowerIsBetter: true,
    },
    {
      key: "reaction_5m_reaction_time_best",
      label: "Best reaction",
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
  "Ankle Dorsiflexion": [
    { key: "ankle_dorsiflex_avg_cm", label: "Avg (cm)", valueFmt: fmt },
    {
      key: "ankle_dorsiflex_asymmetry_pct",
      label: "Asymmetry",
      valueFmt: fmtPct,
      lowerIsBetter: true,
    },
  ],
  "Core Plank": [
    { key: "core_plank_hold_sec", label: "Hold time", valueFmt: fmtInt },
    {
      key: "core_plank_hold_sec_if_good_form",
      label: "Hold (good form)",
      valueFmt: fmtInt,
    },
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
  "Serve Distance": [
    {
      key: "serve_distance_strong_avg",
      label: "Strong avg",
      description: "Average of the 4 strong-foot serve distances.",
      valueFmt: fmt,
    },
    {
      key: "serve_distance_weak_avg",
      label: "Weak avg",
      description: "Average of the 4 weak-foot serve distances.",
      valueFmt: fmt,
    },
    {
      key: "serve_distance_asymmetry_pct",
      label: "Asymmetry",
      description:
        "Percent difference between strong and weak averages (higher = bigger gap).",
      valueFmt: fmtPct,
    },
    {
      key: "serve_distance_strong_max",
      label: "Strong max",
      description: "Best (farthest) strong-foot serve distance.",
      valueFmt: fmtInt,
    },
    {
      key: "serve_distance_weak_max",
      label: "Weak max",
      description: "Best (farthest) weak-foot serve distance.",
      valueFmt: fmtInt,
    },
  ],
  "Figure 8 Loops": [
    {
      key: "figure8_loops_both",
      label: "Both",
      description: "Total loops using both feet (combined).",
      valueFmt: fmtInt,
    },
    {
      key: "figure8_loops_weak",
      label: "Weak",
      description: "Total loops using the weak foot.",
      valueFmt: fmtInt,
    },
    {
      key: "figure8_loops_strong",
      label: "Strong",
      description: "Total loops using the strong foot.",
      valueFmt: fmtInt,
    },
    {
      key: "figure8_asymmetry_pct",
      label: "Asymmetry",
      description:
        "Percent difference between strong and weak loops (higher = bigger gap).",
      valueFmt: fmtPct,
    },
  ],
  "Passing Gates": [
    {
      key: "passing_gates_total_hits",
      label: "Total hits",
      description: "Strong hits + weak hits.",
      valueFmt: fmtInt,
    },
    {
      key: "passing_gates_strong_hits",
      label: "Strong hits",
      description: "Total strong-foot passing gate hits.",
      valueFmt: fmtInt,
    },
    {
      key: "passing_gates_weak_hits",
      label: "Weak hits",
      description: "Total weak-foot passing gate hits.",
      valueFmt: fmtInt,
    },
    {
      key: "passing_gates_weak_share_pct",
      label: "Weak share",
      description: "Weak hits divided by total hits.",
      valueFmt: fmtPct,
    },
    {
      key: "passing_gates_asymmetry_pct",
      label: "Asymmetry",
      description:
        "Percent difference between strong and weak hits (higher = bigger gap).",
      valueFmt: fmtPct,
    },
  ],
  "1v1": [
    {
      key: "one_v_one_avg_score",
      label: "Avg score",
      description: "Average score across all rounds.",
      valueFmt: fmt,
    },
    {
      key: "one_v_one_total_score",
      label: "Total score",
      description: "Sum of all round scores.",
      valueFmt: fmtInt,
    },
    {
      key: "one_v_one_best_round",
      label: "Best round",
      description: "Highest single round score.",
      valueFmt: fmtInt,
    },
    {
      key: "one_v_one_worst_round",
      label: "Worst round",
      description: "Lowest single round score.",
      valueFmt: fmtInt,
    },
    {
      key: "one_v_one_consistency_range",
      label: "Range",
      description: "Best round minus worst round (lower = more consistent).",
      valueFmt: fmtInt,
    },
  ],
  Juggling: [
    {
      key: "juggle_best",
      label: "Best",
      description: "Best single juggling attempt.",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_best2_sum",
      label: "Best 2 sum",
      description: "Sum of the best two attempts.",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_avg_all",
      label: "Avg",
      description: "Average across all attempts.",
      valueFmt: fmt,
    },
    {
      key: "juggle_total",
      label: "Total",
      description: "Sum across all attempts.",
      valueFmt: fmtInt,
    },
    {
      key: "juggle_consistency_range",
      label: "Range",
      description:
        "Best attempt minus worst attempt (lower = more consistent).",
      valueFmt: fmtInt,
    },
  ],
  "Skill Moves": [
    {
      key: "skill_moves_avg_rating",
      label: "Avg rating",
      description: "Average rating across all skill moves.",
      valueFmt: fmt,
    },
    {
      key: "skill_moves_total_rating",
      label: "Total",
      description: "Sum of all skill move ratings.",
      valueFmt: fmtInt,
    },
    {
      key: "skill_moves_best_rating",
      label: "Best",
      description: "Best (highest) single skill move rating.",
      valueFmt: fmtInt,
    },
    {
      key: "skill_moves_worst_rating",
      label: "Worst",
      description: "Worst (lowest) single skill move rating.",
      valueFmt: fmtInt,
    },
    {
      key: "skill_moves_consistency_range",
      label: "Range",
      description: "Best rating minus worst rating (lower = more consistent).",
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
  "Ankle Dorsiflexion": [
    {
      key: "ankle_dorsiflex_left_cm",
      label: "Left (cm)",
      description: "Left ankle dorsiflexion converted to centimeters.",
      valueFmt: fmt,
    },
    {
      key: "ankle_dorsiflex_right_cm",
      label: "Right (cm)",
      description: "Right ankle dorsiflexion converted to centimeters.",
      valueFmt: fmt,
    },
    {
      key: "ankle_dorsiflex_avg_cm",
      label: "Avg (cm)",
      description: "Average of left and right dorsiflexion (cm).",
      valueFmt: fmt,
    },
    {
      key: "ankle_dorsiflex_asymmetry_pct",
      label: "Asymmetry",
      description:
        "Percent difference between left and right dorsiflexion (higher = bigger gap).",
      valueFmt: fmtPct,
    },
  ],
  "Core Plank": [
    {
      key: "core_plank_hold_sec",
      label: "Hold (sec)",
      description: "Total hold time in seconds.",
      valueFmt: fmtInt,
    },
    {
      key: "core_plank_form_flag",
      label: "Form flag",
      description: "1 = good form, 0 = poor form (coach flag).",
      valueFmt: fmtInt,
    },
    {
      key: "core_plank_hold_sec_if_good_form",
      label: "Hold if good form",
      description:
        "Hold time if form was good; otherwise 0 (penalizes poor form).",
      valueFmt: fmtInt,
    },
  ],
};

const TEST_DESCRIPTIONS: Record<string, string> = {
  Power:
    "Measures shot speed in MPH. Players shoot with both strong and weak foot to see power on each side.",
  "Serve Distance":
    "Measures how far a ball travels through the air on both feet. Tests pure kicking distance.",
  "Figure 8 Loops":
    "Dribbling technique through cones in a figure-8 with strong, weak, and both feet for 1 minute. Scored in loops — 100 = 1 full lap, 150 = 1½ laps, etc.",
  "Passing Gates":
    "How many passes a player can make through a gate in 60 seconds at up to 10 yards. Tests accuracy and consistency.",
  "Skill Moves":
    "Coach-rated mastery of individual skill moves on a 1–5 scale. 1 = just learning, 5 = fully mastered.",
  "5-10-5 Agility":
    "Timed change-of-direction drill in seconds. Tests how quickly a player can turn and accelerate in different directions.",
  Juggling:
    "4 attempts, scored as level + touches (e.g. 105 = level 1 with 5 juggles, 204 = level 2 with 4 juggles). Best two attempts are summed.",
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
}: {
  label: string;
  firstValue: string;
  latestValue: string;
  delta: number | null;
  pctChange: number | null;
  lowerIsBetter?: boolean;
  sparklineValues?: Array<number | null>;
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
        <Sparkline values={sparklineValues} lowerIsBetter={lowerIsBetter} />
      )}
    </div>
  );
}

function ProgressSection({
  testName,
  progression,
  metricsToShow,
}: {
  testName: string;
  progression: NonNullable<Profile["data"]["test_progressions"]>[string];
  metricsToShow: Array<{
    key: string;
    label: string;
    valueFmt?: (n: number | null | undefined) => string;
    lowerIsBetter?: boolean;
  }>;
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
        {metricsToShow.map((metric) => {
          const firstVal = progression.first_test.metrics[metric.key];
          const latestVal = progression.most_recent_test.metrics[metric.key];
          const delta = progression.changes.since_first[metric.key];
          const pct = progression.changes.pct_since_first[metric.key];

          if (firstVal === null && latestVal === null) return null;

          const formatter = metric.valueFmt ?? fmt;
          const timelineValues = progression.timeline.map(
            (t) => t.metrics[metric.key]
          );

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
}: {
  values: Array<number | null>;
  lowerIsBetter?: boolean;
  dates?: Array<string>;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length < 2) {
    return (
      <div className="h-10 w-full rounded-xl border border-emerald-200 bg-emerald-50" />
    );
  }

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const w = 220;
  const h = 40;
  const pad = 4;

  const points = values
    .map((v, i) => {
      if (typeof v !== "number") return null;
      const x = (i / (values.length - 1)) * (w - pad * 2) + pad;
      const t = max === min ? 0.5 : (v - min) / (max - min);
      // Flip y-axis for "lower is better" metrics so graph goes down when improving
      const y = lowerIsBetter
        ? t * (h - pad * 2) + pad
        : (1 - t) * (h - pad * 2) + pad;
      return [x, y, v, i] as const;
    })
    .filter(Boolean) as Array<readonly [number, number, number, number]>;

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
      {points.map(([x, y, value, index], i) => {
        const xPercent = (x / w) * 100;
        const yPercent = (y / h) * 100;
        const isLast = i === points.length - 1;
        const isHovered = hoveredIndex === index;

        return (
          <div
            key={i}
            className="absolute cursor-pointer transition-all"
            style={{
              left: `${xPercent}%`,
              top: `${yPercent}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseEnter={() => setHoveredIndex(index)}
          >
            <div
              className="rounded-full"
              style={{
                width: isHovered ? '14px' : '10px',
                height: isHovered ? '14px' : '10px',
                backgroundColor: isLast
                  ? improved
                    ? '#059669'
                    : '#111827'
                  : '#059669',
                opacity: isHovered ? 1 : isLast ? 1 : 0.6,
              }}
            />
          </div>
        );
      })}
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-gray-900 shadow-lg"
          style={{
            left: `${(hoveredPoint[3] / (values.length - 1)) * 100}%`,
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
    const map = new Map<
      string,
      { test_date: string; scores: Record<string, unknown> }
    >();

    for (const t of tests) {
      const existing = map.get(t.test_name);
      if (!existing || t.test_date > existing.test_date) {
        map.set(t.test_name, {
          test_date: t.test_date,
          scores: t.scores ?? {},
        });
      }
    }
    for (const t of rawTests) {
      const existing = map.get(t.test_name);
      if (!existing || t.test_date > existing.test_date) {
        map.set(t.test_name, {
          test_date: t.test_date,
          scores: t.scores ?? {},
        });
      }
    }
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

              const oneVOneRounds =
                def.name === "1v1" ? getOneVOneRounds(t.scores ?? {}) : null;
              const oneVOneRoundsList = oneVOneRounds ?? [];
              const oneVOneRoundsCount = oneVOneRoundsList.length;

              // For Skill Moves, collect ALL moves from ALL tests (not just latest)
              const skillMoves =
                def.name === "Skill Moves"
                  ? (() => {
                      const allMovesMap = new Map<string, number | null>();

                      // Get all Skill Moves tests, sorted by date (most recent last)
                      const allSkillMovesTests = rawTests
                        .filter((test) => test.test_name === "Skill Moves")
                        .sort((a, b) => a.test_date.localeCompare(b.test_date));

                      // Collect all moves, with most recent scores taking precedence
                      for (const test of allSkillMovesTests) {
                        const moves = getSkillMoves(test.scores ?? {});
                        moves.forEach((m) => {
                          allMovesMap.set(m.name, m.score);
                        });
                      }

                      // Convert to array
                      return Array.from(allMovesMap.entries()).map(([name, score]) => ({
                        name,
                        score,
                      }));
                    })()
                  : null;
              const skillMovesList = skillMoves ?? [];
              const skillMovesCount = skillMovesList.length;

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
                    <div className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Latest
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {def.name === "1v1" ? (
                      <>
                        <div className="sm:col-span-2 text-xs font-semibold text-gray-700">
                          Scores (each round is 0–3)
                        </div>
                        {(oneVOneRoundsCount ? oneVOneRoundsList : []).map(
                          (v, i) => (
                            <div
                              key={`onevone-${i}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2"
                            >
                              <div className="text-sm text-gray-700">
                                Round {i + 1}
                              </div>
                              <div className="text-sm font-semibold text-gray-900">
                                {v === null ? "—" : String(v)}
                              </div>
                            </div>
                          )
                        )}
                        {oneVOneRoundsCount === 0 ? (
                          <div className="text-sm text-gray-600">
                            No rounds recorded.
                          </div>
                        ) : null}
                      </>
                    ) : def.name === "Skill Moves" ? (
                      <>
                        <div className="sm:col-span-2 text-xs font-semibold text-gray-700">
                          Moves (each move is 1–5)
                        </div>
                        {(skillMovesCount ? skillMovesList : []).map((m, i) => (
                          <div
                            key={`move-${i}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2"
                          >
                            <div className="text-sm text-gray-700">
                              {m.name}
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                              {m.score === null ? "—" : String(m.score)}
                            </div>
                          </div>
                        ))}
                        {skillMovesCount === 0 ? (
                          <div className="text-sm text-gray-600">
                            No moves recorded.
                          </div>
                        ) : null}
                      </>
                    ) : (
                      def.fields.map((f) => {
                        const raw = t.scores?.[f.key];
                        const value =
                          raw === null || raw === undefined || raw === ""
                            ? "—"
                            : String(raw);

                        // Check if there's a delta for this raw field
                        const rawDelta = nonZeroDelta(latestDeltas[f.key]);
                        const delta = rawDelta !== null ? fmtSigned(rawDelta, 2) : null;

                        return (
                          <div
                            key={f.key}
                            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2"
                          >
                            <div className="text-sm text-gray-700">
                              {f.label}
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
                      })
                    )}
                  </div>

                  {testProgressions[def.name] &&
                  PROGRESS_METRICS_BY_TEST[def.name] ? (
                    <div className="mt-4 border-t border-emerald-200 pt-4">
                      <ProgressSection
                        testName={def.name}
                        progression={testProgressions[def.name]}
                        metricsToShow={PROGRESS_METRICS_BY_TEST[def.name]}
                      />
                    </div>
                  ) : null}

                  {DERIVED_METRICS_BY_TEST[def.name]?.length ? (
                    <div className="mt-4 border-t border-emerald-200 pt-4">
                      <div className="text-xs font-semibold text-gray-900">
                        Derived metrics
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {DERIVED_METRICS_BY_TEST[def.name].map((m) => {
                          let rawValue = latestMetrics[m.key];
                          const rawDelta = nonZeroDelta(latestDeltas[m.key]);

                          // For Skill Moves, compute metrics from ALL displayed moves
                          if (def.name === "Skill Moves" && skillMovesList.length > 0) {
                            const scores = skillMovesList
                              .map((move) => move.score)
                              .filter((s): s is number => s !== null);

                            if (m.key === "skill_moves_avg_rating") {
                              rawValue = scores.length > 0
                                ? scores.reduce((a, b) => a + b, 0) / scores.length
                                : null;
                            } else if (m.key === "skill_moves_total_rating") {
                              rawValue = scores.length > 0
                                ? scores.reduce((a, b) => a + b, 0)
                                : null;
                            } else if (m.key === "skill_moves_best_rating") {
                              rawValue = scores.length > 0 ? Math.max(...scores) : null;
                            } else if (m.key === "skill_moves_worst_rating") {
                              rawValue = scores.length > 0 ? Math.min(...scores) : null;
                            } else if (m.key === "skill_moves_consistency_range") {
                              rawValue = scores.length > 0
                                ? Math.max(...scores) - Math.min(...scores)
                                : null;
                            }
                          }

                          let value = (m.valueFmt ?? fmt)(rawValue);

                          // Add score scales for clarity on parent dashboard.
                          if (def.name === "1v1") {
                            const maxTotal =
                              oneVOneRoundsCount > 0
                                ? oneVOneRoundsCount * 3
                                : null;
                            if (
                              m.key === "one_v_one_avg_score" ||
                              m.key === "one_v_one_best_round" ||
                              m.key === "one_v_one_worst_round"
                            ) {
                              value = `${value} / 3`;
                            }
                            if (m.key === "one_v_one_total_score" && maxTotal) {
                              value = `${fmtInt(rawValue)} / ${maxTotal}`;
                            }
                          }

                          if (def.name === "Skill Moves") {
                            const maxTotal =
                              skillMovesCount > 0 ? skillMovesCount * 5 : null;
                            if (
                              m.key === "skill_moves_avg_rating" ||
                              m.key === "skill_moves_best_rating" ||
                              m.key === "skill_moves_worst_rating"
                            ) {
                              value = `${value} / 5`;
                            }
                            if (
                              m.key === "skill_moves_total_rating" &&
                              maxTotal
                            ) {
                              value = `${fmtInt(rawValue)} / ${maxTotal}`;
                            }
                          }

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
