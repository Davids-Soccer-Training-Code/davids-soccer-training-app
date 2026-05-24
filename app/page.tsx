import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { PublicSiteHeader } from "@/app/ui/PublicSiteHeader";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/players");
  }

  return (
    <div className="min-h-screen bg-emerald-50">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-emerald-50 via-white to-white" />

      <PublicSiteHeader callbackUrl="/players" />

      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Already have an account?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Log in to view and update your player profiles.
            </p>
            <Link
              href="/login?callbackUrl=%2Fplayers"
              className="mt-4 inline-flex rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Log in
            </Link>
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">New parent?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Create your account with email, phone number, and password. Then access your player portal.
            </p>
            <Link
              href="/signup?callbackUrl=%2Fplayers"
              className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Create account
            </Link>
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">View player profile</h3>
            <p className="mt-2 text-sm text-gray-600">
              Go directly to the parent portal. If you are not logged in, you&apos;ll be prompted.
            </p>
            <Link
              href="/players"
              className="mt-4 inline-flex rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Open portal
            </Link>
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-emerald-600 p-6 shadow-sm lg:col-span-3">
            <h3 className="text-lg font-semibold text-white">Book a private session</h3>
            <p className="mt-2 text-sm text-emerald-100">
              View open training slots and request a session. Available weekday mornings, weekday evenings, Saturdays, and Sundays.
            </p>
            <Link
              href="/book"
              className="mt-4 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              See available times
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
