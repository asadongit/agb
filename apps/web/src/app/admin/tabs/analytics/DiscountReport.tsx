import React from "react";
import type { DiscountReportResponse } from "@/types";

export function DiscountReport({ data }: { data: DiscountReportResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No discount data.</div>;
  
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Total Discount</p>
           <p className="text-2xl font-black mt-1">₹{data.summary.total_discount_amount.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Discounted Orders</p>
           <p className="text-2xl font-black mt-1">{data.summary.total_orders_with_discount}</p>
        </div>
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">% Revenue Discounted</p>
           <p className="text-2xl font-black mt-1">{data.summary.discount_pct_of_revenue.toFixed(2)}%</p>
        </div>
      </div>
      
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
        <h3 className="font-bold mb-4">By Type</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-[var(--text-muted)] uppercase text-xs">
              <th className="py-2">Type</th>
              <th className="py-2 text-right">Orders</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.by_type.map((t, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="py-2 font-bold">{t.discount_type}</td>
                <td className="py-2 text-right">{t.count}</td>
                <td className="py-2 text-right">₹{t.total_amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
