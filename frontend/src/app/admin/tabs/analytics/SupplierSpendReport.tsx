import React from "react";
import { Building2, PackageOpen } from "lucide-react";
import { SupplierSpendResponse } from "@/types";

type Props = {
  data: SupplierSpendResponse | null;
  isLoading: boolean;
};

export function SupplierSpendReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading supplier spend...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Supplier Spend</h2>
          <p className="text-sm text-[var(--text-secondary)]">Analyze stock purchases by supplier</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Suppliers Used</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_suppliers}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Spend</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_spend.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Supplier Name</th>
                <th className="px-6 py-4 font-semibold text-right">Intakes</th>
                <th className="px-6 py-4 font-semibold text-right">Total Qty</th>
                <th className="px-6 py-4 font-semibold text-right">Avg Unit Cost</th>
                <th className="px-6 py-4 font-semibold text-right text-indigo-500">Total Spend</th>
                <th className="px-6 py-4 font-semibold text-right">Share %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No supplier spend data found for this period.
                  </td>
                </tr>
              ) : (
                data.suppliers.map((item, idx) => (
                  <tr key={`${item.supplier_id || 'unknown'}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{item.supplier_name}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{item.total_intakes}</td>
                    <td className="px-6 py-4 text-right font-medium">{item.total_quantity}</td>
                    <td className="px-6 py-4 text-right text-[var(--text-secondary)]">₹{item.avg_unit_cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-indigo-500">₹{item.total_spend.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {item.share_pct.toFixed(1)}%
                      </span>
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