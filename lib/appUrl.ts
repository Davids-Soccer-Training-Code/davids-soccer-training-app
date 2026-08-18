// The public origin for links that leave the app (SMS, email). Defaults to
// production because a text with a localhost link is useless.
export const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_BASE_URL || "https://app.davidssoccertraining.com"
).replace(/\/+$/, "");

export function appUrl(path: string): string {
  return `${APP_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
