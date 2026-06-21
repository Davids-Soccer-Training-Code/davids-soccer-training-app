import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/adminAuth";
import { getPlayerRank } from "@/lib/getPlayerRank";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;
  const rank = await getPlayerRank(playerId);
  return Response.json({ rank });
}
