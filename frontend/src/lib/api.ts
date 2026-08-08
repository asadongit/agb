/**
 * Get the backend API base URL dynamically.
 * On laptop browser: http://localhost:8000
 * On smartphone connected via Wi-Fi: http://192.168.x.x:8000
 */
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    // Return relative URL so all requests route through Next.js proxy on dev
    return "";
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
