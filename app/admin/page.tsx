import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

const sections = [
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
    title: "Training Requests",
    description: "View all training time requests submitted by parents.",
    href: "/admin/training-requests",
  },
  {
    title: "Booking Requests",
    description: "Manage slot-specific session booking requests from the public calendar.",
    href: "/admin/booking-requests",
  },
  {
    title: "Coach Profiles",
    description: "Edit each coach's booking availability and bio shown on the public calendar.",
    href: "/admin/coaches",
  },
  {
    title: "Coach Sessions",
    description: "See each coach's upcoming scheduled sessions at a glance.",
    href: "/admin/coach-sessions",
  },
];

export default function AdminPage() {
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
        <div className="grid gap-5 md:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              <div className="text-lg font-semibold text-gray-900">{section.title}</div>
              <p className="mt-2 text-sm text-gray-600">{section.description}</p>
              <div className="mt-5 text-sm font-semibold text-emerald-700">
                Open {section.title} -&gt;
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
