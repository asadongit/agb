"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Barcode, CreditCard, Minus, Moon, Plus, Receipt, ScanLine, Search, Trash2, X, Flame, Edit3, CheckCircle2 } from "lucide-react";
import type { AdminMenuItem, AdminVariant } from "../adminTypes";
import { useAdminAuth } from "../hooks/useAdminAuth";
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
  customerExtraDetail: string;
  setCustomerExtraDetail: (detail: string) => void;
  handleCreateBill: (instantPayment: boolean) => Promise<void>;
  eveningPriceActive?: boolean;
  restaurant?: import("@/app/admin/adminTypes").RestaurantProfile | null;
  onQuickEditOffer?: (itemId: string, updates: Partial<AdminMenuItem>) => Promise<void>;
};

function CartItemQuantityInput({
  initialQuantity,
  onQuantityChange
}: {
  initialQuantity: number;
  onQuantityChange: (q: number) => void;
}) {
  const [localVal, setLocalVal] = useState(initialQuantity.toString());

  useEffect(() => {
    setLocalVal(initialQuantity.toString());
  }, [initialQuantity]);

  return (
    <input
      type="text"
      value={localVal}
      onChange={(e) => {
        const val = e.target.value;
        if (/^\d*\.?\d*$/.test(val)) {
          setLocalVal(val);
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed > 0) {
            onQuantityChange(parsed);
          }
        }
      }}
      onBlur={() => {
        const parsed = parseFloat(localVal);
        if (isNaN(parsed) || parsed <= 0) {
          onQuantityChange(0); // Triggers removal
        } else {
          setLocalVal(parsed.toString());
        }
      }}
      className="font-mono font-bold w-12 text-center text-sm bg-transparent border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-brand)] focus:ring-1 focus:ring-[var(--accent-brand)] rounded outline-none p-0.5 transition-all text-[var(--text-primary)]"
    />
  );
}

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
  customerExtraDetail,
  setCustomerExtraDetail,
  handleCreateBill,
  eveningPriceActive = false,
  restaurant,
  onQuickEditOffer,
}: CreateBillDrawerProps) {
  const { isAdminRole } = useAdminAuth();
  const isPrivileged = isAdminRole;

  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [pricingMode, setPricingMode] = useState<"RETAIL" | "WHOLESALE">("RETAIL");

  // Customer Auto-suggest & Analytics state
  const [customerSuggestions, setCustomerSuggestions] = useState<{ name: string; phone: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<string>("this_month");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showCustomCalendar, setShowCustomCalendar] = useState(false);
  const [insightsModalOpen, setInsightsModalOpen] = useState(false);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);

  // Inline Offer Edit State
  const [inlineEditingOfferId, setInlineEditingOfferId] = useState<string | null>(null);
  const [inlineOfferActive, setInlineOfferActive] = useState(false);
  const [inlineOfferPrice, setInlineOfferPrice] = useState("");
  const [inlineOfferSaving, setInlineOfferSaving] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setCustomerAnalytics(null);
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      setSearchQuery("");
    } else {
      // Auto-focus phone input when drawer opens
      setTimeout(() => {
        phoneInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Keyboard Shortcuts (Enter = Settle, Esc = Close)
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      
      // If pressing enter, and not inside an input (unless we want to allow it? usually inputs intercept enter)
      if (e.key === "Enter") {
        // Only trigger if not focused on an input, OR if we are specifically focused on quantity input
        if (
          e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement || 
          e.target instanceof HTMLButtonElement
        ) {
          return; // Let the focused element handle it natively
        }
        
        e.preventDefault();
        if (draftCartItems.length > 0) {
          void handleCreateBill(true);
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, draftCartItems.length, handleCreateBill, onClose]);

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
      if (data.extra_detail) {
        setCustomerExtraDetail(data.extra_detail);
      } else {
        setCustomerExtraDetail("");
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
    setHighlightedSuggestionIndex(-1); // Reset highlight when typing

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

  const processBarcodeScan = (barcode: string) => {
    const bcode = barcode.trim().toLowerCase();
    
    // 1. Direct Exact Match (Current Logic)
    let match = menuItems.find(
      (m) => m.barcode && m.barcode.trim().toLowerCase() === bcode
    );
    
    let scannedQuantity = 1;

    // 2. Embedded Weight Scale Logic
    const format = restaurant?.weighing_scale_barcode_format || "21_5I_5W_GRAMS";
    
    if (!match && format.startsWith("CUSTOM:")) {
      const maskStr = format.replace("CUSTOM:", "").replace(/\s/g, "").toUpperCase();
      if (bcode.length === maskStr.length) {
        let pluStr = "";
        let weightStr = "";
        let priceStr = "";

        for (let i = 0; i < maskStr.length; i++) {
          if (maskStr[i] === 'I') pluStr += bcode[i];
          else if (maskStr[i] === 'W') weightStr += bcode[i];
          else if (maskStr[i] === 'P') priceStr += bcode[i];
        }

        if (pluStr) {
          const pluStrParsed = parseInt(pluStr, 10).toString();
          match = menuItems.find((m) => m.barcode === pluStr || m.barcode === pluStrParsed);
          if (match) {
            if (weightStr) {
              const weightGrams = parseInt(weightStr, 10);
              if (!isNaN(weightGrams)) {
                scannedQuantity = weightGrams / 1000;
              }
            } else if (priceStr) {
              const totalPrice = parseInt(priceStr, 10);
              if (!isNaN(totalPrice)) {
                const unitPrice = parseFloat(match.price) || 1;
                scannedQuantity = totalPrice / unitPrice;
              }
            }
          }
        }
      }
    } else if (!match && bcode.length === 13) {
      if (format === "21_5I_5W_GRAMS" && bcode.startsWith("21")) {
        const plu = bcode.substring(2, 7);
        const pluStr = parseInt(plu, 10).toString();
        const weightGrams = parseInt(bcode.substring(7, 12), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(weightGrams)) {
          scannedQuantity = weightGrams / 1000;
        }
      } else if (format === "21_5I_5P_INR" && bcode.startsWith("21")) {
        const plu = bcode.substring(2, 7);
        const pluStr = parseInt(plu, 10).toString();
        const totalPrice = parseInt(bcode.substring(7, 12), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(totalPrice)) {
          const unitPrice = parseFloat(match.price) || 1;
          scannedQuantity = totalPrice / unitPrice;
        }
      } else if (format === "20_6I_4W_GRAMS" && bcode.startsWith("20")) {
        const plu = bcode.substring(2, 8);
        const pluStr = parseInt(plu, 10).toString();
        const weightGrams = parseInt(bcode.substring(8, 12), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(weightGrams)) {
          scannedQuantity = weightGrams / 1000;
        }
      }
    } else if (!match && bcode.length === 10) {
      if (format === "03_3I_5W_GRAMS" && bcode.startsWith("03")) {
        const plu = bcode.substring(2, 5);
        const pluStr = parseInt(plu, 10).toString();
        const weightGrams = parseInt(bcode.substring(5, 10), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(weightGrams)) {
          scannedQuantity = weightGrams / 1000;
        }
      }
    }
    
    return { match, scannedQuantity };
  };

  // Hardware barcode scan listener inside POS bill drawer
  useBarcodeScanner({
    onScan: (barcode) => {
      const { match, scannedQuantity } = processBarcodeScan(barcode);

      if (match) {
        const itemPriceNum = parseFloat(match.price) || 0;
        const mrpNum = match.mrp ? parseFloat(String(match.mrp)) : itemPriceNum;
        const taxRateNum = match.tax_rate ? parseFloat(String(match.tax_rate)) : 0;
        setDraftCartItems((prev) => {
          const existingIdx = prev.findIndex(
            (ci) => ci.menu_item_id === match!.id && !ci.variant_id
          );
          if (existingIdx >= 0) {
            return prev.map((ci, i) =>
              i === existingIdx ? { ...ci, quantity: ci.quantity + scannedQuantity } : ci
            );
          }
          return [
            ...prev,
            {
              menu_item_id: match!.id,
              item_name: match!.name,
              unit_price: itemPriceNum,
              mrp: mrpNum,
              tax_rate: taxRateNum,
              quantity: scannedQuantity,
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

  const addItemToCart = useCallback((item: AdminMenuItem, v?: AdminVariant, qty: number = 1) => {
    const rawPriceNum = parseFloat(item.price) || 0;
    const eveningPriceNum = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
    const retailPriceNum = (eveningPriceActive && eveningPriceNum > 0) ? eveningPriceNum : rawPriceNum;
    const wholesalePriceNum = item.wholesale_price ? parseFloat(item.wholesale_price) : null;
    let activePriceNum = (pricingMode === "WHOLESALE" && wholesalePriceNum !== null) ? wholesalePriceNum : retailPriceNum;
    if (item.is_on_offer && item.offer_price) {
      const offerPriceNum = parseFloat(String(item.offer_price));
      if (offerPriceNum > 0 && offerPriceNum < activePriceNum) {
        activePriceNum = offerPriceNum;
      }
    }
    const taxRate = item.tax_rate ? parseFloat(String(item.tax_rate)) : 0;

    const variantPriceNum = v ? activePriceNum + (parseFloat(v.price_delta) || 0) : activePriceNum;
    // Fall back to the original retail price if MRP isn't defined, so the discount calculation isn't zeroed out
    const baseRetailFallback = v ? rawPriceNum + (parseFloat(v.price_delta) || 0) : rawPriceNum;
    const itemMrpNum = item.mrp ? parseFloat(String(item.mrp)) + (v ? parseFloat(v.price_delta) || 0 : 0) : baseRetailFallback;
    const itemTaxRateNum = taxRate;
    const itemName = v ? `${item.name} (${v.name})` : item.name;

    setDraftCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (ci) => ci.menu_item_id === item.id && ci.variant_id === (v ? v.id : null)
      );
      if (existingIdx >= 0) {
        return prev.map((ci, i) =>
          i === existingIdx ? { ...ci, quantity: ci.quantity + qty } : ci
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
          quantity: qty,
          pricing_type: pricingMode,
          is_complimentary: false,
        },
      ];
    });
  }, [eveningPriceActive, pricingMode, setDraftCartItems]);

  // Sync draft cart prices if menu items are updated (e.g. quick edit offer)
  useEffect(() => {
    setDraftCartItems((prev) => {
      let hasChanges = false;
      const updated = prev.map((ci) => {
        const item = menuItems.find((m) => m.id === ci.menu_item_id);
        if (!item) return ci;

        const rawPriceNum = parseFloat(item.price) || 0;
        const eveningPriceNum = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
        const retailPriceNum = (eveningPriceActive && eveningPriceNum > 0) ? eveningPriceNum : rawPriceNum;
        const wholesalePriceNum = item.wholesale_price ? parseFloat(item.wholesale_price) : null;
        let activePriceNum = (ci.pricing_type === "WHOLESALE" && wholesalePriceNum !== null) ? wholesalePriceNum : retailPriceNum;
        
        if (item.is_on_offer && item.offer_price) {
          const offerPriceNum = parseFloat(String(item.offer_price));
          if (offerPriceNum > 0 && offerPriceNum < activePriceNum) {
            activePriceNum = offerPriceNum;
          }
        }
        
        const v = ci.variant_id ? variantsByItem[item.id]?.find(variant => variant.id === ci.variant_id) : undefined;
        const variantPriceNum = v ? activePriceNum + (parseFloat(v.price_delta) || 0) : activePriceNum;

        if (variantPriceNum !== ci.unit_price && !ci.is_complimentary) {
          hasChanges = true;
          return { ...ci, unit_price: variantPriceNum };
        }
        return ci;
      });
      return hasChanges ? updated : prev;
    });
  }, [menuItems, eveningPriceActive, variantsByItem, setDraftCartItems]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full h-full max-w-none max-h-none flex flex-col rounded-none border-none bg-[var(--bg-surface)] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
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
        <div className="flex-1 min-h-0 grid lg:grid-cols-[35%_65%] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)] overflow-hidden">
          {/* Left Column: Product Catalog Picker */}
          <div className="p-4 space-y-3 flex flex-col h-full overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Products Catalog
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
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search name or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const query = searchQuery.trim().toLowerCase();
                      if (!query) return;
                      
                      let { match, scannedQuantity } = processBarcodeScan(query);
                      
                      if (!match && filteredMenuItems.length === 1) {
                        match = filteredMenuItems[0];
                        scannedQuantity = 1;
                      }
                      
                      if (match) {
                        const itemVariants = variantsByItem[match.id] || [];
                        if (itemVariants.length === 0) {
                          addItemToCart(match, undefined, scannedQuantity);
                          setSearchQuery("");
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        } else if (itemVariants.length === 1) {
                          addItemToCart(match, itemVariants[0], scannedQuantity);
                          setSearchQuery("");
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        } else {
                          // Let user click variant manually
                        }
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Products Grid (Scrollable list container with fixed boxy card dimensions) */}
            <div className="grid gap-2.5 grid-cols-2 content-start flex-1 min-h-0 overflow-y-auto pr-1">
              {filteredMenuItems.map((item) => {
                const itemVariants = variantsByItem[item.id] || [];
                const rawPriceNum = parseFloat(item.price) || 0;
                const eveningPriceNum = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
                const retailPriceNum = (eveningPriceActive && eveningPriceNum > 0) ? eveningPriceNum : rawPriceNum;
                const wholesalePriceNum = item.wholesale_price ? parseFloat(item.wholesale_price) : null;
                let activePriceNum = (pricingMode === "WHOLESALE" && wholesalePriceNum !== null) ? wholesalePriceNum : retailPriceNum;
                if (item.is_on_offer && item.offer_price) {
                  const offerPriceNum = parseFloat(String(item.offer_price));
                  if (offerPriceNum > 0 && offerPriceNum < activePriceNum) {
                    activePriceNum = offerPriceNum;
                  }
                }
                const mrpVal = item.mrp ? parseFloat(String(item.mrp)) : rawPriceNum;
                const hasDiscount = mrpVal > activePriceNum;
                const discountPercent = hasDiscount ? Math.round(((mrpVal - activePriceNum) / mrpVal) * 100) : 0;
                const taxRate = item.tax_rate ? parseFloat(String(item.tax_rate)) : 0;
                const cartQtyForItem = draftCartItems.filter((ci) => ci.menu_item_id === item.id).reduce((sum, ci) => sum + ci.quantity, 0);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (itemVariants.length === 0) {
                        addItemToCart(item);
                      } else if (itemVariants.length === 1) {
                        addItemToCart(item, itemVariants[0]);
                      }
                    }}
                    className={`group relative rounded-md border p-4 min-h-[140px] h-auto flex flex-col justify-between transition-all duration-150 cursor-pointer select-none ${
                      pricingMode === "WHOLESALE" && wholesalePriceNum !== null
                        ? "border-purple-500/40 bg-purple-500/5 hover:border-purple-500 shadow-xs"
                        : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:border-sky-500 hover:shadow-md"
                    }`}
                  >
                    {/* Top Badges Row (Text only for OFF & GST, White text on In Cart) */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-2 font-semibold">
                        {hasDiscount && (
                          <span className="text-[var(--text-muted)] text-[10px]">
                            {discountPercent}% OFF
                          </span>
                        )}
                        {item.is_on_offer && item.offer_price && parseFloat(String(item.offer_price)) === activePriceNum ? (
                          <span title={`Special Offer Active: ₹${parseFloat(String(item.offer_price)).toFixed(2)}`}>
                            <Flame className="h-3.5 w-3.5 text-orange-400 fill-orange-400/20 shrink-0 cursor-pointer" />
                          </span>
                        ) : eveningPriceActive && item.evening_price && parseFloat(String(item.evening_price)) === activePriceNum ? (
                          <span title={`Evening Price Active: ₹${parseFloat(String(item.evening_price)).toFixed(2)}`}>
                            <Moon className="h-3.5 w-3.5 text-amber-400 fill-amber-400/20 shrink-0 cursor-pointer" />
                          </span>
                        ) : null}
                        {taxRate > 0 && (
                          <span className="text-[var(--text-muted)] text-[10px]">
                            GST {taxRate}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isPrivileged && (
                          <button 
                            type="button" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setInlineEditingOfferId(item.id);
                              setInlineOfferActive(item.is_on_offer ?? false);
                              setInlineOfferPrice(item.offer_price ? String(item.offer_price) : "");
                              setTimeout(() => inlineInputRef.current?.focus(), 100);
                            }}
                            className="p-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-amber-500 hover:border-amber-500/50 shadow-sm transition-all flex items-center justify-center"
                            title="Quick Edit Offer"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                        )}
                        {cartQtyForItem > 0 && (
                          <span className="rounded-md bg-sky-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-xs">
                            In Cart: {cartQtyForItem}
                          </span>
                        )}
                      </div>
                    </div>

                    {inlineEditingOfferId === item.id ? (
                      <div className="absolute inset-0 z-20 flex flex-col rounded-md bg-[var(--bg-surface-elevated)] p-3 shadow-2xl border-2 border-amber-500" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--text-primary)]">Quick Edit Offer</span>
                          <button onClick={() => setInlineEditingOfferId(null)} className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="h-4 w-4"/></button>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={inlineOfferActive} onChange={e => setInlineOfferActive(e.target.checked)} className="rounded border-[var(--border-strong)] text-amber-500 focus:ring-amber-500 h-4 w-4" />
                          <span className="text-xs font-semibold">Active Offer</span>
                        </label>
                        {inlineOfferActive && (
                          <div className="flex items-center gap-1 mb-2">
                            <span className="text-sm font-mono font-bold text-[var(--text-muted)]">₹</span>
                            <input
                              ref={inlineInputRef}
                              type="number"
                              value={inlineOfferPrice}
                              onChange={e => setInlineOfferPrice(e.target.value)}
                              placeholder="Price"
                              className="w-full bg-[var(--bg-surface)] rounded border border-[var(--border-strong)] focus:border-amber-500 outline-none text-sm font-mono font-bold text-amber-500 px-2 py-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && onQuickEditOffer && !inlineOfferSaving) {
                                  e.preventDefault();
                                  void (async () => {
                                    setInlineOfferSaving(true);
                                    let offerExpiresAt = null;
                                    const now = new Date();
                                    const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
                                    const istDateString = istFormatter.format(now);
                                    const midnightIstStr = `${istDateString}T23:59:59.999+05:30`;
                                    offerExpiresAt = new Date(midnightIstStr).toISOString();

                                    await onQuickEditOffer(item.id, {
                                      is_on_offer: true,
                                      offer_price: parseFloat(inlineOfferPrice) || null,
                                      offer_expires_at: offerExpiresAt as any
                                    });
                                    setInlineOfferSaving(false);
                                    setInlineEditingOfferId(null);
                                  })();
                                }
                              }}
                            />
                          </div>
                        )}
                        <button
                          disabled={inlineOfferSaving}
                          onClick={async () => {
                            if (!onQuickEditOffer) return;
                            setInlineOfferSaving(true);
                            let offerExpiresAt = null;
                            if (inlineOfferActive) {
                              const now = new Date();
                              const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
                              const istDateString = istFormatter.format(now);
                              const midnightIstStr = `${istDateString}T23:59:59.999+05:30`;
                              offerExpiresAt = new Date(midnightIstStr).toISOString();
                            }
                            await onQuickEditOffer(item.id, {
                              is_on_offer: inlineOfferActive,
                              offer_price: inlineOfferActive ? (parseFloat(inlineOfferPrice) || null) : null,
                              offer_expires_at: offerExpiresAt as any
                            });
                            setInlineOfferSaving(false);
                            setInlineEditingOfferId(null);
                          }}
                          className="mt-auto flex items-center justify-center gap-1 rounded bg-amber-500 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {inlineOfferSaving ? "..." : "Save (Till Midnight)"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2 my-auto">
                        <h4 className="font-extrabold text-xl text-[var(--text-primary)] group-hover:text-sky-400 transition leading-snug line-clamp-2 break-words flex-1 min-w-0 pr-2">
                          {item.name}
                        </h4>

                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className={`font-mono text-base font-black ${pricingMode === "WHOLESALE" && wholesalePriceNum !== null ? "text-purple-400" : "text-sky-400"}`}>
                            ₹{activePriceNum.toFixed(2)}
                          </span>
                          {hasDiscount && (
                            <span className="font-mono text-[10px] text-[var(--text-muted)] line-through">
                              MRP ₹{mrpVal.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

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
                                addItemToCart(item, v);
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
          <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-surface-elevated)]/20">
            {/* Header: Customer Info & Auto-Suggest (Fixed Top) */}
            <div className="p-4 space-y-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 flex-shrink-0">
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-3 relative">
                <div className="relative">
                  <label className="block text-base font-semibold text-[var(--text-muted)] mb-1">
                    Customer Phone * (Auto-Account)
                  </label>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onFocus={() => {
                      if (customerPhone.trim().length >= 2) setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (!showSuggestions || customerSuggestions.length === 0) return;
                      
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedSuggestionIndex(prev => Math.min(prev + 1, customerSuggestions.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedSuggestionIndex(prev => Math.max(prev - 1, -1));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < customerSuggestions.length) {
                          const s = customerSuggestions[highlightedSuggestionIndex];
                          setCustomerPhone(s.phone);
                          setCustomerName(s.name);
                          setShowSuggestions(false);
                          setHighlightedSuggestionIndex(-1);
                          void fetchCustomerAnalytics(s.phone);
                        }
                      }
                    }}
                    className={`w-full rounded-xl border bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-base font-mono text-[var(--text-primary)] focus:outline-none ${
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
                            setHighlightedSuggestionIndex(-1);
                            void fetchCustomerAnalytics(s.phone);
                          }}
                          onMouseEnter={() => setHighlightedSuggestionIndex(i)}
                          className={`w-full text-left rounded-lg p-3 text-lg transition cursor-pointer flex items-center justify-between ${
                            highlightedSuggestionIndex === i ? "bg-[var(--accent-brand)]/20 border border-[var(--accent-brand)]" : "hover:bg-[var(--bg-surface)]"
                          }`}
                        >
                          <span className="font-bold text-[var(--text-primary)]">{s.name}</span>
                          <span className="font-mono text-base text-[var(--text-muted)]">{s.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-base font-semibold text-[var(--text-muted)] mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-base text-[var(--text-primary)] focus:border-sky-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-base font-semibold text-[var(--text-muted)] mb-1">
                    Extra Detail
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Address"
                    value={customerExtraDetail}
                    onChange={(e) => setCustomerExtraDetail(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-base text-[var(--text-primary)] focus:border-sky-500 focus:outline-none"
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
                    {customerAnalytics.credit_balance !== undefined && (
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] uppercase font-bold text-sky-300/80 block">
                          Wallet Balance
                        </span>
                        {customerAnalytics.credit_balance > 0 ? (
                          <span className="font-mono text-base font-black text-emerald-400">
                            ₹{customerAnalytics.credit_balance.toFixed(2)} (Cr)
                          </span>
                        ) : customerAnalytics.credit_balance < 0 ? (
                          <span className="font-mono text-base font-black text-rose-400">
                            -₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)} (Dr)
                          </span>
                        ) : (
                          <span className="font-mono text-base font-black text-sky-400/50">
                            ₹0.00
                          </span>
                        )}
                      </div>
                    )}
                    {(customerAnalytics.loyalty_points ?? 0) > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-amber-400/80 block">
                          Loyalty Balance
                        </span>
                        <span className="font-mono text-base font-black text-amber-400">
                          {customerAnalytics.loyalty_points}
                        </span>
                      </div>
                    )}
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
                draftCartItems.map((ci, idx) => {
                  const originalItem = menuItems.find(m => m.id === ci.menu_item_id);
                  
                  let isOfferApplied = false;
                  let isEveningApplied = false;
                  if (originalItem) {
                    const variant = ci.variant_id ? variantsByItem[originalItem.id]?.find(v => v.id === ci.variant_id) : undefined;
                    const variantDelta = variant ? (parseFloat(variant.price_delta) || 0) : 0;
                    const baseUnit = ci.unit_price - variantDelta;
                    
                    if (originalItem.is_on_offer && originalItem.offer_price && parseFloat(String(originalItem.offer_price)) === baseUnit) {
                      isOfferApplied = true;
                    } else if (eveningPriceActive && ci.pricing_type !== "WHOLESALE" && originalItem.evening_price && parseFloat(String(originalItem.evening_price)) === baseUnit) {
                      isEveningApplied = true;
                    }
                  }

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs"
                    >
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span 
                          onClick={() => {
                            setSearchQuery(ci.item_name);
                            setTimeout(() => searchInputRef.current?.focus(), 0);
                          }}
                          className="font-bold text-lg text-[var(--text-primary)] hover:text-sky-400 cursor-pointer transition-colors"
                          title="Click to search catalog"
                        >
                          {ci.item_name}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[16px] pt-0.5">
                          <span className="text-sky-400 font-bold flex items-center gap-1">
                            ₹{ci.unit_price.toFixed(2)}
                            {isOfferApplied ? (
                              <Flame className="h-4 w-4 text-orange-400 fill-orange-400/20" title="Special Offer Applied" />
                            ) : isEveningApplied ? (
                              <Moon className="h-4 w-4 text-amber-400 fill-amber-400/20" title="Evening Price Applied" />
                            ) : null}
                          </span>
                        {ci.mrp && ci.mrp > ci.unit_price && (
                          <span className="text-[14px] text-gray-400 line-through">MRP: ₹{ci.mrp.toFixed(2)}</span>
                        )}
                        {ci.tax_rate && ci.tax_rate > 0 ? (
                          <span className="text-[12px] text-emerald-400 font-bold border border-emerald-500/20 bg-emerald-500/10 px-1 rounded">GST {ci.tax_rate}%</span>
                        ) : null}
                      </div>
                    </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCartItems((prev) =>
                              prev
                                .map((item, i) =>
                                  i === idx ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item
                                )
                                .filter((item) => item.quantity > 0)
                            );
                          }}
                          className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        
                        <CartItemQuantityInput
                          initialQuantity={ci.quantity}
                          onQuantityChange={(q) => {
                            setDraftCartItems((prev) => {
                              if (q <= 0) {
                                return prev.filter((_, i) => i !== idx);
                              }
                              return prev.map((item, i) =>
                                i === idx ? { ...item, quantity: q } : item
                              );
                            });
                          }}
                        />
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

                    <span className="font-mono font-bold w-24 text-right text-sky-400 text-lg">
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
                  );
                })
              )}
            </div>

            {/* Footer: Hardcoded Fixed Bottom Summary & Action Buttons */}
            <div className="flex-shrink-0 p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3 font-mono shadow-lg">
              <div className="flex items-center justify-between text-xl font-bold font-sans">
                <span className="text-[var(--text-primary)] font-black">Grand Total Payable:</span>
                <span className="font-mono text-3xl font-black text-sky-400">
                  ₹{grandTotalPayable.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 font-sans">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border-strong)] py-3 text-base font-bold text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={draftCartItems.length === 0}
                  onClick={() => handleCreateBill(false)}
                  className="rounded-xl border border-[var(--border-strong)] py-3 text-base font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={draftCartItems.length === 0}
                  onClick={() => handleCreateBill(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-brand)] py-3 text-base font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition disabled:opacity-50"
                >
                  <CreditCard className="h-5 w-5" />
                  Settle &amp; Collect <span className="ml-1 opacity-70 font-mono text-xs bg-black/20 px-1.5 rounded">↵</span>
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
        currentPeriod={analyticsPeriod}
        onPeriodChange={(period, start, end) => {
          setAnalyticsPeriod(period);
          if (start) setStartDate(start);
          if (end) setEndDate(end);
          // When changing period, we refetch data for the active customer phone
          const phone = customerPhone.replace(/\D/g, "");
          if (phone.length >= 10) {
            void fetchCustomerAnalytics(phone, period, start, end);
          }
        }}
      />
    </div>
  );
}
