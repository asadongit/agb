import React from "react";
import type { ItemSalesResponse } from "@/types";

export function ItemSalesReport({ data }: { data: ItemSalesResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No item sales data.</div>;
  
  return (
    <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-[var(--text-muted)] uppercase text-xs">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Revenue</th>
            <th className="py-2 text-right">COGS</th>
            <th className="py-2 text-right">Profit</th>
            <th className="py-2 text-right">Margin %</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, idx) => (
            <tr key={idx} className="border-b border-[var(--border-subtle)] last:border-0">
              <td className="py-2">
                <div className="font-bold">{it.item_name}</div>
                {it.category_name && (
                  <div className="text-[10px] uppercase text-[var(--text-muted)] font-bold tracking-wider mt-0.5">
                    {it.category_name}
                  </div>
                )}
              </td>
              <td className="py-2 text-right">{it.quantity_sold}</td>
              <td className="py-2 text-right">₹{it.revenue.toFixed(2)}</td>
              <td className="py-2 text-right text-rose-500">₹{(it.cost_per_unit || 0).toFixed(2)}</td>
              <td className="py-2 text-right text-emerald-600 font-bold">₹{(it.estimated_profit || 0).toFixed(2)}</td>
              <td className="py-2 text-right">{it.margin_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
