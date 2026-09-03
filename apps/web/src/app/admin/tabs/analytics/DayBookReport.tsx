import React from "react";
import type { DayBookResponse } from "@/types";

export function DayBookReport({ data }: { data: DayBookResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No day book data.</div>;
  
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Opening Balance</p>
           <p className="text-2xl font-black mt-1 text-[var(--text-primary)]">₹{data.opening_cash.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Total Inflow / Outflow</p>
           <p className="text-xl font-bold mt-1 text-emerald-600">+ ₹{(data.total_cash_in + data.total_sales).toFixed(2)}</p>
           <p className="text-xl font-bold mt-1 text-rose-500">- ₹{(data.total_cash_out + data.total_returns).toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Closing Balance</p>
           <p className="text-2xl font-black mt-1 text-sky-600">₹{data.closing_balance.toFixed(2)}</p>
        </div>
      </div>
      
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-[var(--text-muted)] uppercase text-xs">
              <th className="py-2">Time</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">In (₹)</th>
              <th className="py-2 text-right">Out (₹)</th>
              <th className="py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="py-2 text-[var(--text-muted)]">{new Date(e.timestamp).toLocaleTimeString()}</td>
                <td className="py-2">{e.description} <br/><span className="text-[10px] text-[var(--text-muted)]">{e.entry_type}</span></td>
                <td className="py-2 text-right text-emerald-600">{e.credit > 0 ? e.credit.toFixed(2) : ""}</td>
                <td className="py-2 text-right text-rose-500">{e.debit > 0 ? e.debit.toFixed(2) : ""}</td>
                <td className="py-2 text-right font-mono font-bold">{e.running_balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
