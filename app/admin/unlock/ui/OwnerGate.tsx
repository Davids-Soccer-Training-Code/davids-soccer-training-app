"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

// The locked state of the owner sections. Middleware redirects here before the
// requested page runs, so none of its data has been queried at this point and
// nothing sensitive reaches the browser until the code checks out.
export function OwnerGate({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/owner-unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        setCode("");
        // The cookie is set; middleware will let the original page through now.
        router.replace(next);
        router.refresh();
        return;
      }
      setError((await res.text()) || "Incorrect code.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold text-gray-900">Owner code required</h2>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        The owner sections are locked. Enter the owner code to unlock them for 12 hours.
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Owner code
          </span>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoComplete="off"
            placeholder="Enter code"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-400"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !code}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

// Shown on the dashboard once unlocked, so access can be ended early instead of
// waiting out the 12 hours (e.g. before handing the laptop to a coach).
export function LockButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/admin/owner-unlock", { method: "DELETE" }).catch(() => {});
        setBusy(false);
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50"
    >
      <Lock className="h-3.5 w-3.5" />
      {busy ? "Locking…" : "Lock"}
    </button>
  );
}
