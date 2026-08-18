import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { AddReportForm, type ReportType } from "./ui/AddReportForm";

export const dynamic = "force-dynamic";

const TYPES: ReportType[] = ["blurb", "baseline", "progress"];

export default async function AddReportPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; type?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  const { player, type } = await searchParams;
  const reportType = (TYPES as string[]).includes(type ?? "")
    ? (type as ReportType)
    : "blurb";

  const rows = player
    ? ((await sql`
        SELECT id, name FROM players WHERE id = ${player}::uuid
      `) as unknown as Array<{ id: string; name: string }>)
    : [];
  const target = rows[0] ?? null;

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Add a report</h1>
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
          <AddReportForm
            playerId={target.id}
            playerName={target.name}
            initialType={reportType}
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-semibold">That player has no app account.</p>
            <p className="mt-1">
              Reports are filed against an account. Create their profile first, then the
              reminder will link straight here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
