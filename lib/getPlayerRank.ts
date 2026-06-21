import { sql } from "@/db";
import {
  RANK_TESTS,
  RANK_BY_KEY,
  evaluateTest,
  computeOverallRank,
  nextRankChecklist,
  missionDoneByRankFrom,
  type RankKey,
  type TestRankResult,
  type NextRankChecklist,
} from "@/lib/rankSystem";
import { getPlayerSessionCount } from "@/lib/playerRankData";

export type Mission = {
  id: string;
  player_id: string;
  target_rank: RankKey;
  test_category: string | null;
  title: string;
  description: string | null;
  video_url: string | null;
  is_youtube: boolean;
  status: "assigned" | "completed";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PerTestRank = {
  rank: RankKey;
  index: number;
  name: string;
  color: string;
  passed_by_rank: Record<RankKey, boolean>;
};

export type PlayerRankSummary = {
  overall: { rank: RankKey; index: number; name: string; color: string };
  per_test: Record<string, PerTestRank>;
  session_count: number;
  mission_done_by_rank: Record<RankKey, boolean>;
  next_checklist: NextRankChecklist;
  missions: Mission[];
};

async function getPlayerMissions(playerId: string): Promise<Mission[]> {
  const rows = (await sql`
    SELECT
      id, player_id, target_rank, test_category, title, description,
      video_url, is_youtube, status, completed_at::text AS completed_at,
      created_at::text AS created_at, updated_at::text AS updated_at
    FROM player_missions
    WHERE player_id = ${playerId}
    ORDER BY created_at DESC
  `) as unknown as Mission[];
  return rows;
}

// Computes the player's current rank live from the latest test of each type,
// the session count, and completed coach missions.
export async function getPlayerRank(
  playerId: string
): Promise<PlayerRankSummary> {
  const testRows = (await sql`
    SELECT test_name, scores, created_at
    FROM player_tests
    WHERE player_id = ${playerId}
    ORDER BY test_date DESC, created_at DESC
  `) as unknown as Array<{
    test_name: string;
    scores: Record<string, unknown>;
    created_at: string;
  }>;

  const latest = new Map<string, Record<string, unknown>>();
  for (const r of testRows) {
    if (!latest.has(r.test_name)) latest.set(r.test_name, r.scores ?? {});
  }

  const [sessionCount, missions] = await Promise.all([
    getPlayerSessionCount(playerId),
    getPlayerMissions(playerId),
  ]);

  const perTestResult: Record<string, TestRankResult> = {};
  const per_test: Record<string, PerTestRank> = {};
  for (const t of RANK_TESTS) {
    const res = evaluateTest(t, latest.get(t) ?? {});
    perTestResult[t] = res;
    const def = RANK_BY_KEY[res.rank];
    per_test[t] = {
      rank: res.rank,
      index: res.rankIndex,
      name: def.name,
      color: def.color,
      passed_by_rank: res.passedByRank,
    };
  }

  const missionDoneByRank = missionDoneByRankFrom(missions);
  const overall = computeOverallRank({
    perTest: perTestResult,
    sessionCount,
    missionDoneByRank,
  });
  const overallDef = RANK_BY_KEY[overall.rank];

  const latestScores = Object.fromEntries(
    RANK_TESTS.map((t) => [t, latest.get(t) ?? {}])
  );
  const next_checklist = nextRankChecklist({
    currentRankIndex: overall.rankIndex,
    perTest: perTestResult,
    sessionCount,
    missionDoneByRank,
    latestScores,
  });

  return {
    overall: {
      rank: overall.rank,
      index: overall.rankIndex,
      name: overallDef.name,
      color: overallDef.color,
    },
    per_test,
    session_count: sessionCount,
    mission_done_by_rank: missionDoneByRank,
    next_checklist,
    missions,
  };
}
