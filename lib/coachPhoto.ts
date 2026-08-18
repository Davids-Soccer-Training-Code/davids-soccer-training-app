// Blob key prefix for coach headshots. Uploads land here, and it is the marker
// that tells the cleanup path a stored photo_url is a file we own.
export const COACH_PHOTO_PREFIX = "coaches/";

// True only for photo URLs this app uploaded, so replacing or clearing a photo
// never deletes a URL that was set by hand or points at something else. Any
// non-Blob or differently-prefixed URL is left strictly alone.
export function isManagedCoachPhotoUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.endsWith(".blob.vercel-storage.com") &&
      parsed.pathname.startsWith(`/${COACH_PHOTO_PREFIX}`)
    );
  } catch {
    return false;
  }
}
