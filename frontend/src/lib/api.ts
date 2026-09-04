/**
 * Get the backend API base URL dynamically.
 * On laptop browser: http://localhost:8000
 * On smartphone connected via Wi-Fi: http://192.168.x.x:8000
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // Always return relative URL on the client so requests route through Next.js proxy
    return "";
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  return "http://localhost:8000";
}

export function resolveImageUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const apiBase = getApiBaseUrl();
  return `${apiBase}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Parse a datetime string from the backend as UTC.
 * Naive ISO strings (e.g. "2026-08-08T19:15:00.000000") without 'Z' or offset
 * are parsed as local time by browsers unless 'Z' is appended.
 */
export function parseUTCDate(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  if (!str.endsWith("Z") && !str.includes("+") && !str.includes("-", 10)) {
    return new Date(str + "Z");
  }
  return new Date(str);
}
