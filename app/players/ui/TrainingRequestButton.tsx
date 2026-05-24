import Link from "next/link";
import { CalendarDays } from "lucide-react";

export function TrainingRequestButton() {
  return (
    <Link
      href="/book"
      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
    >
      <CalendarDays className="h-4 w-4" />
      Request a Training Time
    </Link>
  );
}
