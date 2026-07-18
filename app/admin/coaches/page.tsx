import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { COACH_LABELS, COACH_SLUGS } from "@/lib/bookingSchedule";
import { getCoachProfiles } from "@/lib/coaches";
import { CoachProfilesClient, type EditableCoach } from "./ui/CoachProfilesClient";

export const dynamic = "force-dynamic";

export default async function AdminCoachesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  const profiles = await getCoachProfiles();
  const coaches: EditableCoach[] = COACH_SLUGS.map((slug) => ({
    slug,
    label: COACH_LABELS[slug],
    role: profiles[slug].role,
    bio: profiles[slug].bio ?? "",
    schedule: profiles[slug].schedule,
    horizonMonths: profiles[slug].horizonMonths,
  }));

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Coach Profiles</h1>
            <p className="mt-1 text-sm text-gray-600">
              Set each coach&apos;s booking availability and bio. Changes show on the public booking
              page immediately.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
          >
            Back to admin
          </Link>
        </div>

        <CoachProfilesClient initialCoaches={coaches} />
      </main>
    </div>
  );
}
