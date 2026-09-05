"use client";

import React, { useState } from "react";
import { Search, ChevronDown, ChevronRight, User } from "lucide-react";
import type { CreditDebitReportResponse, CustomerLedgerEntry } from "@/types";
import { apiRequest } from "../../adminUtils";

type CreditDebitReportProps = {
  data: CreditDebitReportResponse;
};

export function CreditDebitReport({ data }: CreditDebitReportProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const handleExpandCustomer = async (customerId: string) => {
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
      return;
    }
    setExpandedCustomerId(customerId);
    setLoadingLedger(true);
    try {
      const res = await apiRequest<CustomerLedgerEntry[]>(`/api/admin/customers/${customerId}/ledger`);
      setLedgerEntries(res);
    } catch (err) {
      console.error("Error fetching ledger", err);
    } finally {
      setLoadingLedger(false);
    }
  };

  if (!data) {
    return <div className="text-center p-8 text-[var(--text-muted)]">Loading Credit/Debit Data...</div>;
  }

  const filteredCustomers = data.customers?.filter((c) =>
    c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.customer_phone?.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Total Outstanding Credit</div>
          <div className="text-2xl font-black font-mono text-emerald-500">₹{data.summary.total_outstanding_credit.toFixed(2)}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">Store owes to {data.summary.customers_with_credit} customers</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-1">Total Outstanding Debit</div>
          <div className="text-2xl font-black font-mono text-red-500">₹{data.summary.total_outstanding_debit.toFixed(2)}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">{data.summary.customers_with_debit} customers owe the store</div>
        </div>
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Total Customers w/ Balance</div>
          <div className="text-2xl font-black font-mono text-[var(--text-primary)]">{data.summary.customers_with_credit + data.summary.customers_with_debit}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Ledger Transactions in Period</div>
          <div className="text-2xl font-black font-mono text-[var(--text-primary)]">{data.summary.total_transactions}</div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Customer Balances</h3>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface)] text-[10px] uppercase font-bold text-[var(--text-muted)]">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3">Customer</th>
                <th className="p-3 text-right">Credit Balance</th>
                <th className="p-3 text-right">Credit Given (Period)</th>
                <th className="p-3 text-right">Debit Recorded (Period)</th>
                <th className="p-3 text-right">Last Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                    No customers found.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <React.Fragment key={c.customer_id}>
                    <tr 
                      className={`hover:bg-[var(--bg-surface)] cursor-pointer transition ${expandedCustomerId === c.customer_id ? 'bg-[var(--bg-surface)]' : ''}`}
                      onClick={() => handleExpandCustomer(c.customer_id)}
                    >
                      <td className="p-3 text-[var(--text-muted)]">
                        {expandedCustomerId === c.customer_id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-400">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-[var(--text-primary)]">{c.customer_name}</div>
                            <div className="text-[10px] font-mono text-[var(--text-muted)]">{c.customer_phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          c.credit_balance > 0 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
                          c.credit_balance < 0 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                          'text-[var(--text-muted)]'
                        }`}>
                          {c.credit_balance === 0 ? '₹0.00' : (c.credit_balance > 0 ? `+₹${c.credit_balance.toFixed(2)}` : `-₹${Math.abs(c.credit_balance).toFixed(2)}`)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-[var(--text-primary)]">
                        ₹{c.total_credit_given.toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-mono text-[var(--text-primary)]">
                        ₹{c.total_debit_recorded.toFixed(2)}
                      </td>
                      <td className="p-3 text-right text-[10px] text-[var(--text-muted)]">
                        {c.last_transaction_date ? new Date(c.last_transaction_date).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                    
                    {expandedCustomerId === c.customer_id && (
                      <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-strong)]">
                        <td colSpan={6} className="p-0">
                          <div className="p-4 pl-12">
                            <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                              <div className="bg-[var(--bg-surface-elevated)] p-2 text-[10px] font-bold uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                                <span>Recent Ledger Entries</span>
                                {loadingLedger && <span className="text-sky-500 animate-pulse">Loading...</span>}
                              </div>
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-[var(--bg-surface)] text-[9px] uppercase text-[var(--text-muted)]">
                                  <tr>
                                    <th className="p-2">Date</th>
                                    <th className="p-2">Type</th>
                                    <th className="p-2">Note</th>
                                    <th className="p-2">Bill / Source</th>
                                    <th className="p-2 text-right">Amount</th>
                                    <th className="p-2 text-right">Balance After</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                                  {!loadingLedger && ledgerEntries.length === 0 && (
                                    <tr><td colSpan={6} className="p-4 text-center font-sans">No transactions found</td></tr>
                                  )}
                                  {!loadingLedger && ledgerEntries.map(entry => (
                                    <tr key={entry.id} className="hover:bg-[var(--bg-surface-elevated)]">
                                      <td className="p-2">{new Date(entry.created_at).toLocaleString()}</td>
                                      <td className="p-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                          entry.entry_type.includes('CREDIT') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                        }`}>
                                          {entry.entry_type}
                                        </span>
                                      </td>
                                      <td className="p-2 font-sans truncate max-w-[200px]">{entry.note || '-'}</td>
                                      <td className="p-2">
                                        {entry.order_basket_number ? `Bill #${entry.order_basket_number}` : 'Manual'}
                                      </td>
                                      <td className={`p-2 text-right font-bold ${entry.entry_type.includes('CREDIT') ? 'text-emerald-500' : 'text-red-500'}`}>
                                        ₹{entry.amount.toFixed(2)}
                                      </td>
                                      <td className="p-2 text-right font-bold">
                                        ₹{entry.balance_after.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
