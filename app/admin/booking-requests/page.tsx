import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { hasBookingRequestsAccess, isGateConfigured } from "@/lib/bookingRequestsGate";
import { BookingRequestsClient, type BookingRequest } from "./ui/BookingRequestsClient";
import { BookingRequestsGate, LockButton } from "./ui/BookingRequestsGate";

export const dynamic = "force-dynamic";

// Page chrome, shared by the locked and unlocked states so the header doesn't
// drift between them.
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

  // Fail closed: with no code configured there is nothing to check against, so
  // the page stays shut rather than falling open to every admin.
  if (!isGateConfigured()) {
    return (
      <Shell subtitle="Locked.">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">BOOKING_REQUESTS_CODE is not configured.</p>
          <p className="mt-1">
            Set it as an environment variable (Vercel → Project → Settings → Environment
            Variables, and in your local <code>.env</code>), then redeploy.
          </p>
        </div>
      </Shell>
    );
  }

  // Everything below the gate is skipped while locked — including the query —
  // so no booking data is sent to the browser until the code checks out.
  if (!(await hasBookingRequestsAccess())) {
    return (
      <Shell subtitle="This page needs the owner code.">
        <BookingRequestsGate />
      </Shell>
    );
  }

  const requests = (await sql`
    SELECT id, parent_name, player_name, phone, email,
           slot_date::text AS slot_date,
           to_char(slot_start, 'HH24:MI') AS slot_start,
           to_char(slot_end,   'HH24:MI') AS slot_end,
           notes, status, coach, created_at
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
