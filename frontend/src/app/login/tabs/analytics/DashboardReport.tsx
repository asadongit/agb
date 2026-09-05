import React from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Clock, DollarSign, Flame, Percent, ShoppingBag } from "lucide-react";
import type { AnalyticsKpiSummary, FunnelAnalytics, PeakHoursAnalytics, RevenueAnalytics, TopItemsAnalytics } from "@/types";

type Props = {
  kpiData: AnalyticsKpiSummary | null;
  revenueData: RevenueAnalytics | null;
  peakHoursData: PeakHoursAnalytics | null;
  topItemsData: TopItemsAnalytics | null;
  funnelData: FunnelAnalytics | null;
};

export function DashboardReport({ kpiData, revenueData, peakHoursData, topItemsData, funnelData }: Props) {
  if (!kpiData) return <div className="p-12 text-center text-[var(--text-muted)] text-sm">No dashboard data available.</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase"><span>Revenue</span><DollarSign className="h-4 w-4" /></div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">₹{kpiData.total_revenue.toLocaleString()}</p>
            <span className={`text-[10px] font-bold ${kpiData.revenue_change_pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {kpiData.revenue_change_pct >= 0 ? "+" : ""}{kpiData.revenue_change_pct}%
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase"><span>Orders</span><ShoppingBag className="h-4 w-4" /></div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">{kpiData.total_orders}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase"><span>New Customers</span><Activity className="h-4 w-4" /></div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">{kpiData.new_customers}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase"><span>Profit Margin</span><Percent className="h-4 w-4" /></div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">{kpiData.profit_margin_pct}%</p>
          </div>
        </div>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-4"><Flame className="h-5 w-5 text-amber-500"/> Top Items</h2>
          {topItemsData?.items.map((it, idx) => (
             <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-[var(--border-subtle)] last:border-0">
               <div>
                 <span className="font-semibold">{it.name}</span>
                 {it.category_name && (
                   <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-muted)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                     {it.category_name}
                   </span>
                 )}
               </div>
               <span className="font-mono font-bold text-[var(--accent-brand)]">₹{it.revenue.toFixed(2)}</span>
             </div>
          ))}
        </div>
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-4"><Clock className="h-5 w-5 text-sky-500"/> Peak Hours</h2>
          <div className="h-40 flex items-end gap-1">
            {peakHoursData?.buckets.map(b => (
              <div key={b.hour} className="flex-1 bg-[var(--accent-brand)] opacity-80 hover:opacity-100 transition-all rounded-t-md" style={{ height: `${Math.max(10, b.orders_count * 5)}%` }} title={`${b.hour_label}: ${b.orders_count} orders`}></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
