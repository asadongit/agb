/**
 * AnalyticsTab — Sales & executive analytics tab for the admin dashboard.
 *
 * Displays KPI summary strip, revenue bar chart with drill-down,
 * top performing products, order funnel, peak hours heatmap,
 * and profit margin / COGS table.
 * Extracted from admin page.tsx (lines 3677-4178).
 */

"use client";

import { useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Clock,
  DollarSign,
  Download,
  FileText,
  FilterX,
  Flame,
  Percent,
  PieChart,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import { generateAnalyticsPdfReport } from "@/lib/pdfGenerator";
import type {
  AnalyticsKpiSummary,
  FunnelAnalytics,
  PeakHoursAnalytics,
  ProfitMarginAnalytics,
  RevenueAnalytics,
  TopItemsAnalytics,
} from "@/types";
import type { RestaurantProfile } from "../adminTypes";

type AnalyticsTabProps = {
  restaurant: RestaurantProfile | null;

  // Data
  kpiData: AnalyticsKpiSummary | null;
  revenueData: RevenueAnalytics | null;
  peakHoursData: PeakHoursAnalytics | null;
  topItemsData: TopItemsAnalytics | null;
  funnelData: FunnelAnalytics | null;
  profitData: ProfitMarginAnalytics | null;
  isLoadingAnalytics: boolean;

  // Controls
  analyticsGranularity: "hourly" | "daily" | "weekly" | "monthly";
  setAnalyticsGranularity: (g: "hourly" | "daily" | "weekly" | "monthly") => void;
  analyticsDatePreset: "7d" | "30d" | "this_month" | "custom";
  setAnalyticsDatePreset: (p: "7d" | "30d" | "this_month" | "custom") => void;
  customFromDate: string;
  setCustomFromDate: (d: string) => void;
  customToDate: string;
  setCustomToDate: (d: string) => void;
  drilldownBucket: string | null;
  setDrilldownBucket: (b: string | null) => void;
  topItemsSortBy: "quantity" | "revenue";
  setTopItemsSortBy: (s: "quantity" | "revenue") => void;

  // Actions
  loadAnalyticsData: () => Promise<void>;
};

export function AnalyticsTab({
  restaurant,
  kpiData,
  revenueData,
  peakHoursData,
  topItemsData,
  funnelData,
  profitData,
  isLoadingAnalytics,
  analyticsGranularity,
  setAnalyticsGranularity,
  analyticsDatePreset,
  setAnalyticsDatePreset,
  customFromDate,
  setCustomFromDate,
  customToDate,
  setCustomToDate,
  drilldownBucket,
  setDrilldownBucket,
  topItemsSortBy,
  setTopItemsSortBy,
  loadAnalyticsData,
}: AnalyticsTabProps) {
  const [topItemsViewMode, setTopItemsViewMode] = useState<"list" | "chart">("list");
  const [hoveredRevenuePoint, setHoveredRevenuePoint] = useState<{ bucket: string; revenue: number; orders: number } | null>(null);

  return (
    <div className="space-y-6">
      {/* Header & Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-[var(--accent-brand)]" />
            Sales &amp; Executive Analytics
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Outlet revenue trends, COGS margin tracking, peak service hours, and order funnel conversion
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Range Presets */}
          <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] p-1 text-xs font-bold">
            {(["7d", "30d", "this_month", "custom"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setDrilldownBucket(null);
                  setAnalyticsDatePreset(p);
                }}
                className={`rounded-lg px-2.5 py-1 transition ${analyticsDatePreset === p
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
              >
                {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : p === "this_month" ? "This Month" : "Custom"}
              </button>
            ))}
          </div>

          {/* Granularity Selector */}
          <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] p-1 text-xs font-bold">
            {(["hourly", "daily", "weekly", "monthly"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setAnalyticsGranularity(g)}
                className={`rounded-lg px-2 py-1 transition uppercase ${analyticsGranularity === g
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
              >
                {g[0].toUpperCase() + g.slice(1, 3)}
              </button>
            ))}
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-1.5">
            <a
              href={`${getApiBaseUrl()}/api/analytics/export?report=revenue&format=csv`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold hover:border-[var(--accent-brand)] transition"
            >
              <Download className="h-3.5 w-3.5" />
              CSV Export
            </a>
            <button
              type="button"
              onClick={() => {
                if (!kpiData || !topItemsData || !funnelData || !restaurant) return;
                generateAnalyticsPdfReport(
                  restaurant.name,
                  analyticsDatePreset === "7d" ? "Past 7 Days" : analyticsDatePreset === "30d" ? "Past 30 Days" : "Selected Date Range",
                  kpiData,
                  topItemsData.items,
                  funnelData.stages
                );
              }}
              disabled={!kpiData}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5" />
              PDF Report
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date Picker Bar */}
      {analyticsDatePreset === "custom" && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs">
          <Calendar className="h-4 w-4 text-[var(--accent-brand)]" />
          <span className="font-bold">Custom Range:</span>
          <input type="date" value={customFromDate} onChange={(e) => setCustomFromDate(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1" />
          <span>to</span>
          <input type="date" value={customToDate} onChange={(e) => setCustomToDate(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1" />
          <button type="button" onClick={() => void loadAnalyticsData()} className="rounded-lg bg-[var(--accent-brand)] px-3 py-1 text-xs font-bold text-white">Apply Filter</button>
        </div>
      )}

      {/* Active Drill-down Filter Pill */}
      {drilldownBucket && (
        <div className="flex items-center justify-between rounded-2xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 p-3 text-xs">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[var(--accent-brand)]" />
            <span>Filtered to single time bucket: <strong>{drilldownBucket}</strong></span>
          </div>
          <button type="button" onClick={() => { setDrilldownBucket(null); void loadAnalyticsData(); }} className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-brand)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-brand-hover)]">
            <FilterX className="h-3.5 w-3.5" />
            Clear Drill-down Filter
          </button>
        </div>
      )}

      {/* Skeleton Loading State */}
      {isLoadingAnalytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]" />
          ))}
        </div>
      )}

      {/* 1. TOP KPI SUMMARY STRIP */}
      {!isLoadingAnalytics && kpiData && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider"><span>Total Revenue</span><DollarSign className="h-4 w-4 text-[var(--accent-brand)]" /></div>
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-black text-[var(--text-primary)]">₹{kpiData.total_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.revenue_change_pct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                {kpiData.revenue_change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {kpiData.revenue_change_pct >= 0 ? "+" : ""}{kpiData.revenue_change_pct}%
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">vs. previous equivalent period</p>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider"><span>Total Orders</span><ShoppingBag className="h-4 w-4 text-sky-500" /></div>
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-black text-[var(--text-primary)]">{kpiData.total_orders}</p>
              <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.orders_change_pct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                {kpiData.orders_change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {kpiData.orders_change_pct >= 0 ? "+" : ""}{kpiData.orders_change_pct}%
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">vs. previous period ({kpiData.prev_total_orders} orders)</p>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider"><span>Avg Order Value</span><Activity className="h-4 w-4 text-amber-500" /></div>
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-black text-[var(--text-primary)]">₹{kpiData.avg_order_value.toFixed(2)}</p>
              <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.aov_change_pct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                {kpiData.aov_change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {kpiData.aov_change_pct >= 0 ? "+" : ""}{kpiData.aov_change_pct}%
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">vs. prev AOV (₹{kpiData.prev_avg_order_value.toFixed(2)})</p>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]"><span>Profit Margin</span><Percent className="h-4 w-4" /></div>
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-black text-[var(--text-primary)]">{kpiData.profit_margin_pct.toFixed(1)}%</p>
              <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.margin_change_pct >= 0 ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "bg-rose-500/15 text-rose-600"}`}>
                {kpiData.margin_change_pct >= 0 ? "+" : ""}{kpiData.margin_change_pct}%
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)]">Net: ₹{kpiData.net_profit.toFixed(0)} | COGS: ₹{kpiData.cogs.toFixed(0)}</p>
          </div>
        </div>
      )}

      {/* 2. REVENUE OVERVIEW & DRILL-DOWN CHART */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[var(--accent-brand)]" />
              Revenue &amp; Order Volume Trend
            </h2>
            <p className="text-xs text-[var(--text-muted)]">Interactive bar chart — click any bar to filter entire dashboard to that date</p>
          </div>
          {hoveredRevenuePoint && (
            <div className="rounded-xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 px-3 py-1.5 text-xs font-bold text-[var(--accent-brand)]">
              {hoveredRevenuePoint.bucket}: ₹{hoveredRevenuePoint.revenue.toFixed(2)} ({hoveredRevenuePoint.orders} orders)
            </div>
          )}
        </div>

        {!revenueData || revenueData.buckets.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--text-muted)]">No sales orders recorded in this date range.</div>
        ) : (
          <div className="space-y-2">
            <div className="h-56 flex items-end gap-2 overflow-x-auto pb-4 pt-8 px-2">
              {(() => {
                const maxRev = Math.max(...revenueData.buckets.map((b) => b.revenue), 1);
                return revenueData.buckets.map((b) => {
                  const pct = Math.max(8, Math.round((b.revenue / maxRev) * 100));
                  const isDrilled = drilldownBucket === b.bucket;
                  return (
                    <div key={b.bucket} onClick={() => { setDrilldownBucket(b.bucket); void loadAnalyticsData(); }} onMouseEnter={() => setHoveredRevenuePoint({ bucket: b.bucket, revenue: b.revenue, orders: b.orders_count })} onMouseLeave={() => setHoveredRevenuePoint(null)} className="group relative flex-1 min-w-[32px] flex flex-col items-center justify-end cursor-pointer">
                      <div className="absolute -top-10 hidden group-hover:flex flex-col items-center z-20 whitespace-nowrap">
                        <div className="rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-2 py-1 text-[10px] font-bold shadow-md">₹{b.revenue.toFixed(0)} ({b.orders_count} orders)</div>
                      </div>
                      <div style={{ height: `${pct}%` }} className={`w-full rounded-t-lg transition-all duration-200 ${isDrilled ? "bg-emerald-500 shadow-md ring-2 ring-emerald-400" : "bg-[var(--accent-brand)] group-hover:bg-[var(--accent-brand-hover)]"}`} />
                      <span className="mt-2 text-[10px] font-mono text-[var(--text-muted)] truncate max-w-[48px]">{b.bucket.split(" ")[0].slice(-5)}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </article>

      {/* 3. TWO-COLUMN GRID: TOP ITEMS & ORDER FUNNEL */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* TOP SELLING DISHES */}
        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2"><Flame className="h-5 w-5 text-amber-500" /><h2 className="font-display text-lg font-bold">Top Performing Products</h2></div>
            <div className="flex items-center gap-1 text-xs">
              <button type="button" onClick={() => setTopItemsSortBy(topItemsSortBy === "revenue" ? "quantity" : "revenue")} className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 font-bold text-[var(--text-secondary)] hover:border-[var(--accent-brand)]">Sort: {topItemsSortBy === "revenue" ? "By Revenue" : "By Qty"}</button>
              <button type="button" onClick={() => setTopItemsViewMode(topItemsViewMode === "list" ? "chart" : "list")} className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)]" title={topItemsViewMode === "list" ? "Switch to Donut View" : "Switch to List View"}>
                {topItemsViewMode === "list" ? <PieChart className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {!topItemsData || topItemsData.items.length === 0 ? (
            <p className="p-8 text-center text-xs text-[var(--text-muted)]">No item sales recorded in range.</p>
          ) : topItemsViewMode === "list" ? (
            <div className="space-y-3">
              {topItemsData.items.map((item, idx) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs"><span className="font-bold truncate text-[var(--text-primary)]">#{idx + 1} {item.name}</span><span className="font-mono text-[var(--accent-brand)] font-bold">₹{item.revenue.toFixed(2)} ({item.quantity_sold} sold)</span></div>
                  <div className="h-2 w-full rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden"><div style={{ width: `${Math.min(100, Math.max(5, item.revenue_share_pct))}%` }} className="h-full rounded-full bg-[var(--accent-brand)]" /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 flex flex-col items-center justify-center space-y-3">
              <PieChart className="h-16 w-16 text-[var(--accent-brand)] opacity-60" />
              <p className="text-xs text-[var(--text-muted)] text-center">Top dish revenue share distribution across <strong>{topItemsData.items.length}</strong> Products.</p>
            </div>
          )}
        </article>

        {/* ORDER FUNNEL & STATUS MIX */}
        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-sky-500" /><h2 className="font-display text-lg font-bold">Order Conversion &amp; Funnel</h2></div>
            {funnelData && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-600">Conversion: {funnelData.conversion_rate_pct}%</span>}
          </div>
          {!funnelData ? (
            <p className="p-8 text-center text-xs text-[var(--text-muted)]">No order data available.</p>
          ) : (
            <div className="space-y-4">
              {funnelData.stages.map((stg) => (
                <div key={stg.stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs"><span className="font-bold text-[var(--text-primary)]">{stg.stage_label}</span><span className="font-mono text-[var(--text-secondary)] font-bold">{stg.count} orders ({stg.percentage}%)</span></div>
                  <div className="h-3.5 w-full rounded-xl bg-[var(--bg-surface-elevated)] overflow-hidden">
                    <div style={{ width: `${Math.max(4, stg.percentage)}%` }} className={`h-full rounded-xl transition-all ${stg.stage === "CANCELLED" ? "bg-rose-500" : stg.stage === "SERVED" ? "bg-emerald-500" : stg.stage === "PAID" ? "bg-[var(--accent-brand)]" : "bg-amber-500"}`} />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Total Volume: <strong>{funnelData.total_orders}</strong></span>
                <span className="text-rose-600 font-bold">Cancellation Rate: {funnelData.cancellation_rate_pct}%</span>
              </div>
            </div>
          )}
        </article>
      </div>

      {/* 4. PEAK HOURS SERVICE HEATMAP */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /><h2 className="font-display text-lg font-bold">Peak Service Hours (24-Hour Distribution)</h2></div>
          <span className="text-xs text-[var(--text-muted)]">Order volume by hour-of-day</span>
        </div>
        {!peakHoursData ? (
          <p className="p-8 text-center text-xs text-[var(--text-muted)]">No peak hours data.</p>
        ) : (
          <div className="h-36 flex items-end gap-1 overflow-x-auto pb-4 pt-6 px-2">
            {(() => {
              const maxCnt = Math.max(...peakHoursData.buckets.map((b) => b.orders_count), 1);
              return peakHoursData.buckets.map((b) => {
                const pct = Math.max(10, Math.round((b.orders_count / maxCnt) * 100));
                return (
                  <div key={b.hour} className="group relative flex-1 min-w-[20px] flex flex-col items-center justify-end">
                    <div className="absolute -top-7 hidden group-hover:flex flex-col items-center z-20">
                      <div className="rounded-md bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-bold">{b.hour_label}: {b.orders_count} orders</div>
                    </div>
                    <div style={{ height: `${pct}%` }} className={`w-full rounded-t-md transition-all ${b.orders_count > maxCnt * 0.7 ? "bg-amber-500" : "bg-[var(--accent-brand)]/70"}`} />
                    <span className="mt-1 text-[9px] font-mono text-[var(--text-muted)]">{b.hour}h</span>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </article>

      {/* 5. PROFIT MARGIN & COGS ANALYSIS */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2"><Percent className="h-5 w-5 text-[var(--accent-brand)]" />Profit Margin &amp; Cost of Goods Sold (COGS)</h2>
            <p className="text-xs text-[var(--text-muted)]">Calculated using ingredient <code>unit_cost_snapshot</code> at the exact moment of stock deduction</p>
          </div>
          {profitData && <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]">Overall Margin: {profitData.overall_margin_pct}%</div>}
        </div>
        {!profitData || profitData.buckets.length === 0 ? (
          <p className="p-8 text-center text-xs text-[var(--text-muted)]">No profit margin data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="p-3">Time Bucket</th><th className="p-3 text-right">Revenue (INR)</th><th className="p-3 text-right">COGS (INR)</th><th className="p-3 text-right">Net Profit (INR)</th><th className="p-3 text-center">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs font-mono">
                {profitData.buckets.map((b) => (
                  <tr key={b.bucket} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                    <td className="p-3 font-bold font-sans text-[var(--text-primary)]">{b.bucket}</td>
                    <td className="p-3 text-right text-[var(--text-primary)]">₹{b.revenue.toFixed(2)}</td>
                    <td className="p-3 text-right text-rose-500">₹{b.cogs.toFixed(2)}</td>
                    <td className="p-3 text-right text-emerald-600 font-bold">₹{b.profit.toFixed(2)}</td>
                    <td className="p-3 text-center"><span className="inline-block rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">{b.margin_pct}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}
