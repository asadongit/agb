import React, { useMemo, useState } from "react";
import { 
  IndianRupee, 
  Package, 
  TrendingUp, 
  Percent, 
  Search, 
  ArrowUpDown, 
  Tag, 
  ShoppingBag,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import type { ItemSalesResponse, ItemSalesRow } from "@/types";

type SortField = "revenue" | "profit" | "margin" | "qty" | "name";
type SortDirection = "asc" | "desc";

export function ItemSalesReport({ data }: { data: ItemSalesResponse | null }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const totalRevenue = useMemo(() => {
    if (data?.total_revenue !== undefined && data.total_revenue > 0) return data.total_revenue;
    return (data?.items || []).reduce((acc, it) => acc + (it.revenue || 0), 0);
  }, [data]);

  const totalCogs = useMemo(() => {
    if (data?.total_cogs !== undefined && data.total_cogs > 0) return data.total_cogs;
    return (data?.items || []).reduce((acc, it) => acc + (it.cogs || 0), 0);
  }, [data]);

  const totalProfit = useMemo(() => {
    if (data?.total_profit !== undefined) return data.total_profit;
    return totalRevenue - totalCogs;
  }, [data, totalRevenue, totalCogs]);

  const overallMargin = useMemo(() => {
    if (data?.overall_margin_pct !== undefined) return data.overall_margin_pct;
    return totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  }, [data, totalProfit, totalRevenue]);

  const totalUnitsSold = useMemo(() => {
    return (data?.items || []).reduce((acc, it) => acc + (it.quantity_sold || 0), 0);
  }, [data]);

  const filteredAndSortedItems = useMemo(() => {
    if (!data?.items) return [];

    let filtered = data.items.filter((it) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = it.item_name.toLowerCase().includes(q);
      const matchCategory = it.category_name?.toLowerCase().includes(q);
      return matchName || matchCategory;
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === "revenue") {
        comparison = (a.revenue || 0) - (b.revenue || 0);
      } else if (sortField === "profit") {
        comparison = (a.estimated_profit || 0) - (b.estimated_profit || 0);
      } else if (sortField === "margin") {
        comparison = (a.margin_pct || 0) - (b.margin_pct || 0);
      } else if (sortField === "qty") {
        comparison = (a.quantity_sold || 0) - (b.quantity_sold || 0);
      } else if (sortField === "name") {
        comparison = a.item_name.localeCompare(b.item_name);
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, searchQuery, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (!data || !data.items || data.items.length === 0) {
    return (
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--text-muted)] mb-3">
          <ShoppingBag className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold">No Item Sales Recorded</h3>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
          No settled sales found for this date range or filter selection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Revenue Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Total Revenue</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-black tracking-tight">
              ₹{totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {data.items.length} items
            </span>
          </div>
        </div>

        {/* COGS Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Total COGS</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400">
              ₹{totalCogs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {totalUnitsSold.toLocaleString("en-IN", { maximumFractionDigits: 2 })} units
            </span>
          </div>
        </div>

        {/* Gross Profit Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Gross Profit</span>
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              totalProfit >= 0
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
            }`}>
              {totalProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className={`text-2xl font-black tracking-tight ${
              totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}>
              ₹{totalProfit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {totalProfit >= 0 ? "Gain" : "Loss"}
            </span>
          </div>
        </div>

        {/* Profit Margin Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Overall Margin</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-black tracking-tight">
              {overallMargin.toFixed(1)}%
            </p>
            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
              overallMargin >= 25
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                : overallMargin >= 10
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
            }`}>
              {overallMargin >= 25 ? "Healthy" : overallMargin >= 10 ? "Moderate" : "Low"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search items or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/50 py-2 pl-9 pr-4 text-xs focus:border-[var(--primary)] focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="font-semibold">
              Showing {filteredAndSortedItems.length} of {data.items.length} items
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="font-bold text-[var(--primary)] hover:underline ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th
                  onClick={() => toggleSort("name")}
                  className="cursor-pointer py-3.5 pl-5 pr-3 transition-colors hover:text-[var(--text-main)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Item & Category</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("qty")}
                  className="cursor-pointer py-3.5 px-3 text-right transition-colors hover:text-[var(--text-main)]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Qty Sold</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("revenue")}
                  className="cursor-pointer py-3.5 px-3 text-right transition-colors hover:text-[var(--text-main)]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Revenue</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3.5 px-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>COGS (Total / Unit)</span>
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("profit")}
                  className="cursor-pointer py-3.5 px-3 text-right transition-colors hover:text-[var(--text-main)]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Profit</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("margin")}
                  className="cursor-pointer py-3.5 pl-3 pr-5 text-right transition-colors hover:text-[var(--text-main)]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Margin %</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredAndSortedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-[var(--text-muted)]">
                    No items match &quot;{searchQuery}&quot;.
                  </td>
                </tr>
              ) : (
                filteredAndSortedItems.map((it, idx) => {
                  const itemCogs = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
                  const itemProfit = it.estimated_profit !== null && it.estimated_profit !== undefined
                    ? it.estimated_profit
                    : it.revenue - itemCogs;
                  const itemMargin = it.margin_pct !== null && it.margin_pct !== undefined
                    ? it.margin_pct
                    : (it.revenue > 0 ? (itemProfit / it.revenue) * 100 : 0);
                  const unitCost = it.cost_per_unit !== null && it.cost_per_unit !== undefined
                    ? it.cost_per_unit
                    : (it.quantity_sold > 0 ? itemCogs / it.quantity_sold : 0);

                  const isProfitable = itemProfit >= 0;

                  return (
                    <tr
                      key={it.menu_item_id || `${it.item_name}-${idx}`}
                      className="group transition-colors hover:bg-[var(--bg-muted)]/30"
                    >
                      {/* Item & Category */}
                      <td className="py-3 pl-5 pr-3">
                        <div className="font-semibold text-[var(--text-main)] leading-tight">
                          {it.item_name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {it.category_name ? (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-muted)] text-[var(--text-muted)]">
                              <Tag className="h-2.5 w-2.5" />
                              {it.category_name}
                            </span>
                          ) : null}
                          {it.revenue_share_pct > 0 && (
                            <span className="text-[10px] text-[var(--text-muted)] font-medium">
                              ({it.revenue_share_pct.toFixed(1)}% rev)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Qty Sold */}
                      <td className="py-3 px-3 text-right font-medium">
                        {it.quantity_sold % 1 === 0 ? it.quantity_sold : it.quantity_sold.toFixed(2)}
                      </td>

                      {/* Revenue */}
                      <td className="py-3 px-3 text-right font-bold text-[var(--text-main)]">
                        ₹{it.revenue.toFixed(2)}
                      </td>

                      {/* COGS */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-semibold text-rose-600 dark:text-rose-400">
                          ₹{itemCogs.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          ₹{unitCost.toFixed(2)}/u
                        </div>
                      </td>

                      {/* Profit */}
                      <td className="py-3 px-3 text-right">
                        <span className={`font-bold ${isProfitable ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          ₹{itemProfit.toFixed(2)}
                        </span>
                      </td>

                      {/* Margin % */}
                      <td className="py-3 pl-3 pr-5 text-right">
                        <span className={`inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-bold border ${
                          itemMargin >= 30
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : itemMargin >= 15
                            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
                            : itemMargin >= 0
                            ? "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}>
                          {itemMargin.toFixed(1)}%
                        </span>
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
