"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Edit,
  Clock,
  Calendar,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  FileText,
  HelpCircle,
  Tag,
} from "lucide-react";
import type { BatchDetail, Supplier } from "@/types";
import { parseUTCDate } from "@/lib/api";

interface EditBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: BatchDetail | null;
  suppliers?: Supplier[];
  onSave: (
    batchId: string,
    data: {
      batch_number?: string | null;
      expiry_date?: string | null;
      intake_date?: string | null;
      supplier_id?: string | null;
      notes?: string | null;
      shelf_life_alert_hrs?: number | null;
    }
  ) => Promise<any>;
}

// Convert UTC/ISO string to YYYY-MM-DDThh:mm for datetime-local input
function toLocalDateTimeString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

// Convert UTC/ISO string to YYYY-MM-DD for date input
function toLocalDateString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function EditBatchModal({
  isOpen,
  onClose,
  batch,
  suppliers = [],
  onSave,
}: EditBatchModalProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [intakeDateLocal, setIntakeDateLocal] = useState("");
  const [expiryDateLocal, setExpiryDateLocal] = useState("");
  const [shelfLifeHrs, setShelfLifeHrs] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (batch) {
      setBatchNumber(batch.batch_number || "");
      setIntakeDateLocal(toLocalDateTimeString(batch.intake_date));
      setExpiryDateLocal(toLocalDateString(batch.expiry_date));
      setShelfLifeHrs(
        batch.shelf_life_alert_hrs != null ? String(batch.shelf_life_alert_hrs) : ""
      );
      setSupplierId(batch.supplier_id || "");
      setNotes(batch.notes || "");
      setError(null);
    }
  }, [batch]);

  // Live Time-Reference Evaluation
  const timeDiagnostics = useMemo(() => {
    if (!intakeDateLocal) return null;
    const arrivalTime = new Date(intakeDateLocal).getTime();
    if (isNaN(arrivalTime)) return null;

    const now = Date.now();
    const elapsedHrs = (now - arrivalTime) / (3600 * 1000);
    const elapsedDays = Math.floor(elapsedHrs / 24);

    let effectiveExpiryTime: number | null = null;
    let expirySource: "CALENDAR" | "SHELF_LIFE" | "NONE" = "NONE";

    if (expiryDateLocal) {
      const expDate = new Date(`${expiryDateLocal}T23:59:59`);
      if (!isNaN(expDate.getTime())) {
        effectiveExpiryTime = expDate.getTime();
        expirySource = "CALENDAR";
      }
    } else if (shelfLifeHrs && !isNaN(parseFloat(shelfLifeHrs))) {
      const hrs = parseFloat(shelfLifeHrs);
      effectiveExpiryTime = arrivalTime + hrs * 3600 * 1000;
      expirySource = "SHELF_LIFE";
    }

    let isExpired = false;
    let isExpiringSoon = false;
    let remainingHrs = 0;

    if (effectiveExpiryTime != null) {
      remainingHrs = (effectiveExpiryTime - now) / (3600 * 1000);
      if (remainingHrs <= 0) {
        isExpired = true;
      } else if (remainingHrs <= 7 * 24) {
        isExpiringSoon = true;
      }
    }

    return {
      arrivalTime,
      elapsedHrs: Math.max(0, Math.round(elapsedHrs * 10) / 10),
      elapsedDays,
      effectiveExpiryTime,
      expirySource,
      isExpired,
      isExpiringSoon,
      remainingDays: Math.ceil(remainingHrs / 24),
    };
  }, [intakeDateLocal, expiryDateLocal, shelfLifeHrs]);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!batchNumber.trim()) {
      setError("Batch / Lot number cannot be empty.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: {
        batch_number: string;
        intake_date?: string;
        expiry_date?: string | null;
        supplier_id?: string | null;
        notes?: string | null;
        shelf_life_alert_hrs?: number | null;
      } = {
        batch_number: batchNumber.trim(),
        notes: notes.trim() || null,
        supplier_id: supplierId.trim() || null,
      };

      if (intakeDateLocal) {
        // Convert to ISO string
        payload.intake_date = new Date(intakeDateLocal).toISOString();
      }

      if (expiryDateLocal) {
        payload.expiry_date = new Date(`${expiryDateLocal}T00:00:00Z`).toISOString();
      } else {
        payload.expiry_date = null;
      }

      if (shelfLifeHrs.trim()) {
        payload.shelf_life_alert_hrs = parseInt(shelfLifeHrs.trim(), 10) || null;
      } else {
        payload.shelf_life_alert_hrs = null;
      }

      await onSave(batch.id, payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save batch details");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Edit className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Edit Batch Details
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Update lot metadata, arrival date, expiry, and vendor information
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Product & Batch Summary Chip */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-[var(--text-primary)]">
              {batch.item_name}
            </span>
            {batch.item_barcode && (
              <span className="text-[10px] font-mono text-[var(--text-muted)] ml-2">
                [{batch.item_barcode}]
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
              Stock: {batch.remaining_quantity} {batch.unit}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              Cost: ₹{Number(batch.unit_cost).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Time-Reference Integrity Banner */}
        {timeDiagnostics && (
          <div
            className={`rounded-xl p-3 border text-xs space-y-1 ${
              timeDiagnostics.isExpired
                ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                : timeDiagnostics.isExpiringSoon
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                {timeDiagnostics.isExpired ? (
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                ) : timeDiagnostics.isExpiringSoon ? (
                  <Clock className="h-4 w-4 text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
                {timeDiagnostics.isExpired
                  ? "Status: Expired / Shelf Life Elapsed"
                  : timeDiagnostics.isExpiringSoon
                  ? `Status: Expiring Soon (${timeDiagnostics.remainingDays} days left)`
                  : "Status: In Active Rotation"}
              </span>
              <span className="text-[10px] font-mono opacity-80">
                Arrived {timeDiagnostics.elapsedDays}d ({timeDiagnostics.elapsedHrs}h) ago
              </span>
            </div>
            <p className="text-[11px] opacity-90">
              {timeDiagnostics.expirySource === "CALENDAR"
                ? `Anchored to Calendar Expiry: ${expiryDateLocal}`
                : timeDiagnostics.expirySource === "SHELF_LIFE"
                ? `Anchored to Physical Arrival + ${shelfLifeHrs}h shelf life`
                : "No expiry configured (Non-perishable lot)."}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Batch / Lot Number */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Batch / Lot Number *
              </label>
              <input
                type="text"
                required
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g. LOT-2026-09A or BAT-01"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Physical Arrival / Intake Date */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                <span>Physical Arrival Date & Time</span>
                <span className="text-[10px] text-[var(--accent-brand)] font-bold">FEFO Anchor</span>
              </label>
              <input
                type="datetime-local"
                value={intakeDateLocal}
                onChange={(e) => setIntakeDateLocal(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                Freshness & shelf-life count from this arrival timestamp.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Calendar Expiry Date */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                <span>Expiry Date (Optional)</span>
                {expiryDateLocal && (
                  <button
                    type="button"
                    onClick={() => setExpiryDateLocal("")}
                    className="text-[10px] text-rose-400 hover:underline font-bold"
                  >
                    Clear Expiry
                  </button>
                )}
              </label>
              <input
                type="date"
                value={expiryDateLocal}
                onChange={(e) => setExpiryDateLocal(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Shelf Life Alert Hours */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                <span>Shelf Life Alert (Hours)</span>
                <span className="text-[10px] text-[var(--text-muted)]">(From Arrival)</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={shelfLifeHrs}
                  onChange={(e) => setShelfLifeHrs(e.target.value)}
                  placeholder="e.g. 48 for 2 days"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 pr-12 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-xs text-[var(--text-muted)] font-mono">
                  hrs
                </span>
              </div>
            </div>
          </div>

          {/* Supplier / Vendor */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Supplier / Vendor
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
            >
              <option value="">-- No Supplier Assigned / General Purchase --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.contact_person ? `(${s.contact_person})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Lot Notes / Storage Remarks */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Storage Notes & Lot Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rack B4, refrigerated at 4°C, arrived in sound condition"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Information Notice */}
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-[var(--text-secondary)] flex items-start gap-2">
            <HelpCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Metadata Only:</strong> This form edits lot identification, physical arrival, and
              expiration parameters without modifying stock quantities. To adjust stock levels or log
              shrinkage, use the dedicated <em>Wastage</em> or <em>Adjust</em> tools.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-500 transition disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save Batch Details
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
