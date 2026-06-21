import { NextRequest } from "next/server";
import { assertOwnsPlayer } from "@/lib/assertOwnsPlayer";
import { getPlayerRank } from "@/lib/getPlayerRank";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await ctx.params;
  const auth = await assertOwnsPlayer(req, playerId);
  if (!auth.ok) return auth.res;

  const rank = await getPlayerRank(playerId);
  return Response.json({ rank });
}
