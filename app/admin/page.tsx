import Link from "next/link";
import Image from "next/image";
import { Lock } from "lucide-react";

import { hasOwnerAccess } from "@/lib/ownerGate.server";
import { LockButton } from "./unlock/ui/OwnerGate";

export const dynamic = "force-dynamic";

const coachSections = [
  {
    title: "Profiles",
    description: "Edit each coach's booking availability and bio shown on the public calendar.",
    href: "/admin/coaches",
  },
  {
    title: "Calendar",
    description: "See each coach's upcoming scheduled sessions at a glance.",
    href: "/admin/coach-sessions",
  },
  {
    title: "Players",
    description: "Every player a coach trains, with package balances and session counts.",
    href: "/admin/coach-players",
  },
  {
    title: "Reminders",
    description: "Reports, check-ins, photos and test data that are due.",
    href: "/admin/reminders",
  },
  {
    title: "First Session Stats",
    description: "Rank a player's first-session drill numbers against their age group.",
    href: "/admin/first-session-stats",
  },
];

const ownerSections = [
  {
    title: "Players",
    description: "Search all players and open their full admin profile.",
    href: "/admin/players",
  },
  {
    title: "Accounts",
    description: "Create parent accounts and link players from CRM.",
    href: "/admin/private-sessions",
  },
  {
    title: "Group Training",
    description: "Manage group sessions, signups, and scorecards.",
    href: "/admin/group-training",
  },
  {
    title: "Waivers",
    description: "Browse and search all signed private-training waivers.",
    href: "/admin/waivers",
  },
  {
    title: "Challenges",
    description: "Create challenges, manage submissions, and track player progress.",
    href: "/admin/challenges",
  },
  {
    title: "Booking Requests",
    description: "Manage slot-specific session booking requests from the public calendar.",
    href: "/admin/booking-requests",
  },
];

function SectionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="text-lg font-semibold text-gray-900">{title}</div>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
      <div className="mt-5 text-sm font-semibold text-emerald-700">
        Open {title} -&gt;
      </div>
    </Link>
  );
}

export default async function AdminPage() {
  const unlocked = await hasOwnerAccess();

  return (
    <div className="min-h-screen bg-emerald-50">
      <header className="bg-linear-to-r from-emerald-600 to-emerald-700">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex items-center gap-4">
            <Image
              src="/icon.png"
              alt="Admin"
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl bg-white p-2"
              priority
            />
            <div>
              <div className="text-sm font-semibold text-emerald-50">Admin</div>
              <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
                Welcome to the admin.
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Coaches Admin</h2>
          <p className="mt-1 text-sm text-gray-600">
            Availability, bios, and scheduled sessions for each coach.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {coachSections.map((section) => (
              <SectionCard key={section.href} {...section} />
            ))}
          </div>
        </section>

        <hr className="my-10 border-emerald-200" />

        <section>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Owner Admin</h2>
              <p className="mt-1 text-sm text-gray-600">
                {unlocked
                  ? "Unlocked for this browser. Lock when you hand the laptop over."
                  : "Locked. Opening any of these asks for the owner code."}
              </p>
            </div>
            {unlocked ? (
              <LockButton />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-gray-500">
                <Lock className="h-3.5 w-3.5" />
                Locked
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {ownerSections.map((section) => (
              <SectionCard key={section.href} {...section} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
