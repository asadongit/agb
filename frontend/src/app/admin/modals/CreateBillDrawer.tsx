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
  pricing_type?: "RETAIL" | "WHOLESALE";
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
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
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
  customerPhone,
  setCustomerPhone,
  handleCreateBill,
}: CreateBillDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [pricingMode, setPricingMode] = useState<"RETAIL" | "WHOLESALE">("RETAIL");

  // Customer Auto-suggest state
  const [customerSuggestions, setCustomerSuggestions] = useState<{ name: string; phone: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Search existing customers when typing phone or name
  const handlePhoneChange = async (val: string) => {
    setCustomerPhone(val);
    if (val.trim().length >= 2) {
      try {
        const res = await fetch(`/api/admin/customers?search=${encodeURIComponent(val.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setCustomerSuggestions(data);
          setShowSuggestions(true);
        }
      } catch {
        /* ignore */
      }
    } else {
      setShowSuggestions(false);
    }
  };

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
            return prev.map((ci, i) =>
              i === existingIdx ? { ...ci, quantity: ci.quantity + 1 } : ci
            );
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Products Catalog
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                  <ScanLine className="h-3 w-3 animate-pulse" />
                  Scanner Ready
                </span>
              </div>

              {/* Retail vs Wholesale Pricing Mode Toggle */}
              <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)]">
                <button
                  type="button"
                  onClick={() => setPricingMode("RETAIL")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    pricingMode === "RETAIL"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Retail Price
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode("WHOLESALE")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    pricingMode === "WHOLESALE"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Wholesale Bulk
                </button>
              </div>

              <div className="relative flex-1 max-w-[200px]">
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
                const retailPriceNum = parseFloat(item.price) || 0;
                const wholesalePriceNum = item.wholesale_price ? parseFloat(item.wholesale_price) : null;
                const activePriceNum = (pricingMode === "WHOLESALE" && wholesalePriceNum !== null) ? wholesalePriceNum : retailPriceNum;

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-3 space-y-2 transition ${
                      pricingMode === "WHOLESALE" && wholesalePriceNum !== null
                        ? "border-purple-500/40 bg-purple-500/5 hover:border-purple-500"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--accent-brand)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-bold text-xs text-[var(--text-primary)] truncate">
                        {item.name}
                      </p>
                      <div className="flex flex-col items-end">
                        <span className={`font-mono text-xs font-bold ${pricingMode === "WHOLESALE" && wholesalePriceNum !== null ? "text-purple-400" : "text-[var(--accent-brand)]"}`}>
                          ₹{activePriceNum.toFixed(2)}
                        </span>
                        {wholesalePriceNum !== null && (
                          <span className="text-[9px] font-mono text-purple-300/80">
                            (Ws: ₹{wholesalePriceNum.toFixed(0)})
                          </span>
                        )}
                      </div>
                    </div>

                    {itemVariants.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {itemVariants.map((v) => {
                          const variantPriceNum = activePriceNum + (parseFloat(v.price_delta) || 0);
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
                                    return prev.map((ci, i) =>
                                      i === existingIdx ? { ...ci, quantity: ci.quantity + 1 } : ci
                                    );
                                  }
                                  return [
                                    ...prev,
                                    {
                                      menu_item_id: item.id,
                                      variant_id: v.id,
                                      item_name: `${item.name} (${v.name})`,
                                      unit_price: variantPriceNum,
                                      quantity: 1,
                                      pricing_type: pricingMode,
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
                              return prev.map((ci, i) =>
                                i === existingIdx ? { ...ci, quantity: ci.quantity + 1 } : ci
                              );
                            }
                            return [
                              ...prev,
                              {
                                menu_item_id: item.id,
                                item_name: item.name,
                                unit_price: activePriceNum,
                                quantity: 1,
                                pricing_type: pricingMode,
                                is_complimentary: false,
                              },
                            ];
                          });
                        }}
                        className={`w-full rounded-xl py-1.5 text-xs font-bold transition border ${
                          pricingMode === "WHOLESALE" && wholesalePriceNum !== null
                            ? "bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white border-purple-500/40"
                            : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--accent-brand)] hover:text-[var(--text-on-accent)] border-[var(--border-strong)]"
                        }`}
                      >
                        + Add to Bill {pricingMode === "WHOLESALE" && wholesalePriceNum !== null ? "(Wholesale)" : ""}
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
              {/* Customer Phone & Name Inputs with Auto-Suggest */}
              <div className="grid grid-cols-2 gap-3 relative">
                <div className="relative">
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                    Customer Phone * (Auto-Account)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onFocus={() => {
                      if (customerPhone.trim().length >= 2) setShowSuggestions(true);
                    }}
                    className={`w-full rounded-xl border bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:outline-none ${
                      customerPhone.trim() && customerPhone.replace(/\D/g, "").length < 10
                        ? "border-rose-500/60 focus:border-rose-500"
                        : "border-[var(--border-strong)] focus:border-purple-500"
                    }`}
                  />
                  {customerPhone.trim() && customerPhone.replace(/\D/g, "").length < 10 && (
                    <p className="text-[10px] text-rose-400 font-semibold mt-0.5">
                      Must be min 10 digits ({customerPhone.replace(/\D/g, "").length}/10)
                    </p>
                  )}

                  {/* Customer Auto-suggest dropdown */}
                  {showSuggestions && customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-1 shadow-xl max-h-40 overflow-y-auto space-y-1">
                      {customerSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setCustomerPhone(s.phone);
                            setCustomerName(s.name);
                            setShowSuggestions(false);
                          }}
                          className="w-full text-left rounded-lg p-2 hover:bg-purple-500/20 text-xs transition cursor-pointer flex items-center justify-between"
                        >
                          <span className="font-bold text-[var(--text-primary)]">{s.name}</span>
                          <span className="font-mono text-[11px] text-[var(--text-muted)]">{s.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-purple-500 focus:outline-none"
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
                            setDraftCartItems((prev) =>
                              prev
                                .map((item, i) =>
                                  i === idx ? { ...item, quantity: item.quantity - 1 } : item
                                )
                                .filter((item) => item.quantity > 0)
                            );
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
                            setDraftCartItems((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, quantity: item.quantity + 1 } : item
                              )
                            );
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
