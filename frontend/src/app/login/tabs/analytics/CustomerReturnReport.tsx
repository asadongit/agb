import React from "react";
import { UserMinus, PackageOpen, Tag } from "lucide-react";
import { CustomerReturnReportResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";

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
            All Returned Items (Aggregated)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.top_returned_items.map((item, idx) => (
              <div key={idx} className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <p className="font-medium text-[var(--text-primary)] mb-2 truncate">{item.item_name}</p>
                <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                  <span>Return Events:</span>
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

      {/* Return Bills Summary Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <h3 className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
            <PackageOpen className="h-4 w-4 text-[var(--accent-brand)]" />
            Customer Return Transactions
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Date & Time</th>
                <th className="px-6 py-4 font-semibold">Return #</th>
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
                  <td colSpan={7} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No customer returns recorded for this period.
                  </td>
                </tr>
              ) : (
                data.returns.map((item, idx) => (
                  <tr key={`${item.return_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {parseUTCDate(item.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {item.return_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{item.customer_name || 'Walk-in'}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{item.customer_phone}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-[var(--text-secondary)]">
                      {item.order_id ? item.order_id.substring(0, 8) + '...' : 'Direct Return'}
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

      {/* Item-level Return Ledger */}
      {data.return_ledger && data.return_ledger.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-emerald-500" />
                Return Ledger (Individual Line Items)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Itemized breakdown of all returned merchandise
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {data.return_ledger.length} line item{data.return_ledger.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-6 py-3 font-semibold">Date & Time</th>
                  <th className="px-6 py-3 font-semibold">Return #</th>
                  <th className="px-6 py-3 font-semibold">Customer</th>
                  <th className="px-6 py-3 font-semibold">Item Name</th>
                  <th className="px-6 py-3 font-semibold text-center">Qty & Unit</th>
                  <th className="px-6 py-3 font-semibold text-right">Unit Price</th>
                  <th className="px-6 py-3 font-semibold text-right text-red-500">Refund Amount</th>
                  <th className="px-6 py-3 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.return_ledger.map((ledgerItem, idx) => (
                  <tr key={`${ledgerItem.return_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                      {parseUTCDate(ledgerItem.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {ledgerItem.return_number}
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-xs text-[var(--text-primary)]">{ledgerItem.customer_name || 'Walk-in'}</p>
                      {ledgerItem.customer_phone && (
                        <p className="text-[11px] text-[var(--text-secondary)]">{ledgerItem.customer_phone}</p>
                      )}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-[var(--text-primary)]">
                      {ledgerItem.item_name}
                    </td>
                    <td className="px-6 py-3.5 text-center font-mono text-xs">
                      {ledgerItem.quantity} {ledgerItem.selected_unit || 'pc'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-[var(--text-secondary)]">
                      ₹{ledgerItem.unit_price.toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs font-bold text-red-500">
                      ₹{ledgerItem.line_refund.toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-[var(--text-muted)] max-w-xs truncate">
                      {ledgerItem.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}