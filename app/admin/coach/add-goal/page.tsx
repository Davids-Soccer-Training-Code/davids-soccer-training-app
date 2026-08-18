import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { AddGoalForm } from "./ui/AddGoalForm";

export const dynamic = "force-dynamic";

type ActiveGoal = { id: string; title: string; end_date: string };

export default async function AddGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  const { player } = await searchParams;

  const rows = player
    ? ((await sql`SELECT id, name FROM players WHERE id = ${player}::uuid`) as unknown as Array<{
        id: string;
        name: string;
      }>)
    : [];
  const target = rows[0] ?? null;

  // Shown so a coach doesn't accidentally start a second overlapping period.
  const active = target
    ? ((await sql`
        SELECT id, title, end_date::text AS end_date
        FROM player_period_goals
        WHERE player_id = ${target.id}::uuid
          AND end_date >= (now() AT TIME ZONE 'America/Phoenix')::date
        ORDER BY end_date DESC
      `) as unknown as ActiveGoal[])
    : [];

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Set a period goal</h1>
            <p className="mt-1 text-sm text-gray-600">
              {target ? `For ${target.name}.` : "No player selected."}
            </p>
          </div>
          <Link
            href="/admin/reminders"
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
          >
            Back to reminders
          </Link>
        </div>

        {target ? (
          <>
            {active.length > 0 && (
              <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                <p className="font-semibold">Already running</p>
                <ul className="mt-1 space-y-0.5">
                  {active.map((g) => (
                    <li key={g.id}>
                      {g.title} — through {g.end_date}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <AddGoalForm playerId={target.id} playerName={target.name} />
          </>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-semibold">That player has no app account.</p>
            <p className="mt-1">
              Goals are stored against an account, and the player sees them in their app.
              Create their profile first.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
