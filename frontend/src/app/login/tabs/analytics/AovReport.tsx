import React from "react";
import type { AovAnalyticsResponse } from "@/types";

export function AovReport({ data }: { data: AovAnalyticsResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No AOV data.</div>;
  
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center shadow-xs">
        <p className="text-sm text-[var(--text-muted)] font-bold uppercase">Overall Average Order Value</p>
        <p className="text-4xl font-black text-[var(--accent-brand)] mt-2">₹{data.overall_aov.toFixed(2)}</p>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
           <h3 className="font-bold mb-4">By Payment Method</h3>
           {data.by_payment_method.map(pm => (
             <div key={pm.payment_method} className="flex justify-between py-2 border-b last:border-0">
               <span>{pm.payment_method}</span>
               <span className="font-mono font-bold">₹{pm.avg_order_value.toFixed(2)}</span>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
