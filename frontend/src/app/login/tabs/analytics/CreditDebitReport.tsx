"use client";

import React, { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, User, History, Receipt, ArrowDownRight, ArrowUpRight, Filter } from "lucide-react";
import type { CreditDebitReportResponse, CustomerLedgerEntry, CreditDebitTransactionRow } from "@/types";
import { apiRequest } from "../../adminUtils";
import { parseUTCDate } from "@/lib/api";

type CreditDebitReportProps = {
  data: CreditDebitReportResponse | null;
  isLoading?: boolean;
};

function formatEntryBadge(type: string) {
  switch (type) {
    case "DEBIT_ADDED":
      return {
        label: "Udhaar / Shortfall",
        classes: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
        isNegative: true,
      };
    case "DEBIT_SETTLED":
      return {
        label: "Debt Settled",
        classes: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        isNegative: false,
      };
    case "CREDIT_ADDED":
      return {
        label: "Credit Awarded",
        classes: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
        isNegative: false,
      };
    case "CREDIT_APPLIED":
    case "CREDIT_USED":
      return {
        label: "Credit Used",
        classes: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        isNegative: true,
      };
    default:
      return {
        label: type.replace(/_/g, " "),
        classes: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
        isNegative: false,
      };
  }
}

export function CreditDebitReport({ data, isLoading }: CreditDebitReportProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Transactions ledger filter & search state
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<"ALL" | "DEBIT_ADDED" | "DEBIT_SETTLED" | "CREDIT_ADDED" | "CREDIT_USED">("ALL");

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading credit / debit data...</div>;
  }
  if (!data) return null;

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

  const filteredCustomers = data.customers?.filter((c) =>
    c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.customer_phone?.includes(searchQuery)
  );

  const rawTransactions = data.transactions || [];

  const filteredTransactions = rawTransactions.filter((tx) => {
    if (txTypeFilter === "DEBIT_ADDED" && tx.entry_type !== "DEBIT_ADDED") return false;
    if (txTypeFilter === "DEBIT_SETTLED" && tx.entry_type !== "DEBIT_SETTLED") return false;
    if (txTypeFilter === "CREDIT_ADDED" && tx.entry_type !== "CREDIT_ADDED") return false;
    if (txTypeFilter === "CREDIT_USED" && !["CREDIT_APPLIED", "CREDIT_USED"].includes(tx.entry_type)) return false;

    if (txSearchQuery.trim()) {
      const q = txSearchQuery.toLowerCase();
      const matchName = tx.customer_name.toLowerCase().includes(q);
      const matchPhone = tx.customer_phone.includes(q);
      const matchNote = tx.note ? tx.note.toLowerCase().includes(q) : false;
      const matchBasket = tx.order_basket_number ? tx.order_basket_number.toLowerCase().includes(q) : false;
      const matchStaff = tx.staff_name ? tx.staff_name.toLowerCase().includes(q) : false;
      return matchName || matchPhone || matchNote || matchBasket || matchStaff;
    }

    return true;
  });

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

      {/* Customer Balances Table */}
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
                        {c.last_transaction_date ? parseUTCDate(c.last_transaction_date).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                    
                    {expandedCustomerId === c.customer_id && (
                      <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-strong)]">
                        <td colSpan={6} className="p-0">
                          <div className="p-4 pl-12">
                            <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                              <div className="bg-[var(--bg-surface-elevated)] p-2 text-[10px] font-bold uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                                <span>Customer Transaction Ledger</span>
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
                                    <tr><td colSpan={6} className="p-4 text-center font-sans text-[var(--text-muted)]">No transactions found</td></tr>
                                  )}
                                  {!loadingLedger && ledgerEntries.map(entry => {
                                    const badge = formatEntryBadge(entry.entry_type);
                                    return (
                                      <tr key={entry.id} className="hover:bg-[var(--bg-surface-elevated)]">
                                        <td className="p-2">{parseUTCDate(entry.created_at).toLocaleString()}</td>
                                        <td className="p-2">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badge.classes}`}>
                                            {badge.label}
                                          </span>
                                        </td>
                                        <td className="p-2 font-sans truncate max-w-[200px] text-[var(--text-secondary)]">{entry.note || '-'}</td>
                                        <td className="p-2">
                                          {entry.order_basket_number ? `Bill #${entry.order_basket_number}` : 'Direct'}
                                        </td>
                                        <td className={`p-2 text-right font-bold ${badge.isNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                                          {badge.isNegative ? '-' : '+'}₹{Math.abs(entry.amount).toFixed(2)}
                                        </td>
                                        <td className={`p-2 text-right font-bold ${
                                          entry.balance_after < 0 ? 'text-rose-400' : entry.balance_after > 0 ? 'text-emerald-400' : 'text-[var(--text-muted)]'
                                        }`}>
                                          {entry.balance_after < 0 ? `-₹${Math.abs(entry.balance_after).toFixed(2)}` : `₹${entry.balance_after.toFixed(2)}`}
                                        </td>
                                      </tr>
                                    );
                                  })}
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

      {/* Full Credit & Debit Ledger Transactions */}
      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]">
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Credit &amp; Debit Ledger Transactions
                </h3>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Audit trail of store credit awards, redemptions, shortfall debt, and customer debt settlements in selected period
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter by customer, phone, note, bill..."
                value={txSearchQuery}
                onChange={(e) => setTxSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500 text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Type:
            </span>
            {[
              { id: "ALL", label: `All (${rawTransactions.length})` },
              { id: "DEBIT_ADDED", label: "Udhaar / Shortfalls" },
              { id: "DEBIT_SETTLED", label: "Debt Settled" },
              { id: "CREDIT_ADDED", label: "Store Credit Added" },
              { id: "CREDIT_USED", label: "Credit Used" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTxTypeFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                  txTypeFilter === f.id
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-sm"
                    : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface)] text-[10px] uppercase font-bold text-[var(--text-muted)]">
              <tr>
                <th className="p-3">Date &amp; Time</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Type</th>
                <th className="p-3">Bill / Source</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Balance After</th>
                <th className="p-3">Note / Details</th>
                <th className="p-3">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[var(--text-muted)] font-sans">
                    <Receipt className="h-8 w-8 mx-auto opacity-30 mb-2" />
                    <div className="font-medium">No credit/debit transactions recorded in this period.</div>
                    <div className="text-[11px] opacity-70 mt-1">Transactions will appear when customer udhaar, credit awards, or payments are processed.</div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const badge = formatEntryBadge(tx.entry_type);
                  return (
                    <tr key={tx.id} className="hover:bg-[var(--bg-surface)] transition">
                      <td className="p-3 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {tx.created_at ? parseUTCDate(tx.created_at).toLocaleString() : "-"}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-[var(--text-primary)]">{tx.customer_name}</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{tx.customer_phone}</div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${badge.classes}`}>
                          {badge.isNegative ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                        {tx.order_basket_number ? (
                          <span className="font-bold text-sky-400">Bill #{tx.order_basket_number}</span>
                        ) : tx.order_id ? (
                          <span className="text-[var(--text-muted)]">#{tx.order_id.slice(0, 8)}</span>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">Direct / Return</span>
                        )}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold text-sm ${badge.isNegative ? "text-rose-400" : "text-emerald-400"}`}>
                        {badge.isNegative ? "-" : "+"}₹{Math.abs(tx.amount).toFixed(2)}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold text-xs ${
                        tx.balance_after < 0
                          ? "text-rose-400"
                          : tx.balance_after > 0
                          ? "text-emerald-400"
                          : "text-[var(--text-muted)]"
                      }`}>
                        {tx.balance_after < 0
                          ? `-₹${Math.abs(tx.balance_after).toFixed(2)}`
                          : `₹${tx.balance_after.toFixed(2)}`}
                      </td>
                      <td className="p-3 text-[11px] text-[var(--text-secondary)] max-w-xs truncate" title={tx.note || ""}>
                        {tx.note || "-"}
                      </td>
                      <td className="p-3 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {tx.staff_name || "System"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

