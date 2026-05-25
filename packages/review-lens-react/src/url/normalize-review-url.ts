export function normalizeReviewUrl(url: string): string {
  const parsed = new URL(url, window.location.href);
  return parsed.pathname.replace(/\/+$/, "") || "/";
}

