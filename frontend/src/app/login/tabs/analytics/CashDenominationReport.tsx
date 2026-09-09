import React from "react";
import { Banknote, WalletCards } from "lucide-react";
import { CashDenominationResponse } from "@/types";

type Props = {
  data: CashDenominationResponse | null;
  isLoading: boolean;
};

export function CashDenominationReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading cash flow data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Cash Denominations</h2>
          <p className="text-sm text-[var(--text-secondary)]">Real-time breakdown of cash drawer notes</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Cash Transactions</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_transactions}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">Net Cash in Drawer</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-green-600 dark:text-green-400">₹{data.net_cash_in_drawer.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overall Denominations */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-[var(--accent-brand)]" />
              Note Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm h-full">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Note</th>
                  <th className="px-4 py-4 font-semibold text-right text-emerald-500">In</th>
                  <th className="px-4 py-4 font-semibold text-right text-red-500">Out</th>
                  <th className="px-4 py-4 font-semibold text-right">Net</th>
                  <th className="px-6 py-4 font-semibold text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.overall_denominations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                      No notes recorded in drawer.
                    </td>
                  </tr>
                ) : (
                  data.overall_denominations.map((denom, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                        ₹{denom.denomination}
                      </td>
                      <td className="px-4 py-4 text-right text-emerald-500">+{denom.notes_in}</td>
                      <td className="px-4 py-4 text-right text-red-500">-{denom.notes_out}</td>
                      <td className="px-4 py-4 text-right font-medium">{denom.net_notes}</td>
                      <td className="px-6 py-4 text-right font-bold text-[var(--text-primary)]">₹{denom.net_value.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transaction Types */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text-primary)]">Flow by Transaction Type</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm h-full">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold text-right">Tx Count</th>
                  <th className="px-6 py-4 font-semibold text-right">Primary Note Flow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.by_transaction_type.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                      No transaction types found.
                    </td>
                  </tr>
                ) : (
                  data.by_transaction_type.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                        {tx.transaction_type}
                      </td>
                      <td className="px-6 py-4 text-right">{tx.total_transactions}</td>
                      <td className="px-6 py-4 text-right">
                        {tx.denominations.length > 0 
                          ? tx.denominations.slice(0, 2).map(d => `${d.net_notes > 0 ? '+' : ''}${d.net_notes}x₹${d.denomination}`).join(', ') 
                            + (tx.denominations.length > 2 ? ' ...' : '')
                          : 'None'
                        }
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}