"use client";

import React from "react";
import { Award, BarChart3, Layers, ShoppingBag, X } from "lucide-react";

export type CustomerAnalytics = {
  customer_name: string;
  customer_phone: string;
  period: string;
  total_volume: number;
  total_orders: number;
  best_categories: { category_name: string; total_quantity: number; total_amount: number }[];
  best_items: { item_name: string; total_quantity: number; total_amount: number }[];
};

type CustomerInsightsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  analytics: CustomerAnalytics | null;
};

export function CustomerInsightsModal({
  isOpen,
  onClose,
  analytics,
}: CustomerInsightsModalProps) {
  if (!isOpen || !analytics) return null;

  const maxCatAmount = Math.max(...analytics.best_categories.map((c) => c.total_amount), 1);
  const maxItemQty = Math.max(...analytics.best_items.map((i) => i.total_quantity), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Customer Purchasing Insights &amp; Interest Profile
              </h3>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                {analytics.customer_name} • {analytics.customer_phone}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-sky-300">Total Purchase Volume</span>
              <p className="font-mono text-2xl font-black text-sky-400">
                ₹{analytics.total_volume.toFixed(2)}
              </p>
              <span className="text-[10px] text-[var(--text-muted)] font-semibold">Across all completed bills</span>
            </div>

            <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Total Orders Placed</span>
              <p className="font-mono text-2xl font-black text-[var(--accent-brand)]">
                {analytics.total_orders} Orders
              </p>
              <span className="text-[10px] text-[var(--text-muted)] font-semibold">In selected timeframe ({analytics.period})</span>
            </div>
          </div>

          {/* Best Category Interest */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-[var(--text-primary)]">
              <Layers className="h-4 w-4 text-sky-400" />
              <h4 className="font-bold text-sm">Best Category Interest (Top Categories)</h4>
            </div>

            {analytics.best_categories.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic py-2">No category purchase data available yet.</p>
            ) : (
              <div className="space-y-2.5">
                {analytics.best_categories.map((cat, idx) => {
                  const pct = Math.min(100, Math.round((cat.total_amount / maxCatAmount) * 100));
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[var(--text-primary)]">{cat.category_name}</span>
                        <span className="font-mono text-sky-400">₹{cat.total_amount.toFixed(2)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Best Item Interest */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-[var(--text-primary)]">
              <ShoppingBag className="h-4 w-4 text-cyan-400" />
              <h4 className="font-bold text-sm">Best Item Interest (Top Purchased Products)</h4>
            </div>

            {analytics.best_items.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic py-2">No item purchase data available yet.</p>
            ) : (
              <div className="space-y-2.5">
                {analytics.best_items.map((item, idx) => {
                  const pct = Math.min(100, Math.round((item.total_quantity / maxItemQty) * 100));
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[var(--text-primary)]">{item.item_name}</span>
                        <span className="font-mono text-cyan-400">
                          {item.total_quantity} qty • ₹{item.total_amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
