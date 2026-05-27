"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Trash2, ChevronDown, ChevronRight } from "lucide-react";

export type BookingRequest = {
  id: string;
  parent_name: string;
  player_name: string;
  phone: string | null;
  email: string | null;
  slot_date: string;
  slot_start: string;
  slot_end: string;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
};

function fmt(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${ampm}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const statusBadge: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
};

function RequestCard({
  r,
  busy,
  onPatch,
  onDelete,
}: {
  r: BookingRequest;
  busy: string | undefined;
  onPatch: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">{r.parent_name}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusBadge[r.status] ?? ""}`}
            >
              {r.status}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-gray-500">
            Player: <span className="font-medium text-gray-700">{r.player_name}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {r.status !== "confirmed" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onPatch(r.id, "confirmed")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {busy === "confirmed" ? "Confirming…" : "Confirm"}
            </button>
          )}
          {r.status !== "cancelled" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onPatch(r.id, "cancelled")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 transition hover:bg-orange-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              {busy === "cancelled" ? "Cancelling…" : "Cancel"}
            </button>
          )}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onDelete(r.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {busy === "deleting" ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
        📅 {fmtDate(r.slot_date)} &middot; {fmt(r.slot_start)} – {fmt(r.slot_end)}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {r.phone && (
          <a href={`tel:${r.phone}`} className="text-emerald-700 hover:underline">
            {r.phone}
          </a>
        )}
        {r.email && (
          <a href={`mailto:${r.email}`} className="text-emerald-700 hover:underline">
            {r.email}
          </a>
        )}
      </div>

      {r.notes && (
        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
          {r.notes}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Submitted{" "}
        {new Date(r.created_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}{" "}
        at{" "}
        {new Date(r.created_at).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

export function BookingRequestsClient({
  initialRequests,
}: {
  initialRequests: BookingRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [acting, setActing] = useState<Record<string, string>>({});
  const [confirmedOpen, setConfirmedOpen] = useState(false);
  const [cancelledOpen, setCancelledOpen] = useState(false);

  function patch(id: string, status: string) {
    setActing((p) => ({ ...p, [id]: status }));
    void fetch(`/api/admin/booking-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((res) => {
      if (res.ok) {
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: status as BookingRequest["status"] } : r))
        );
      }
      setActing((p) => { const n = { ...p }; delete n[id]; return n; });
    });
  }

  function del(id: string) {
    setActing((p) => ({ ...p, [id]: "deleting" }));
    void fetch(`/api/admin/booking-requests/${id}`, { method: "DELETE" }).then((res) => {
      if (res.ok || res.status === 204) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
      setActing((p) => { const n = { ...p }; delete n[id]; return n; });
    });
  }

  const pending = requests.filter((r) => r.status === "pending");
  const confirmed = requests.filter((r) => r.status === "confirmed");
  const cancelled = requests.filter((r) => r.status === "cancelled");

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        No booking requests yet.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pending — always visible at top */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Pending{pending.length > 0 ? ` (${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            No pending requests.
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <RequestCard
                key={r.id}
                r={r}
                busy={acting[r.id]}
                onPatch={patch}
                onDelete={del}
              />
            ))}
          </div>
        )}
      </section>

      {/* Confirmed — collapsible */}
      {confirmed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setConfirmedOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            {confirmedOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            Confirmed ({confirmed.length})
          </button>
          {confirmedOpen && (
            <div className="mt-3 space-y-4">
              {confirmed.map((r) => (
                <RequestCard
                  key={r.id}
                  r={r}
                  busy={acting[r.id]}
                  onPatch={patch}
                  onDelete={del}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Cancelled — collapsible */}
      {cancelled.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setCancelledOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 text-left text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
          >
            {cancelledOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            Cancelled ({cancelled.length})
          </button>
          {cancelledOpen && (
            <div className="mt-3 space-y-4">
              {cancelled.map((r) => (
                <RequestCard
                  key={r.id}
                  r={r}
                  busy={acting[r.id]}
                  onPatch={patch}
                  onDelete={del}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
