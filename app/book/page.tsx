import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseCoachParam, COACH_LABELS } from "@/lib/bookingSchedule";
import { getCoachProfiles } from "@/lib/coaches";
import BookingSection from "./BookingSection";

export const dynamic = "force-dynamic";

function coachFromSearchParams(coachParam?: string | string[]): string | null {
  const coach = parseCoachParam(Array.isArray(coachParam) ? coachParam[0] : coachParam);
  return coach === "all" ? null : COACH_LABELS[coach];
}

// Title/preview reflect the ?coach= param so a shared link (e.g. in a text
// message) reads "Book a Session with Coach Simpson". openGraph.title is
// what iMessage and most link-preview cards display.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string | string[] }>;
}): Promise<Metadata> {
  const coachLabel = coachFromSearchParams((await searchParams).coach);
  const heading = coachLabel ? `Book a Session with ${coachLabel}` : "Book a Session";
  const description = coachLabel
    ? `Book a private soccer training session with ${coachLabel}. View open slots and request a time.`
    : "View available private training slots and request a session.";
  return {
    title: `${heading} | David's Soccer Training`,
    description,
    openGraph: { title: heading, description },
    twitter: { card: "summary", title: heading, description },
  };
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string | string[] }>;
}) {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.isAdmin === true;

  // ?coach=david | simon | simpson | all selects the coach tab (defaults to "all").
  const coachParam = (await searchParams).coach;
  const initialCoach = parseCoachParam(Array.isArray(coachParam) ? coachParam[0] : coachParam);

  // Per-coach schedules and bios come from crm_staff (editable in /admin/coaches).
  const coaches = await getCoachProfiles();
  return (
    <div className="min-h-screen bg-emerald-50">
      <header className="bg-linear-to-r from-emerald-600 to-emerald-700">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/"
              className="flex items-center gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Image
                src="/icon.png"
                alt="David's Soccer Training icon"
                width={48}
                height={48}
                className="h-12 w-12 rounded-xl bg-white p-1.5"
                priority
              />
              <div>
                <div className="text-sm font-semibold text-emerald-50">
                  David&apos;s Soccer Training
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  Book a Session
                </h1>
              </div>
            </Link>

            <Link
              href="/"
              className="self-start rounded-xl border border-emerald-200/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 sm:self-auto"
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <BookingSection isAdmin={isAdmin} initialCoach={initialCoach} coaches={coaches} />
      </main>
    </div>
  );
}
