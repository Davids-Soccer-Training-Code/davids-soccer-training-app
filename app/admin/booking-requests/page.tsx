import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { BookingRequestsClient, type BookingRequest } from "./ui/BookingRequestsClient";

export const dynamic = "force-dynamic";

export default async function BookingRequestsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  const requests = (await sql`
    SELECT id, parent_name, player_name, phone, email,
           slot_date::text AS slot_date,
           to_char(slot_start, 'HH24:MI') AS slot_start,
           to_char(slot_end,   'HH24:MI') AS slot_end,
           notes, status, created_at
    FROM session_booking_requests
    ORDER BY slot_date ASC, slot_start ASC
  `) as unknown as BookingRequest[];

  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Booking Requests</h1>
            <p className="mt-1 text-sm text-gray-600">
              {requests.length === 0
                ? "No booking requests yet."
                : `${requests.length} total · ${pending} pending`}
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
          >
            Back to admin
          </Link>
        </div>

        <BookingRequestsClient initialRequests={requests} />
      </main>
    </div>
  );
}
