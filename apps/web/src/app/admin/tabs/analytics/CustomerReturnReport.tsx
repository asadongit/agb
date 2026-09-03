import React from "react";
import { UserMinus, PackageOpen, Tag } from "lucide-react";
import { CustomerReturnReportResponse } from "@/types";

type Props = {
  data: CustomerReturnReportResponse | null;
  isLoading: boolean;
};

export function CustomerReturnReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading customer returns...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
          <UserMinus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Customer Returns</h2>
          <p className="text-sm text-[var(--text-secondary)]">Track customer refunds and returned items</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Returns</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_returns}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Refund Amount</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-600 dark:text-red-400">₹{data.total_refund_amount.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Return Rate %</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.return_rate_pct.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {data.top_returned_items.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm p-6">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4 text-[var(--accent-brand)]" />
            Top Returned Items
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.top_returned_items.map((item, idx) => (
              <div key={idx} className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <p className="font-medium text-[var(--text-primary)] mb-2 truncate">{item.item_name}</p>
                <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                  <span>Count:</span>
                  <span className="font-semibold text-[var(--text-primary)]">{item.return_count}</span>
                </div>
                <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                  <span>Qty Returned:</span>
                  <span className="font-semibold text-[var(--text-primary)]">{item.total_quantity_returned}</span>
                </div>
                <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span>Refunded:</span>
                  <span className="font-semibold text-red-500">₹{item.total_refund_amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Date & Time</th>
                <th className="px-6 py-4 font-semibold">Customer</th>
                <th className="px-6 py-4 font-semibold">Order ID</th>
                <th className="px-6 py-4 font-semibold text-center">Items</th>
                <th className="px-6 py-4 font-semibold text-right">Refund Method</th>
                <th className="px-6 py-4 font-semibold text-right text-red-500">Refund Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.returns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No customer returns recorded for this period.
                  </td>
                </tr>
              ) : (
                data.returns.map((item, idx) => (
                  <tr key={`${item.return_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{item.customer_name || 'Walk-in'}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{item.customer_phone}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-[var(--text-secondary)]">
                      {item.order_id ? item.order_id.substring(0, 8) + '...' : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-center font-medium">{item.items_returned}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {item.refund_payment_method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-red-500">₹{item.total_refund_amount.toFixed(2)}</td>
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