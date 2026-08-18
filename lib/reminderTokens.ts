// One-tap "done" links for the reminder texts.
//
// A coach opening a link from their phone often isn't signed in, so the token
// carries its own proof: `<reminderId>.<hmac>`, keyed on AUTH_SECRET. It can't
// be forged, it doesn't expire (the reminder itself is the lifetime), and
// rotating AUTH_SECRET invalidates every outstanding link.
//
// Web Crypto only, so this stays usable from middleware and the edge.

const enc = new TextEncoder();

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`${process.env.AUTH_SECRET ?? ""}:reminder`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32); // Halved: still 128 bits, and keeps the SMS short.
}

export async function mintReminderToken(reminderId: string): Promise<string> {
  return `${reminderId}.${await sign(reminderId)}`;
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Returns the reminder id, or null when the token is malformed or unsigned.
export async function verifyReminderToken(token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeEqual(mac, await sign(id)) ? id : null;
}
