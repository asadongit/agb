import React from "react";
import { Receipt, IndianRupee } from "lucide-react";
import { BillProfitResponse } from "@/types";

type Props = {
  data: BillProfitResponse | null;
  isLoading: boolean;
};

export function BillProfitReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading bill profit data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Bill-wise Profit</h2>
          <p className="text-sm text-[var(--text-secondary)]">Detailed profit margin per transaction</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Bills</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_bills}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Revenue</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_revenue.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total COGS</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-500">₹{data.total_cogs.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Overall Margin</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${data.overall_margin_pct >= 50 ? 'text-emerald-500' : 'text-[var(--text-primary)]'}`}>
              {data.overall_margin_pct.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Bill No.</th>
                <th className="px-6 py-4 font-semibold">Date & Customer</th>
                <th className="px-6 py-4 font-semibold text-right">Items</th>
                <th className="px-6 py-4 font-semibold text-right">Revenue</th>
                <th className="px-6 py-4 font-semibold text-right">Est. COGS</th>
                <th className="px-6 py-4 font-semibold text-right text-emerald-500">Est. Profit</th>
                <th className="px-6 py-4 font-semibold text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.bills.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <IndianRupee className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No bill profit data found for this period.
                  </td>
                </tr>
              ) : (
                data.bills.map((bill, idx) => (
                  <tr key={`${bill.order_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      {bill.basket_number}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{bill.customer_name || 'Walk-in'}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{new Date(bill.created_at).toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{bill.items_count}</td>
                    <td className="px-6 py-4 text-right font-medium">₹{bill.total_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-red-500">₹{bill.estimated_cogs.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-500">₹{bill.estimated_profit.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        bill.margin_pct >= 50 
                          ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20' 
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] ring-[var(--border-subtle)]'
                      }`}>
                        {bill.margin_pct.toFixed(1)}%
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