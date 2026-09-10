import React, { useState, useMemo } from "react";
import type { DayBookResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";
import { ArrowDown, ArrowUp, Building2, Phone, User, UserCheck } from "lucide-react";

export function DayBookReport({ data }: { data: DayBookResponse | null }) {
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const sortedEntries = useMemo(() => {
    if (!data?.entries) return [];
    const list = data.entries.map((entry, originalIndex) => ({ entry, originalIndex }));
    list.sort((a, b) => {
      const timeA = new Date(a.entry.timestamp).getTime();
      const timeB = new Date(b.entry.timestamp).getTime();
      if (timeA !== timeB) {
        return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
      }
      return sortOrder === "desc" ? b.originalIndex - a.originalIndex : a.originalIndex - b.originalIndex;
    });
    return list.map((item) => item.entry);
  }, [data?.entries, sortOrder]);

  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No day book data.</div>;
  
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Opening Balance</p>
           <p className="text-2xl font-black mt-1 text-[var(--text-primary)] font-mono">₹{data.opening_cash.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Total Inflow / Outflow</p>
           <p className="text-xl font-bold mt-1 text-emerald-500 font-mono">+ ₹{(data.total_cash_in + data.total_sales).toFixed(2)}</p>
           <p className="text-xl font-bold mt-1 text-rose-500 font-mono">- ₹{(data.total_cash_out + data.total_returns).toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Closing Balance</p>
           <p className="text-2xl font-black mt-1 text-sky-400 font-mono">₹{data.closing_balance.toFixed(2)}</p>
        </div>
      </div>
      
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border-subtle)]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Day Transactions ({sortedEntries.length})
          </h3>
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:border-sky-500 px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:text-sky-400 transition cursor-pointer shadow-xs"
            title={sortOrder === "desc" ? "Sorted: Latest on top (Click to view Earliest First)" : "Sorted: Earliest on top (Click to view Latest First)"}
          >
            {sortOrder === "desc" ? (
              <>
                <ArrowDown className="h-3.5 w-3.5 text-sky-400" />
                <span>Latest on Top</span>
              </>
            ) : (
              <>
                <ArrowUp className="h-3.5 w-3.5 text-sky-400" />
                <span>Earliest on Top</span>
              </>
            )}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase text-xs">
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                    className="inline-flex items-center gap-1 font-bold text-[var(--text-secondary)] hover:text-sky-400 transition cursor-pointer uppercase text-xs"
                    title="Toggle Sort Order"
                  >
                    <span>Time</span>
                    {sortOrder === "desc" ? (
                      <ArrowDown className="h-3.5 w-3.5 text-sky-400" />
                    ) : (
                      <ArrowUp className="h-3.5 w-3.5 text-sky-400" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Party / Contact</th>
                <th className="py-2.5 px-3 text-right">In (₹)</th>
                <th className="py-2.5 px-3 text-right">Out (₹)</th>
                <th className="py-2.5 px-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No transactions recorded for this day.
                  </td>
                </tr>
              ) : (
                sortedEntries.map((e, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-surface-elevated)]/40 transition">
                    <td className="py-2.5 px-3 text-[var(--text-muted)] font-mono text-xs whitespace-nowrap align-top">
                      {parseUTCDate(e.timestamp).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="font-semibold text-[var(--text-primary)]">{e.description}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                          {e.entry_type.replace(/_/g, " ")}
                        </span>
                        {e.reference_number && e.reference_number !== "-" && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            Ref: {e.reference_number}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      {e.entity_name ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="inline-flex items-center gap-1.5">
                            {e.entity_type === "CUSTOMER" ? (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-sky-500/10 text-sky-400 shrink-0" title="Customer">
                                <User className="h-3 w-3" />
                              </span>
                            ) : e.entity_type === "SUPPLIER" ? (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-amber-500/10 text-amber-400 shrink-0" title="Supplier">
                                <Building2 className="h-3 w-3" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-purple-500/10 text-purple-400 shrink-0" title="Staff">
                                <UserCheck className="h-3 w-3" />
                              </span>
                            )}
                            <span className="font-semibold text-xs text-[var(--text-primary)]">
                              {e.entity_name}
                            </span>
                          </div>
                          {e.entity_phone ? (
                            <div className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] font-mono pl-6.5">
                              <Phone className="h-2.5 w-2.5 opacity-70" />
                              <span>{e.entity_phone}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] font-mono">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-500 align-top">
                      {e.credit > 0 ? e.credit.toFixed(2) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-500 align-top">
                      {e.debit > 0 ? e.debit.toFixed(2) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-primary)] align-top">
                      ₹{e.running_balance.toFixed(2)}
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
