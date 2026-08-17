"use client";

import React, { useState, useMemo } from "react";
import { Barcode, CreditCard, Minus, Moon, Plus, Receipt, ScanLine, Search, Trash2, X } from "lucide-react";
import type { AdminMenuItem, AdminVariant } from "../adminTypes";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

import { apiRequest } from "../adminUtils";
import { CustomerInsightsModal, CustomerAnalytics } from "./CustomerInsightsModal";

export type DraftCartItem = {
  menu_item_id: string;
  variant_id?: string | null;
  item_name: string;
  unit_price: number;
  mrp?: number | null;
  tax_rate?: number | null;
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
  eveningPriceActive?: boolean;
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
  eveningPriceActive = false,
}: CreateBillDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [pricingMode, setPricingMode] = useState<"RETAIL" | "WHOLESALE">("RETAIL");

  // Customer Auto-suggest & Analytics state
  const [customerSuggestions, setCustomerSuggestions] = useState<{ name: string; phone: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<string>("all_time");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showCustomCalendar, setShowCustomCalendar] = useState(false);
  const [insightsModalOpen, setInsightsModalOpen] = useState(false);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);

  const fetchCustomerAnalytics = async (phone: string, period: string = analyticsPeriod, sDate: string = startDate, eDate: string = endDate) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return;
    setIsFetchingAnalytics(true);
    try {
      let url = `/api/admin/customers/analytics?phone=${encodeURIComponent(clean)}&period=${period}`;
      if (period === "custom" && sDate) {
        url += `&start_date=${encodeURIComponent(sDate)}`;
        if (eDate) url += `&end_date=${encodeURIComponent(eDate)}`;
      }
      const data = await apiRequest<CustomerAnalytics>(url);
      setCustomerAnalytics(data);
      if (data.customer_name && data.customer_name !== "Walk-In Customer") {
        setCustomerName(data.customer_name);
      }
    } catch {
      /* ignore */
    } finally {
      setIsFetchingAnalytics(false);
    }
  };

  // Search existing customers & auto-fetch analytics when phone reaches 10 digits
  const handlePhoneChange = async (val: string) => {
    setCustomerPhone(val);
    const clean = val.replace(/\D/g, "");

    if (clean.length === 10) {
      void fetchCustomerAnalytics(clean);
    }

    if (val.trim().length >= 2) {
      try {
        const data = await apiRequest<{ name: string; phone: string }[]>(`/api/admin/customers?search=${encodeURIComponent(val.trim())}`);
        setCustomerSuggestions(data);
        setShowSuggestions(true);
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
        const mrpNum = match.mrp ? parseFloat(String(match.mrp)) : itemPriceNum;
        const taxRateNum = match.tax_rate ? parseFloat(String(match.tax_rate)) : 0;
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
              mrp: mrpNum,
              tax_rate: taxRateNum,
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
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Regex matching start of string OR start of any word (e.g. "f" matches "Fresh" or "New Food", but NOT "tftum")
    const wordBoundaryRegex = new RegExp(`(?:^|[\\s\\-_/()])${escaped}`, "i");

    return menuItems.filter((m) => {
      const nameMatch = wordBoundaryRegex.test(m.name);
      const barcodeMatch = m.barcode ? m.barcode.toLowerCase().startsWith(q) : false;
      return nameMatch || barcodeMatch;
    });
  }, [menuItems, searchQuery]);

  if (!isOpen) return null;

  const subtotal = draftCartItems.reduce(
    (acc, item) => acc + (item.is_complimentary ? 0 : item.unit_price * item.quantity),
    0
  );

  const totalMrp = draftCartItems.reduce(
    (acc, item) => acc + ((item.mrp || item.unit_price) * item.quantity),
    0
  );

  const mrpDiscount = Math.max(0, totalMrp - subtotal);

  const totalTax = draftCartItems.reduce((acc, item) => {
    if (item.is_complimentary) return acc;
    const lineTotal = item.unit_price * item.quantity;
    const rate = item.tax_rate || 0;
    return acc + (lineTotal * (rate / 100));
  }, 0);

  const grandTotalPayable = subtotal;

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
        <div className="flex-1 min-h-0 grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)] overflow-hidden">
          {/* Left Column: Product Catalog Picker */}
          <div className="lg:col-span-7 p-4 space-y-3 flex flex-col h-full overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Products Catalog
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/30">
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
                      ? "bg-sky-500 text-white shadow-xs"
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
                      ? "bg-sky-500 text-white shadow-xs"
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

            {/* Products Grid (Scrollable list container with fixed boxy card dimensions) */}
            <div className="grid gap-2.5 grid-cols-2 xl:grid-cols-3 content-start flex-1 min-h-0 overflow-y-auto pr-1">
              {filteredMenuItems.map((item) => {
                const itemVariants = variantsByItem[item.id] || [];
                const rawPriceNum = parseFloat(item.price) || 0;
                const eveningPriceNum = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
                const retailPriceNum = (eveningPriceActive && eveningPriceNum > 0) ? eveningPriceNum : rawPriceNum;
                const wholesalePriceNum = item.wholesale_price ? parseFloat(item.wholesale_price) : null;
                const activePriceNum = (pricingMode === "WHOLESALE" && wholesalePriceNum !== null) ? wholesalePriceNum : retailPriceNum;
                const mrpVal = item.mrp ? parseFloat(String(item.mrp)) : 0;
                const hasDiscount = mrpVal > activePriceNum;
                const discountPercent = hasDiscount ? Math.round(((mrpVal - activePriceNum) / mrpVal) * 100) : 0;
                const taxRate = item.tax_rate ? parseFloat(String(item.tax_rate)) : 0;
                const cartQtyForItem = draftCartItems.filter((ci) => ci.menu_item_id === item.id).reduce((sum, ci) => sum + ci.quantity, 0);

                const handleAddItem = (v?: AdminVariant) => {
                  const variantPriceNum = v ? activePriceNum + (parseFloat(v.price_delta) || 0) : activePriceNum;
                  const itemMrpNum = item.mrp ? parseFloat(String(item.mrp)) + (v ? parseFloat(v.price_delta) || 0 : 0) : variantPriceNum;
                  const itemTaxRateNum = taxRate;
                  const itemName = v ? `${item.name} (${v.name})` : item.name;

                  setDraftCartItems((prev) => {
                    const existingIdx = prev.findIndex(
                      (ci) => ci.menu_item_id === item.id && ci.variant_id === (v ? v.id : null)
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
                        variant_id: v ? v.id : null,
                        item_name: itemName,
                        unit_price: variantPriceNum,
                        mrp: itemMrpNum,
                        tax_rate: itemTaxRateNum,
                        quantity: 1,
                        pricing_type: pricingMode,
                        is_complimentary: false,
                      },
                    ];
                  });
                };

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (itemVariants.length === 0) {
                        handleAddItem();
                      } else if (itemVariants.length === 1) {
                        handleAddItem(itemVariants[0]);
                      }
                    }}
                    className={`group relative rounded-md border p-3 h-[110px] flex flex-col justify-between transition-all duration-150 cursor-pointer select-none ${
                      pricingMode === "WHOLESALE" && wholesalePriceNum !== null
                        ? "border-purple-500/40 bg-purple-500/5 hover:border-purple-500 shadow-xs"
                        : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:border-sky-500 hover:shadow-md"
                    }`}
                  >
                    {/* Top Badges Row (Text only for OFF & GST, White text on In Cart) */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-2 font-bold">
                        {hasDiscount && (
                          <span className="text-amber-400 text-[11px]">
                            {discountPercent}% OFF
                          </span>
                        )}
                        {eveningPriceActive && item.evening_price && parseFloat(String(item.evening_price)) > 0 && (
                          <span title={`Evening Price Active: ₹${parseFloat(String(item.evening_price)).toFixed(2)}`}>
                            <Moon className="h-3.5 w-3.5 text-amber-400 fill-amber-400/20 shrink-0 cursor-pointer" />
                          </span>
                        )}
                        {taxRate > 0 && (
                          <span className="text-amber-500 text-[11px]">
                            GST {taxRate}%
                          </span>
                        )}
                      </div>

                      {cartQtyForItem > 0 && (
                        <span className="rounded-md bg-sky-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-xs">
                          In Cart: {cartQtyForItem}
                        </span>
                      )}
                    </div>

                    {/* Product Title & Pricing (Enlarged text-sm font-bold with line-clamp-2) */}
                    <div className="flex items-start justify-between gap-2 my-auto">
                      <h4 className="font-bold text-sm text-[var(--text-primary)] group-hover:text-sky-400 transition leading-snug line-clamp-2 break-words flex-1 min-w-0">
                        {item.name}
                      </h4>

                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className={`font-mono text-sm font-black ${pricingMode === "WHOLESALE" && wholesalePriceNum !== null ? "text-purple-400" : "text-sky-400"}`}>
                          ₹{activePriceNum.toFixed(2)}
                        </span>
                        {hasDiscount && (
                          <span className="font-mono text-[10px] text-[var(--text-muted)] line-through">
                            MRP ₹{mrpVal.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Variant Selection Area (Only rendered if variants exist) */}
                    {itemVariants.length > 0 && (
                      <div className="pt-1 border-t border-[var(--border-subtle)] flex flex-wrap gap-1">
                        {itemVariants.map((v) => {
                          const variantPriceNum = activePriceNum + (parseFloat(v.price_delta) || 0);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddItem(v);
                              }}
                              className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500 hover:text-white transition"
                            >
                              + {v.name} (₹{variantPriceNum.toFixed(0)})
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Draft Bill Summary (Fixed Header, Scrollable List, Fixed Hardcoded Footer) */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden bg-[var(--bg-surface-elevated)]/20">
            {/* Header: Customer Info & Auto-Suggest (Fixed Top) */}
            <div className="p-4 space-y-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 flex-shrink-0">
              <div className="grid grid-cols-2 gap-3 relative">
                <div className="relative">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)]">
                      Customer Phone * (Auto-Account)
                    </label>
                    {customerPhone.replace(/\D/g, "").length >= 10 && (
                      <button
                        type="button"
                        onClick={() => void fetchCustomerAnalytics(customerPhone)}
                        className="text-[10px] text-sky-400 hover:underline font-bold"
                      >
                        Fetch Analytics
                      </button>
                    )}
                  </div>
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
                        : "border-[var(--border-strong)] focus:border-sky-500"
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
                            void fetchCustomerAnalytics(s.phone);
                          }}
                          className="w-full text-left rounded-lg p-2 hover:bg-sky-500/20 text-xs transition cursor-pointer flex items-center justify-between"
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
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Customer Purchase Volume & Insights Banner */}
              {customerAnalytics && (
                <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-sky-300 block">
                        Customer Purchase Volume ({analyticsPeriod.replace(/_/g, " ")})
                      </span>
                      <span className="font-mono text-base font-black text-sky-400">
                        ₹{customerAnalytics.total_volume.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] ml-1 font-semibold">
                        ({customerAnalytics.total_orders} Orders)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInsightsModalOpen(true)}
                      className="rounded-xl bg-sky-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-sky-600 transition shadow-xs"
                    >
                      More Insights
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Middle: Billed Line Items List (Scrollable Middle) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
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
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-[var(--text-muted)]">₹{ci.unit_price.toFixed(2)}</span>
                        {ci.mrp && ci.mrp > ci.unit_price && (
                          <span className="text-[10px] text-gray-400 line-through">MRP: ₹{ci.mrp.toFixed(2)}</span>
                        )}
                        {ci.tax_rate && ci.tax_rate > 0 ? (
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded">GST {ci.tax_rate}%</span>
                        ) : null}
                      </div>
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

                    <span className="font-mono font-bold w-16 text-right text-sky-400">
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

            {/* Footer: Hardcoded Fixed Bottom Summary & Action Buttons */}
            <div className="flex-shrink-0 p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5 text-xs font-mono shadow-lg">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span>Subtotal (Selling Price)</span>
                <span className="font-bold text-[var(--text-primary)]">₹{subtotal.toFixed(2)}</span>
              </div>

              {mrpDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-400 font-bold">
                  <span>Total Discount Against MRP</span>
                  <span>- ₹{mrpDiscount.toFixed(2)}</span>
                </div>
              )}

              {totalTax > 0 && (
                <div className="flex items-center justify-between text-cyan-400">
                  <span>GST Tax Component</span>
                  <span className="font-bold">₹{totalTax.toFixed(2)}</span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-sm font-bold font-sans">
                <span className="text-[var(--text-primary)] font-black">Grand Total Payable:</span>
                <span className="font-mono text-lg font-black text-sky-400">
                  ₹{grandTotalPayable.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 font-sans">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border-strong)] py-2.5 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] transition"
                >
                  Cancel
                </button>
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
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-white shadow-md hover:bg-sky-600 transition disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  Settle &amp; Collect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Insights & Interest Profile Modal */}
      <CustomerInsightsModal
        isOpen={insightsModalOpen}
        onClose={() => setInsightsModalOpen(false)}
        analytics={customerAnalytics}
      />
    </div>
  );
}
