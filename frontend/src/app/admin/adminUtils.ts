/**
 * Admin dashboard utility functions — extracted from page.tsx
 */

import { parseUTCDate } from "@/lib/api";
export { parseUTCDate };

// ── Currency formatting ─────────────────────────────────────────────────

export const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRupees(value: string | number): string {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isNaN(numeric) ? `₹${value}` : money.format(numeric);
}

// ── Date formatting ─────────────────────────────────────────────────────

export function formatDateTime(value: string): string {
  const parsed = parseUTCDate(value);
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── API response parser ─────────────────────────────────────────────────

export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let detail = "Request failed. Please try again.";
    if (typeof payload?.detail === "string") {
      detail = payload.detail;
    } else if (Array.isArray(payload?.detail) && payload.detail.length > 0) {
      detail = payload.detail
        .map((err: { msg?: string }) => err.msg || JSON.stringify(err))
        .join(", ");
    } else if (typeof payload?.message === "string") {
      detail = payload.message;
    }
    throw new Error(detail);
  }

  return payload as T;
}
