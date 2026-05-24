import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import BookingCalendar from "./BookingCalendar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Book a Session | David's Soccer Training",
  description: "View available private training slots and request a session.",
};

export default async function BookPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.isAdmin === true;
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
        <div className="mb-8">
          <p className="text-sm text-gray-600 max-w-xl">
            Pick an open slot below and fill in your details. Your request will be held
            and we&apos;ll text you to confirm within 24 hours.
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm">
              <span className="font-semibold text-gray-800">Mon – Fri</span>
              <span className="ml-2 text-gray-600">8:00 – 12:00 AM &amp; 5:30 – 7:30 PM</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm">
              <span className="font-semibold text-gray-800">Saturday</span>
              <span className="ml-2 text-gray-600">5:30 – 7:30 PM</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm">
              <span className="font-semibold text-gray-800">Sunday</span>
              <span className="ml-2 text-gray-600">8:00 AM – 12:00 PM</span>
            </div>
          </div>
        </div>

        <BookingCalendar isAdmin={isAdmin} />
      </main>
    </div>
  );
}
