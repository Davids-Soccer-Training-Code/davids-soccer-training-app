"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

// A period goal plus its steps, created in one pass. The admin panel builds
// these in two stages (create the goal, then add steps to it); a coach on a
// phone after a session wants one form and one button, so this posts the goal
// and then each step against the id that comes back.

const INPUT =
  "mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-400";
const LABEL = "text-xs font-semibold uppercase tracking-widest text-gray-400";

type Step = { title: string; description: string; target_date: string };

const emptyStep = (): Step => ({ title: "", description: "", target_date: "" });

// Default period: today through four weeks out, the usual focus block.
function defaultDates() {
  const start = new Date();
  const end = new Date(start.getTime() + 28 * 86_400_000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function AddGoalForm({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) {
  const router = useRouter();
  const dates = defaultDates();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(dates.start);
  const [endDate, setEndDate] = useState(dates.end);
  const [steps, setSteps] = useState<Step[]>([emptyStep()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim()) return;
    if (endDate < startDate) {
      setError("The end date is before the start date.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/players/${playerId}/period-goals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      if (!res.ok) {
        setError((await res.text()) || "Could not create the goal.");
        return;
      }
      const { goal } = (await res.json()) as { goal: { id: string } };

      // Steps are optional; a goal with none is still a valid focus period.
      const named = steps.filter((s) => s.title.trim());
      for (let i = 0; i < named.length; i++) {
        const s = named[i];
        await fetch(`/api/admin/players/${playerId}/period-goals/${goal.id}/steps`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: s.title.trim(),
            description: s.description.trim() || null,
            target_date: s.target_date || null,
            sort_order: i,
          }),
        });
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-gray-900">
          Goal set for {playerName}.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          It&apos;s on their timeline now, and the reminder will clear itself.
        </p>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setTitle("");
            setDescription("");
            setSteps([emptyStep()]);
          }}
          className="mt-4 rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700"
        >
          Set another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <label className="block">
          <span className={LABEL}>Focus</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="e.g. Weak foot dribbling"
            className={INPUT}
          />
        </label>

        <label className="mt-4 block">
          <span className={LABEL}>Why it matters (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What you want them to get out of this period…"
            className={INPUT}
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>Starts</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Ends</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={INPUT}
            />
          </label>
        </div>
      </div>

      <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-gray-900">Steps</div>
        <p className="mt-1 text-sm text-gray-600">
          The player ticks these off as they go. Leave blank rows out.
        </p>

        <div className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
              <div className="flex items-start gap-2">
                <input
                  value={s.title}
                  onChange={(e) => setStep(i, { title: e.target.value })}
                  placeholder={`Step ${i + 1}`}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none"
                />
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
                    aria-label={`Remove step ${i + 1}`}
                    className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_150px]">
                <input
                  value={s.description}
                  onChange={(e) => setStep(i, { description: e.target.value })}
                  placeholder="Detail (optional)"
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none"
                />
                <input
                  type="date"
                  value={s.target_date}
                  onChange={(e) => setStep(i, { target_date: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSteps((p) => [...p, emptyStep()])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Add step
        </button>
      </div>

      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Set goal"}
      </button>
    </form>
  );
}
