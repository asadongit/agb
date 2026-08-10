"use client";

import React, { useState, useEffect } from "react";
import { Barcode, CheckCircle2, Package, Sparkles, X } from "lucide-react";
import type { InventoryUnit } from "@/types";

interface BarcodeRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  categories: string[];
  onSuccess: (itemName: string, stock: string) => void;
  onboardItem: (data: {
    barcode: string;
    name: string;
    category: string;
    unit: InventoryUnit;
    initial_stock: number;
    cost_per_unit: number;
    selling_price?: number;
    reorder_threshold?: number;
    batch_number?: string;
    expiry_date?: string;
    supplier_name?: string;
  }) => Promise<void>;
}

export function BarcodeRegisterModal({
  isOpen,
  onClose,
  barcode,
  categories,
  onSuccess,
  onboardItem,
}: BarcodeRegisterModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0] || "General");
  const [unit, setUnit] = useState<InventoryUnit>("pcs");
  const [initialStock, setInitialStock] = useState("1");
  const [costPerUnit, setCostPerUnit] = useState("0");
  const [sellingPrice, setSellingPrice] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setCategory(categories[0] || "General");
      setUnit("pcs");
      setInitialStock("1");
      setCostPerUnit("0");
      setSellingPrice("");
      setBatchNumber(`BAT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
      setExpiryDate("");
      setSupplierName("");
      setError(null);
    }
  }, [isOpen, barcode, categories]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a product name");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onboardItem({
        barcode: barcode.trim(),
        name: name.trim(),
        category: category.trim() || "General",
        unit,
        initial_stock: parseFloat(initialStock) || 0,
        cost_per_unit: parseFloat(costPerUnit) || 0,
        selling_price: sellingPrice.trim() ? parseFloat(sellingPrice) : undefined,
        batch_number: batchNumber.trim() || undefined,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        supplier_name: supplierName.trim() || undefined,
      });

      onSuccess(name.trim(), initialStock);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to register scanned product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                New Barcode Scanned!
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                First-time scan. Tag this barcode to register it in your inventory.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barcode Ribbon */}
        <div className="flex items-center justify-between rounded-xl bg-[var(--bg-surface-elevated)] px-4 py-2.5 border border-[var(--border-strong)]">
          <span className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
            <Barcode className="h-4 w-4 text-[var(--accent-brand)]" />
            Scanned Barcode
          </span>
          <span className="font-mono text-sm font-bold text-[var(--accent-brand)] tracking-wider">
            {barcode}
          </span>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Product / Item Name *
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Amul Butter 500g, Organic Apples 1kg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Category
              </label>
              <input
                type="text"
                list="category-suggestions"
                placeholder="e.g. Dairy, Fruits, Snacks"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Unit of Measurement
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              >
                <option value="pcs">Pieces / Pack (pcs)</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="g">Gram (g)</option>
                <option value="l">Liter (l)</option>
                <option value="ml">Milliliter (ml)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Initial Qty *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Cost / Unit (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Selling Price (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="For POS bill"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
          </div>

          {/* Batch Tracking Fields */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 p-3 space-y-3">
            <h4 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
              Initial Batch Information
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Batch / Lot #
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save & Register Barcode"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
