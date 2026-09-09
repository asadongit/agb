import React from "react";
import type { PaymentMixResponse } from "@/types";

export function PaymentMixReport({ data }: { data: PaymentMixResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No payment mix data.</div>;
  
  return (
    <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-[var(--text-muted)] uppercase text-xs">
            <th className="py-2">Method</th>
            <th className="py-2 text-right">Orders</th>
            <th className="py-2 text-right">Revenue</th>
            <th className="py-2 text-right">Share %</th>
          </tr>
        </thead>
        <tbody>
          {data.methods.map((m: any) => (
            <tr key={m.payment_method} className="border-b border-[var(--border-subtle)] last:border-0">
              <td className="py-2 font-bold">{m.payment_method}</td>
              <td className="py-2 text-right">{m.orders_count}</td>
              <td className="py-2 text-right font-bold text-[var(--accent-brand)]">₹{m.total_revenue.toFixed(2)}</td>
              <td className="py-2 text-right">{m.revenue_share_pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
