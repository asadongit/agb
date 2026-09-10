import React, { useState, useMemo } from "react";
import type { DayBookResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";
import { ArrowDown, ArrowUp } from "lucide-react";

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
                <th className="py-2.5 px-2">
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
                <th className="py-2.5 px-2">Description</th>
                <th className="py-2.5 px-2 text-right">In (₹)</th>
                <th className="py-2.5 px-2 text-right">Out (₹)</th>
                <th className="py-2.5 px-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No transactions recorded for this day.
                  </td>
                </tr>
              ) : (
                sortedEntries.map((e, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-surface-elevated)]/40 transition">
                    <td className="py-2.5 px-2 text-[var(--text-muted)] font-mono text-xs whitespace-nowrap">
                      {parseUTCDate(e.timestamp).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="font-semibold text-[var(--text-primary)]">{e.description}</span>
                      <br/>
                      <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">{e.entry_type}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-500">
                      {e.credit > 0 ? e.credit.toFixed(2) : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-500">
                      {e.debit > 0 ? e.debit.toFixed(2) : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-[var(--text-primary)]">
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
