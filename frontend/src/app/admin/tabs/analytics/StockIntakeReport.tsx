import React from "react";
import { Truck, PackageOpen } from "lucide-react";
import { StockIntakeReportResponse } from "@/types";

type Props = {
  data: StockIntakeReportResponse | null;
  isLoading: boolean;
};

export function StockIntakeReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading stock intakes...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Stock Intakes</h2>
          <p className="text-sm text-[var(--text-secondary)]">Inward inventory from suppliers</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Intakes</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_intakes}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Qty Received</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_quantity}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Cost</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_cost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Item & Supplier</th>
                <th className="px-6 py-4 font-semibold">Batch No.</th>
                <th className="px-6 py-4 font-semibold text-right">Qty</th>
                <th className="px-6 py-4 font-semibold text-right">Unit Cost</th>
                <th className="px-6 py-4 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No stock intakes recorded for this period.
                  </td>
                </tr>
              ) : (
                data.items.map((item, idx) => (
                  <tr key={`${item.intake_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(item.intake_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{item.item_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">Supplier: {item.supplier_name || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {item.batch_number || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-[var(--text-secondary)]">₹{item.unit_cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-[var(--text-primary)]">₹{item.total_cost.toFixed(2)}</td>
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