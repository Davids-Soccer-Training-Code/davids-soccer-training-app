import { NextRequest } from "next/server";

import { assertAdmin } from "@/lib/adminAuth";
import { getPlayerSheetData } from "@/lib/playerPrintSheet";
import { buildPlayerSheetPdf } from "@/lib/playerSheetPdf";

export const dynamic = "force-dynamic";

function fileName(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${slug || "player"}-profile.pdf`;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  const err = await assertAdmin(req);
  if (err) return err;

  const { playerId } = await ctx.params;

  const data = await getPlayerSheetData(playerId);
  if (!data) return new Response("Player not found", { status: 404 });

  const pdf = await buildPlayerSheetPdf(data);

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fileName(data.player.name)}"`,
      "cache-control": "no-store",
    },
  });
}
