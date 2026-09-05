import React from "react";
import { Trash2, PackageOpen } from "lucide-react";
import { WastageReportResponse } from "@/types";

type Props = {
  data: WastageReportResponse | null;
  isLoading: boolean;
};

export function WastageReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading wastage data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Wastage Report</h2>
          <p className="text-sm text-[var(--text-secondary)]">Track spoiled or wasted inventory items</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Wastage Entries</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_wastage_entries}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Qty Wasted</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_quantity_wasted}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Loss Value</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-600 dark:text-red-400">₹{data.total_wastage_cost.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">% of Total Intake</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.wastage_pct_of_intake.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Item Name</th>
                <th className="px-6 py-4 font-semibold">Reason</th>
                <th className="px-6 py-4 font-semibold">Logged By</th>
                <th className="px-6 py-4 font-semibold text-right">Qty</th>
                <th className="px-6 py-4 font-semibold text-right">Loss Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No wastage recorded for this period!
                  </td>
                </tr>
              ) : (
                data.items.map((item, idx) => (
                  <tr key={`${item.item_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      {item.item_name}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-500/20">
                        {item.change_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">{item.created_by_name || 'System'}</td>
                    <td className="px-6 py-4 text-right font-medium">{item.quantity_wasted}</td>
                    <td className="px-6 py-4 text-right font-bold text-red-500">₹{item.wastage_cost.toFixed(2)}</td>
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