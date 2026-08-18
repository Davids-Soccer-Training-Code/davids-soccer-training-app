import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { BookingRequestsClient, type BookingRequest } from "./ui/BookingRequestsClient";
import { LockButton } from "../unlock/ui/OwnerGate";

export const dynamic = "force-dynamic";

// Page chrome. The owner gate lives in middleware now, which redirects to
// /admin/unlock before this page runs, so nothing here is queried while locked.
function Shell({ subtitle, action, children }: {
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Booking Requests</h1>
            <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {action}
            <Link
              href="/admin"
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              Back to admin
            </Link>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export default async function BookingRequestsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  const requests = (await sql`
    SELECT id, parent_name, player_name, phone, email,
           slot_date::text AS slot_date,
           to_char(slot_start, 'HH24:MI') AS slot_start,
           to_char(slot_end,   'HH24:MI') AS slot_end,
           notes, status, coach, created_at,
           crm_session_id::text AS crm_session_id, crm_session_kind
    FROM session_booking_requests
    ORDER BY slot_date ASC, slot_start ASC
  `) as unknown as BookingRequest[];

  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <Shell
      subtitle={
        requests.length === 0
          ? "No booking requests yet."
          : `${requests.length} total · ${pending} pending across all coaches`
      }
      action={<LockButton />}
    >
      <BookingRequestsClient initialRequests={requests} />
    </Shell>
  );
}
