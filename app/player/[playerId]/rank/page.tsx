import { Trophy } from "lucide-react";
import { PlayerRank } from "@/app/player/[playerId]/ui/PlayerRank";

export default async function PlayerRankPage(props: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await props.params;

  return (
    <div>
      <div className="mb-6 flex items-start gap-3 border-b border-gray-100 pb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
          <Trophy className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Rank Up</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Your rank, what each test is at, and how to reach the next level.
          </p>
        </div>
      </div>

      <PlayerRank playerId={playerId} />
    </div>
  );
}
