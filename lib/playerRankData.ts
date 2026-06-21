import { sql } from "@/db";
import type { MissionLite } from "@/lib/computePlayerProfile";

// Count of (non-cancelled) training sessions for a player, via the CRM linkage.
// Mirrors the session count shown on the player dashboard.
export async function getPlayerSessionCount(playerId: string): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::text AS count
    FROM crm_sessions cs
    JOIN crm_parents cp ON cp.id = cs.parent_id
    JOIN parents pa ON pa.crm_parent_id = cp.id
    WHERE pa.id = (SELECT parent_id FROM players WHERE id = ${playerId} LIMIT 1)
      AND cs.cancelled = false
  `) as unknown as Array<{ count: string }>;
  return parseInt(rows[0]?.count ?? "0", 10) || 0;
}

// Lightweight missions list (target_rank + status) used by the rank engine.
export async function getPlayerMissionsLite(
  playerId: string
): Promise<MissionLite[]> {
  const rows = (await sql`
    SELECT target_rank, status
    FROM player_missions
    WHERE player_id = ${playerId}
  `) as unknown as MissionLite[];
  return rows;
}
