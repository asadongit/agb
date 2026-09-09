import React from "react";
import { Calculator, Landmark } from "lucide-react";
import { TaxSummaryResponse } from "@/types";

type Props = {
  data: TaxSummaryResponse | null;
  isLoading: boolean;
};

export function TaxSummaryReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading tax summary...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Tax Summary</h2>
          <p className="text-sm text-[var(--text-secondary)]">Tax collected across different slabs</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Taxable Amount</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_taxable_amount.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Tax Collected</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_tax_collected.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Tax Category</th>
                <th className="px-6 py-4 font-semibold text-right">Tax Rate %</th>
                <th className="px-6 py-4 font-semibold text-right">Items Count</th>
                <th className="px-6 py-4 font-semibold text-right">Taxable Amount</th>
                <th className="px-6 py-4 font-semibold text-right text-purple-500">Tax Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.slabs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <Calculator className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No tax data found for this period.
                  </td>
                </tr>
              ) : (
                data.slabs.map((slab, idx) => (
                  <tr key={`${slab.tax_category}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      {slab.tax_category}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {slab.tax_rate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-[var(--text-secondary)]">{slab.items_count}</td>
                    <td className="px-6 py-4 text-right font-medium">₹{slab.taxable_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-purple-500">₹{slab.tax_collected.toFixed(2)}</td>
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