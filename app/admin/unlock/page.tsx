import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { isGateConfigured } from "@/lib/ownerGate";
import { hasOwnerAccess } from "@/lib/ownerGate.server";
import { OwnerGate } from "./ui/OwnerGate";

export const dynamic = "force-dynamic";

// Only ever redirect back into the admin area — `next` comes from the query
// string, so an open redirect would otherwise be one crafted link away.
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//")) return "/admin";
  return raw;
}

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/admin");

  const { next, reason } = await searchParams;
  const target = safeNext(next);

  if (isGateConfigured() && (await hasOwnerAccess())) redirect(target);

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Owner Admin</h1>
            <p className="mt-1 text-sm text-gray-600">This section needs the owner code.</p>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
          >
            Back to admin
          </Link>
        </div>

        {reason === "unconfigured" || !isGateConfigured() ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-semibold">OWNER_CODE is not configured.</p>
            <p className="mt-1">
              Set it as an environment variable (Vercel → Project → Settings → Environment
              Variables, and in your local <code>.env</code>), then redeploy.
            </p>
          </div>
        ) : (
          <OwnerGate next={target} />
        )}
      </main>
    </div>
  );
}
