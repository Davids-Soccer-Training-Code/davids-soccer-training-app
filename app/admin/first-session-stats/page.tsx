import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The comparison tool is its own deployment, not part of this app — it keeps
// its own log of every entry. Embedding it here means a coach running a first
// session doesn't have to remember a second URL, and the "Open in a new tab"
// link stays for anyone who wants it full-screen.
const STATS_URL = "https://stats.davidssoccertraining.com/";

export default async function FirstSessionStatsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">First Session Stats</h1>
            <p className="mt-1 text-sm text-gray-600">
              Enter a player&apos;s first-session drill numbers and see where they rank in
              their age group.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={STATS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              <ExternalLink className="h-4 w-4" />
              Open in a new tab
            </a>
            <Link
              href="/admin"
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              Back to admin
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
          {/* Tall enough that the whole form and its results fit without the
              frame scrolling inside the page on a laptop. */}
          <iframe
            src={STATS_URL}
            title="Player Comparison"
            className="h-[1400px] w-full border-0"
          />
        </div>
      </main>
    </div>
  );
}
