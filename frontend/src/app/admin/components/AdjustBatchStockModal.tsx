"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  RotateCcw,
  PackageX,
  Trash2,
  Building2,
  FileText,
  CheckCircle2,
} from "lucide-react";
import type { BatchDetail, Supplier } from "@/types";

interface AdjustBatchStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: BatchDetail | null;
  suppliers?: Supplier[];
  onSuccess: (data: {
    batch_id: string;
    adjustment_type: string;
    return_id?: string | null;
    return_number?: string | null;
  }) => void;
  authToken?: string;
}

export function AdjustBatchStockModal({
  isOpen,
  onClose,
  batch,
  suppliers = [],
  onSuccess,
  authToken,
}: AdjustBatchStockModalProps) {
  const [mode, setMode] = useState<"PURCHASE_RETURN" | "MANUAL_ADJUSTMENT" | "VOID_BATCH">("PURCHASE_RETURN");
  const [returnRateMode, setReturnRateMode] = useState<"PURCHASE_COST" | "SORTED_COST">("PURCHASE_COST");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("DEFECTIVE");
  const [supplierName, setSupplierName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (batch) {
      setQuantity(String(batch.remaining_quantity || "0"));
      setSupplierName(batch.supplier_name || (suppliers[0]?.name ?? ""));
      setError(null);
    }
  }, [batch, suppliers]);

  if (!isOpen || !batch) return null;

  const remainingQty = parseFloat(String(batch.remaining_quantity || 0));
  const sortedQty = parseFloat(String(batch.quantity || 0));
  const initialQty = parseFloat(String(batch.initial_quantity || sortedQty || 0));
  const sortedUnitCost = parseFloat(String(batch.unit_cost || 0));

  const rawPurchaseUnitCost =
    (batch as any).purchase_unit_cost !== undefined && (batch as any).purchase_unit_cost !== null
      ? parseFloat(String((batch as any).purchase_unit_cost))
      : initialQty > 0
        ? (sortedUnitCost * sortedQty) / initialQty
        : sortedUnitCost;

  const purchaseUnitCost = Math.round(rawPurchaseUnitCost * 100) / 100;
  const sortedUnitCostRounded = Math.round(sortedUnitCost * 100) / 100;

  const activeReturnRate = returnRateMode === "PURCHASE_COST" ? purchaseUnitCost : sortedUnitCostRounded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (remainingQty <= 0) {
      setError("This batch lot is already depleted (0 remaining stock). No further adjustments or returns can be processed.");
      return;
    }

    const qtyNum = parseFloat(quantity);
    if (mode !== "VOID_BATCH") {
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setError("Please enter a valid quantity greater than 0");
        return;
      }
      if (qtyNum > remainingQty) {
        setError(`Quantity cannot exceed remaining batch stock (${remainingQty} ${batch.unit})`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token =
        authToken ||
        (typeof window !== "undefined"
          ? localStorage.getItem("admin_access_token") ||
            localStorage.getItem("admin_token") ||
            localStorage.getItem("token")
          : "");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const bodyData = {
        adjustment_type: mode,
        quantity: mode === "VOID_BATCH" ? remainingQty : qtyNum,
        reason: mode === "VOID_BATCH" ? "VOIDED_BY_ADMIN" : reason,
        supplier_name: supplierName || undefined,
        return_rate: mode === "PURCHASE_RETURN" ? activeReturnRate : undefined,
        notes: notes || undefined,
      };

      const res = await fetch(`${apiBase}/api/admin/inventory/batches/${batch.id}/adjust`, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to process stock adjustment");
      }

      const resData = await res.json();
      onSuccess({
        batch_id: batch.id,
        adjustment_type: mode,
        return_id: resData.return_id,
        return_number: resData.return_number,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to process stock adjustment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Adjust / Return Batch Stock
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-mono">
                Batch #{batch.batch_number} • {batch.item_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Batch Info Badge */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">Remaining Stock</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {remainingQty.toFixed(2)} {batch.unit}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">Purchase Unit Cost</span>
              <span className="font-mono font-bold text-emerald-300 text-sm">
                ₹{purchaseUnitCost.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">Sorted Unit Cost</span>
              <span className="font-mono font-bold text-[var(--text-primary)] text-sm">
                ₹{sortedUnitCost.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Mode Selection */}
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Select Adjustment Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode("PURCHASE_RETURN")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition text-center gap-1.5 ${
                  mode === "PURCHASE_RETURN"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <RotateCcw className="h-4 w-4" />
                <span className="text-[11px]">Return to Supplier</span>
                <span className="text-[9px] opacity-75 font-normal">Issue Return Bill</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("MANUAL_ADJUSTMENT")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition text-center gap-1.5 ${
                  mode === "MANUAL_ADJUSTMENT"
                    ? "border-amber-500 bg-amber-500/10 text-amber-400 font-bold"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <PackageX className="h-4 w-4" />
                <span className="text-[11px]">Audit / Damage</span>
                <span className="text-[9px] opacity-75 font-normal">Loss / Stock Audit</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("VOID_BATCH")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition text-center gap-1.5 ${
                  mode === "VOID_BATCH"
                    ? "border-rose-500 bg-rose-500/10 text-rose-400 font-bold"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-[11px]">Void Batch</span>
                <span className="text-[9px] opacity-75 font-normal">Zero out batch</span>
              </button>
            </div>
          </div>

          {/* Inputs for Return to Supplier */}
          {mode === "PURCHASE_RETURN" && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Supplier Name (For Debit Note)
                </label>
                {suppliers.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-hidden"
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name} {s.phone ? `(${s.phone})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Enter supplier / vendor name"
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-hidden"
                    required
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                    Return Quantity ({batch.unit})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingQty}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] font-mono focus:border-emerald-500 focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                    Reason for Return
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="DEFECTIVE">Defective / Damaged</option>
                    <option value="EXPIRED">Expired Stock</option>
                    <option value="EXCESS_STOCK">Excess Supply</option>
                    <option value="WRONG_ITEM">Incorrect Specification</option>
                    <option value="OTHER">Other Reason</option>
                  </select>
                </div>
              </div>

              {/* Debit Note Rate Selection */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[var(--text-primary)]">
                  Debit Note Return Rate Calculation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnRateMode("PURCHASE_COST")}
                    className={`p-2.5 rounded-xl border text-left text-[11px] transition ${
                      returnRateMode === "PURCHASE_COST"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-bold shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="block font-bold">Purchase Billed Rate</span>
                    <span className="font-mono text-xs text-emerald-400">₹{purchaseUnitCost.toFixed(2)} / {batch.unit}</span>
                    <span className="block text-[9px] opacity-75 font-normal">Original invoice cost</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnRateMode("SORTED_COST")}
                    className={`p-2.5 rounded-xl border text-left text-[11px] transition ${
                      returnRateMode === "SORTED_COST"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-bold shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="block font-bold">Sorted Usable Rate</span>
                    <span className="font-mono text-xs text-emerald-400">₹{sortedUnitCost.toFixed(2)} / {batch.unit}</span>
                    <span className="block text-[9px] opacity-75 font-normal">Effective post-sorting cost</span>
                  </button>
                </div>
              </div>

              {/* Total Refund Estimate */}
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-300 font-medium block">Estimated Return Value:</span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {(parseFloat(quantity) || 0).toFixed(2)} {batch.unit} × ₹{activeReturnRate.toFixed(2)}
                  </span>
                </div>
                <span className="font-mono font-black text-emerald-400 text-base">
                  ₹{((parseFloat(quantity) || 0) * activeReturnRate).toFixed(2)}
                </span>
              </div>
            </>
          )}

          {/* Inputs for Audit Adjustment */}
          {mode === "MANUAL_ADJUSTMENT" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Adjust / Deduct Quantity ({batch.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remainingQty}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] font-mono focus:border-amber-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Adjustment Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-hidden"
                >
                  <option value="AUDIT_CORRECTION">Inventory Audit Mismatch</option>
                  <option value="SPOILED_EXPIRED">Spoilage / Expiry Loss</option>
                  <option value="DAMAGED_TRANSIT">Transit Damage</option>
                  <option value="THEFT_LOST">Theft / Loss</option>
                </select>
              </div>
            </div>
          )}

          {/* Void Batch Prompt */}
          {mode === "VOID_BATCH" && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                <span>Confirm Void Batch Entry</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This will set the remaining stock for Batch #{batch.batch_number} to <strong className="font-mono text-white">0.00 {batch.unit}</strong> and subtract <strong className="font-mono text-white">{remainingQty} {batch.unit}</strong> from your total item stock. The batch will be preserved in audit logs as VOIDED.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
              Notes / Remarks
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add optional internal details..."
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-hidden"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || remainingQty <= 0}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === "PURCHASE_RETURN"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : mode === "MANUAL_ADJUSTMENT"
                  ? "bg-amber-600 hover:bg-amber-500"
                  : "bg-rose-600 hover:bg-rose-500"
              }`}
            >
              {isSubmitting ? (
                "Processing..."
              ) : remainingQty <= 0 ? (
                "Batch Depleted"
              ) : mode === "PURCHASE_RETURN" ? (
                <>
                  <FileText className="h-4 w-4" />
                  Process Return & Issue Bill
                </>
              ) : mode === "MANUAL_ADJUSTMENT" ? (
                "Save Adjustment"
              ) : (
                "Void Batch Now"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
