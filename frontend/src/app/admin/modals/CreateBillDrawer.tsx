"use client";

import React, { useState, useMemo } from "react";
import { Barcode, CreditCard, Minus, Plus, Receipt, ScanLine, Search, Trash2, X } from "lucide-react";
import type { AdminMenuItem, AdminVariant } from "../adminTypes";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

export type DraftCartItem = {
  menu_item_id: string;
  variant_id?: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  is_complimentary: boolean;
};

type CreateBillDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  menuItems: AdminMenuItem[];
  variantsByItem: Record<string, AdminVariant[]>;
  draftCartItems: DraftCartItem[];
  setDraftCartItems: React.Dispatch<React.SetStateAction<DraftCartItem[]>>;
  selectedTable: string;
  setSelectedTable: (table: string) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  handleCreateBill: (instantPayment: boolean) => Promise<void>;
};

export function CreateBillDrawer({
  isOpen,
  onClose,
  menuItems,
  variantsByItem,
  draftCartItems,
  setDraftCartItems,
  selectedTable,
  setSelectedTable,
  customerName,
  setCustomerName,
  handleCreateBill,
}: CreateBillDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Hardware barcode scan listener inside POS bill drawer
  useBarcodeScanner({
    onScan: (barcode) => {
      const match = menuItems.find(
        (m) => m.barcode && m.barcode.trim().toLowerCase() === barcode.trim().toLowerCase()
      );
      if (match) {
        const itemPriceNum = parseFloat(match.price) || 0;
        setDraftCartItems((prev) => {
          const existingIdx = prev.findIndex(
            (ci) => ci.menu_item_id === match.id && !ci.variant_id
          );
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx].quantity += 1;
            return updated;
          }
          return [
            ...prev,
            {
              menu_item_id: match.id,
              item_name: match.name,
              unit_price: itemPriceNum,
              quantity: 1,
              is_complimentary: false,
            },
          ];
        });
      }
    },
    enabled: isOpen,
  });

  const filteredMenuItems = useMemo(() => {
    if (!searchQuery.trim()) return menuItems;
    const q = searchQuery.toLowerCase().trim();
    return menuItems.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.barcode && m.barcode.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [menuItems, searchQuery]);

  if (!isOpen) return null;

  const subtotal = draftCartItems.reduce(
    (acc, item) => acc + (item.is_complimentary ? 0 : item.unit_price * item.quantity),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl max-h-[95vh] h-[85vh] flex flex-col rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[var(--accent-brand)]" />
            <h3 className="font-display text-lg font-bold">Create New Manual Bill (POS)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body: 2 Columns */}
        <div className="flex-1 overflow-y-auto grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left Column: Product Catalog Picker */}
          <div className="lg:col-span-7 p-4 space-y-4 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Select Products
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                  <ScanLine className="h-3 w-3 animate-pulse" />
                  Scanner Ready
                </span>
              </div>
              <div className="relative flex-1 max-w-[220px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search name or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid gap-2 sm:grid-cols-2 flex-1 min-h-[440px] max-h-[560px] overflow-y-auto pr-1">
              {filteredMenuItems.map((item) => {
                const itemVariants = variantsByItem[item.id] || [];
                const itemPriceNum = parseFloat(item.price) || 0;

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-2 hover:border-[var(--accent-brand)] transition"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-[var(--text-primary)] truncate">
                        {item.name}
                      </p>
                      <span className="font-mono text-xs font-bold text-[var(--accent-brand)]">
                        ₹{itemPriceNum.toFixed(2)}
                      </span>
                    </div>

                    {itemVariants.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {itemVariants.map((v) => {
                          const variantPriceNum = itemPriceNum + (parseFloat(v.price_delta) || 0);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setDraftCartItems((prev) => {
                                  const existingIdx = prev.findIndex(
                                    (ci) => ci.menu_item_id === item.id && ci.variant_id === v.id
                                  );
                                  if (existingIdx >= 0) {
                                    const updated = [...prev];
                                    updated[existingIdx].quantity += 1;
                                    return updated;
                                  }
                                  return [
                                    ...prev,
                                    {
                                      menu_item_id: item.id,
                                      variant_id: v.id,
                                      item_name: `${item.name} (${v.name})`,
                                      unit_price: variantPriceNum,
                                      quantity: 1,
                                      is_complimentary: false,
                                    },
                                  ];
                                });
                              }}
                              className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)] hover:border-[var(--accent-brand)]"
                            >
                              + {v.name} (₹{variantPriceNum.toFixed(0)})
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftCartItems((prev) => {
                            const existingIdx = prev.findIndex(
                              (ci) => ci.menu_item_id === item.id && !ci.variant_id
                            );
                            if (existingIdx >= 0) {
                              const updated = [...prev];
                              updated[existingIdx].quantity += 1;
                              return updated;
                            }
                            return [
                              ...prev,
                              {
                                menu_item_id: item.id,
                                item_name: item.name,
                                unit_price: itemPriceNum,
                                quantity: 1,
                                is_complimentary: false,
                              },
                            ];
                          });
                        }}
                        className="w-full rounded-xl bg-[var(--bg-surface)] py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--accent-brand)] hover:text-[var(--text-on-accent)] transition border border-[var(--border-strong)]"
                      >
                        + Add to Bill
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Draft Bill Summary */}
          <div className="lg:col-span-5 p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                    Table / Counter #
                  </label>
                  <input
                    type="text"
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                    Customer Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              {/* Line Items List */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 min-h-[220px] max-h-[340px] overflow-y-auto space-y-2">
                {draftCartItems.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)] py-12">
                    No items in bill yet. Scan a barcode or click products on the left.
                  </div>
                ) : (
                  draftCartItems.map((ci, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] truncate">
                          {ci.item_name}
                        </p>
                        <p className="font-mono text-[11px] text-[var(--text-muted)]">
                          ₹{ci.unit_price.toFixed(2)} each
                        </p>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCartItems((prev) => {
                              const updated = [...prev];
                              if (updated[idx].quantity > 1) {
                                updated[idx].quantity -= 1;
                                return updated;
                              }
                              return updated.filter((_, i) => i !== idx);
                            });
                          }}
                          className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-mono font-bold w-5 text-center">
                          {ci.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCartItems((prev) => {
                              const updated = [...prev];
                              updated[idx].quantity += 1;
                              return updated;
                            });
                          }}
                          className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <span className="font-mono font-bold w-16 text-right text-[var(--accent-brand)]">
                        ₹{(ci.unit_price * ci.quantity).toFixed(2)}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setDraftCartItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-[var(--text-muted)] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Total & Checkout Actions */}
            <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-[var(--text-secondary)]">Subtotal Amount</span>
                <span className="font-mono text-base font-bold text-[var(--accent-brand)]">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={draftCartItems.length === 0}
                  onClick={() => handleCreateBill(false)}
                  className="rounded-xl border border-[var(--border-strong)] py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={draftCartItems.length === 0}
                  onClick={() => handleCreateBill(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-brand)] py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  Settle & Collect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
