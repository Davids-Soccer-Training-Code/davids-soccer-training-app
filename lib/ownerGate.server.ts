import "server-only";

import { cookies } from "next/headers";

import { UNLOCK_COOKIE, verifyUnlockToken } from "./ownerGate";

// Cookie-jar side of the owner gate, for server components and route handlers.
// Kept out of lib/ownerGate.ts because next/headers can't be imported from
// middleware.
export async function hasOwnerAccess(): Promise<boolean> {
  const jar = await cookies();
  return verifyUnlockToken(jar.get(UNLOCK_COOKIE)?.value);
}
