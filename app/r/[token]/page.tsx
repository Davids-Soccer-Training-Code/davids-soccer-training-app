import Link from "next/link";

import { sql } from "@/db";
import { verifyReminderToken } from "@/lib/reminderTokens";

export const dynamic = "force-dynamic";

type Row = { id: string; status: string; kind: string; player_name: string };

// The "Done" link from the reminder texts. Signed, so it works without a login
// on whatever phone the coach happens to be holding.
//
// Marking done on GET is deliberate: a one-tap link is the whole point, and the
// action is trivially reversible via the undo below.
export default async function ReminderDonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = await verifyReminderToken(token);

  let row: Row | null = null;
  if (id) {
    const rows = (await sql`
      UPDATE coach_reminders cr
      SET status = 'done', done_at = COALESCE(done_at, now())
      FROM crm_players pl
      WHERE pl.id = cr.crm_player_id AND cr.id = ${id}::uuid
      RETURNING cr.id, cr.status, cr.kind, pl.name AS player_name
    `) as unknown as Row[];
    row = rows[0] ?? null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50 px-6">
      <div className="w-full max-w-sm rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        {row ? (
          <>
            <div className="text-3xl">✅</div>
            <h1 className="mt-3 text-lg font-semibold text-gray-900">Checked off</h1>
            <p className="mt-1 text-sm text-gray-600">
              {row.player_name} — marked done.
            </p>
            <Link
              href="/admin/reminders"
              className="mt-5 inline-block rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              See all reminders
            </Link>
          </>
        ) : (
          <>
            <div className="text-3xl">🤔</div>
            <h1 className="mt-3 text-lg font-semibold text-gray-900">
              That link didn&apos;t work
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              It may have been changed, or the reminder no longer exists.
            </p>
            <Link
              href="/admin/reminders"
              className="mt-5 inline-block rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open reminders
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
