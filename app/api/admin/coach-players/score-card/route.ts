import { NextRequest } from "next/server";

import { assertAdmin } from "@/lib/adminAuth";
import { COACH_SLUGS, type CoachSlug } from "@/lib/bookingSchedule";
import { getScoreCardData } from "@/lib/scoreCard";
import { buildScoreCardPdf } from "@/lib/scoreCardPdf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;

  const raw = req.nextUrl.searchParams.get("coach") ?? "";
  if (!(COACH_SLUGS as readonly string[]).includes(raw)) {
    return new Response("Unknown coach", { status: 400 });
  }
  const coach = raw as CoachSlug;

  const data = await getScoreCardData(coach);
  const pdf = await buildScoreCardPdf(data);

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="score-card-${coach}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
