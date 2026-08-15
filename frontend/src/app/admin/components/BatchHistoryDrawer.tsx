"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Package,
  Layers,
  Calendar,
  Building2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  RotateCcw,
} from "lucide-react";
import type { BatchDetail, InventoryItem } from "@/types";

interface BatchHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  fetchBatches: (itemId?: string) => Promise<BatchDetail[]>;
  onLogWastageClick: (item: InventoryItem) => void;
  onAddStockClick: (item: InventoryItem) => void;
  onAdjustBatchClick?: (batch: BatchDetail) => void;
}

export function BatchHistoryDrawer({
  isOpen,
  onClose,
  item,
  fetchBatches,
  onLogWastageClick,
  onAddStockClick,
  onAdjustBatchClick,
}: BatchHistoryDrawerProps) {
  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setIsLoading(true);
      fetchBatches(item.id)
        .then((data) => setBatches(data || []))
        .catch((err) => console.error("Error loading batches for item:", err))
        .finally(() => setIsLoading(false));
    } else {
      setBatches([]);
    }
  }, [isOpen, item, fetchBatches]);

  if (!isOpen || !item) return null;

  const getStatusBadge = (status: BatchDetail["status"]) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Active
          </span>
        );
      case "EXPIRING_SOON":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" /> Expiring Soon
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-500/20">
            <XCircle className="h-3 w-3" /> Expired
          </span>
        );
      case "DEPLETED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)] border border-[var(--border-subtle)]">
            Depleted
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-6">
        <div className="w-screen max-w-4xl border-l border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5 bg-[var(--bg-surface)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 shadow-xs">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {item.name} — Batch History
                </h2>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                  <span className="font-mono bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                    {item.barcode || "No Barcode"}
                  </span>
                  <span>•</span>
                  <span>Category: {item.category}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Summary Bar */}
          <div className="grid grid-cols-4 gap-3 p-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-xs">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Total Current Stock</p>
              <p className="text-sm font-bold text-emerald-500 mt-0.5">
                {Number(item.current_stock).toFixed(2)} {item.unit}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Cost / Unit</p>
              <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                ₹{Number(item.cost_per_unit).toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">MRP</p>
              <p className="text-sm font-bold text-purple-400 mt-0.5">
                {item.mrp ? `₹${Number(item.mrp).toFixed(2)}` : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Tax Rate</p>
              <p className="text-sm font-bold text-amber-500 mt-0.5">
                {item.tax_category || "GST 0%"} ({item.tax_rate ? `${item.tax_rate}%` : "0%"})
              </p>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Arrival Batches ({batches.length})
            </h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogWastageClick(item);
                }}
                className="flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-500 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Log Wastage</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddStockClick(item);
                }}
                className="flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add New Batch</span>
              </button>
            </div>
          </div>

          {/* Batches Table Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--text-muted)]">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-2" />
                <span>Loading arrival batches...</span>
              </div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-2xl">
                <Package className="h-8 w-8 text-[var(--text-muted)] mb-2" />
                <p className="font-semibold text-[var(--text-primary)]">No Batches Found</p>
                <p className="mt-1">Add inward stock to record the first batch arrival for this item.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] font-semibold text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2.5">Batch # / Date</th>
                      <th className="px-3 py-2.5">Supplier</th>
                      <th className="px-3 py-2.5 text-right">Initial Gross Qty</th>
                      <th className="px-3 py-2.5 text-right">Sorted Usable Qty</th>
                      <th className="px-3 py-2.5 text-right">Remaining Qty</th>
                      <th className="px-3 py-2.5 text-right">Unit Cost</th>
                      <th className="px-3 py-2.5">Expiry Date</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                        <td className="px-3 py-3">
                          <p className="font-mono font-bold text-xs text-[var(--text-primary)]">{b.batch_number}</p>
                          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {new Date(b.intake_date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </td>

                        <td className="px-3 py-3 font-medium">
                          {b.supplier_name ? (
                            <span className="inline-flex items-center gap-1 text-[var(--text-primary)]">
                              <Building2 className="h-3 w-3 text-purple-400" />
                              {b.supplier_name}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-medium text-[var(--text-secondary)]">
                          {Number(b.initial_quantity ?? b.quantity).toFixed(2)} {b.unit}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-cyan-400">
                          {Number(b.quantity).toFixed(2)} {b.unit}
                        </td>

                        <td className="px-3 py-3 text-right font-bold text-emerald-500">
                          {Number(b.remaining_quantity).toFixed(2)} {b.unit}
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-semibold">
                          ₹{Number(b.unit_cost).toFixed(2)}
                        </td>

                        <td className="px-3 py-3">
                          {b.expiry_date ? (
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                              {new Date(b.expiry_date).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-center">
                          {getStatusBadge(b.status)}
                        </td>

                        <td className="px-3 py-3 text-right">
                          {onAdjustBatchClick && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onAdjustBatchClick(b);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                              title="Adjust stock, return to supplier, or void batch"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Adjust
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
