import React from "react";
import type { CategorySalesResponse } from "@/types";

export function CategorySalesReport({ data }: { data: CategorySalesResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No category sales data.</div>;
  
  return (
    <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-[var(--text-muted)] uppercase text-xs">
            <th className="py-2">Category</th>
            <th className="py-2 text-right">Items Sold</th>
            <th className="py-2 text-right">Revenue</th>
            <th className="py-2 text-right">Share %</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((c: any) => (
            <tr key={c.category_id} className="border-b border-[var(--border-subtle)] last:border-0">
              <td className="py-2 font-bold">{c.category_name}</td>
              <td className="py-2 text-right">{c.quantity_sold}</td>
              <td className="py-2 text-right text-[var(--accent-brand)] font-bold">₹{c.revenue.toFixed(2)}</td>
              <td className="py-2 text-right">{c.revenue_share_pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
