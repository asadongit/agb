import React from "react";
import { ArrowRightLeft, PackageOpen } from "lucide-react";
import { StockMovementResponse } from "@/types";

type Props = {
  data: StockMovementResponse | null;
  isLoading: boolean;
};

export function StockMovementReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading stock movement...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
          <ArrowRightLeft className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Stock Movement</h2>
          <p className="text-sm text-[var(--text-secondary)]">Track inventory changes over time</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Items Tracked</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_items}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Item Name</th>
                <th className="px-6 py-4 font-semibold text-right">Opening</th>
                <th className="px-6 py-4 font-semibold text-right text-emerald-500">In (+)</th>
                <th className="px-6 py-4 font-semibold text-right text-red-500">Out (-)</th>
                <th className="px-6 py-4 font-semibold text-right">Adjustments</th>
                <th className="px-6 py-4 font-semibold text-right text-[var(--accent-brand)]">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No stock movement data found for this period.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.item_id} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{item.item_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">Unit: {item.unit}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{item.opening_stock}</td>
                    <td className="px-6 py-4 text-right text-emerald-500">
                      {item.intake_qty + item.restock_qty > 0 ? `+${item.intake_qty + item.restock_qty}` : "0"}
                    </td>
                    <td className="px-6 py-4 text-right text-red-500">
                      {item.sales_deduction_qty + item.purchase_return_qty + item.void_batch_qty > 0
                        ? `-${item.sales_deduction_qty + item.purchase_return_qty + item.void_batch_qty}`
                        : "0"}
                    </td>
                    <td className="px-6 py-4 text-right">{item.manual_adjustment_qty}</td>
                    <td className="px-6 py-4 text-right font-bold text-[var(--accent-brand)]">
                      {item.closing_stock}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}