"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Barcode, CreditCard, Minus, Moon, Plus, Receipt, ScanLine, Search, Trash2, X, Flame, Edit3, CheckCircle2, Sparkles } from "lucide-react";
import type { AdminMenuItem, AdminVariant } from "../adminTypes";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

import { apiRequest } from "../adminUtils";
import { CustomerInsightsModal, CustomerAnalytics } from "./CustomerInsightsModal";
import { OversellBatchModal, type BatchAllocation } from "./OversellBatchModal";
import type { ItemBatchSummary } from "@/types";

export type DraftCartItem = {
  menu_item_id: string;
  variant_id?: string | null;
  selected_batch_id?: string | null;
  selected_batch_number?: string | null;
  allow_oversell?: boolean;
  item_name: string;
  unit_price: number;
  mrp?: number | null;
  tax_rate?: number | null;
  quantity: number;
  pricing_type?: "RETAIL" | "WHOLESALE";
  is_complimentary: boolean;
  is_custom_price?: boolean;
  selected_unit?: string | null;
  base_unit_price?: number;
  base_mrp?: number | null;
};

export const getUnallocatedBatchStock = (
  batchId: string | null | undefined,
  nominalStock: number,
  cart: DraftCartItem[],
  excludeCartIndex?: number
): number => {
  if (!batchId) return nominalStock;
  const alreadyAllocated = cart
    .filter((item, i) => i !== excludeCartIndex && item.selected_batch_id === batchId)
    .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return Math.max(0, nominalStock - alreadyAllocated);
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
  restaurant?: import("../adminTypes").RestaurantProfile | null;
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

function CartItemPriceInput({
  initialPrice,
  onPriceChange,
}: {
  initialPrice: number;
  onPriceChange: (newPrice: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localVal, setLocalVal] = useState(initialPrice.toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setLocalVal(initialPrice.toFixed(2));
    }
  }, [initialPrice, isEditing]);

  const commitPrice = () => {
    const val = parseFloat(localVal);
    if (!isNaN(val) && val >= 0) {
      onPriceChange(val);
    } else {
      setLocalVal(initialPrice.toFixed(2));
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-sky-400 font-bold text-sm">₹</span>
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={localVal}
          onChange={(e) => {
            const val = e.target.value;
            if (/^\d*\.?\d*$/.test(val)) {
              setLocalVal(val);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPrice();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setLocalVal(initialPrice.toFixed(2));
              setIsEditing(false);
            }
          }}
          onBlur={commitPrice}
          className="font-mono font-bold w-16 text-left text-sm bg-[var(--bg-surface-elevated)] border border-[var(--accent-brand)] rounded px-1 py-0.5 text-sky-400 outline-none shadow-inner"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
        setTimeout(() => inputRef.current?.select(), 50);
      }}
      className="group/price inline-flex items-center gap-1 hover:bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)] border border-transparent px-1 py-0.5 rounded cursor-pointer transition-colors"
      title="Click to edit item price"
    >
      <span className="text-sky-400 font-bold">₹{initialPrice.toFixed(2)}</span>
      <Edit3 className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-60 group-hover/price:opacity-100 group-hover/price:text-sky-400 transition-opacity" />
    </button>
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

  // Oversell state for batch exhaustion & difference splitting
  const [oversellState, setOversellState] = useState<{
    cartItemIndex: number;
    itemName: string;
    selectedBatchId?: string | null;
    selectedBatchNumber: string;
    availableQty: number;
    requestedQty: number;
    activeBatches: ItemBatchSummary[];
  } | null>(null);

  // Inline notification notice for instant batch splitting
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  // Auto-dismiss inlineNotice after 4.5 seconds
  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => {
      setInlineNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

  const unallocatedBatchStockMap = useMemo(() => {
    if (!oversellState) return {};
    const map: Record<string, number> = {};
    for (const b of oversellState.activeBatches) {
      map[b.id] = getUnallocatedBatchStock(
        b.id,
        Number(b.remaining_quantity),
        draftCartItems,
        oversellState.cartItemIndex
      );
    }
    return map;
  }, [oversellState, draftCartItems]);

  const handleApplyBatchAllocations = (
    cartItemIndex: number,
    allocations: BatchAllocation[]
  ) => {
    setDraftCartItems((prev) => {
      const baseItem = prev[cartItemIndex];
      if (!baseItem || allocations.length === 0) return prev;

      const newItems: DraftCartItem[] = allocations.map((alloc) => {
        const b = alloc.batch;
        const altPrice = !baseItem.is_custom_price && b.retail_price ? Number(b.retail_price) : baseItem.unit_price;
        const altMrp = !baseItem.is_custom_price && b.mrp ? Number(b.mrp) : baseItem.mrp;
        return {
          ...baseItem,
          quantity: alloc.quantity,
          selected_batch_id: b.id,
          selected_batch_number: b.batch_number,
          unit_price: altPrice,
          base_unit_price: altPrice,
          mrp: altMrp,
          base_mrp: altMrp,
          is_custom_price: baseItem.is_custom_price,
          allow_oversell: alloc.allowOversell,
        };
      });

      const newCart = [...prev];
      newCart.splice(cartItemIndex, 1, ...newItems);
      return newCart;
    });
  };

  /**
   * Option A (Instant Inline Split):
   * If quantity for an older batch exceeds its available stock, cap the older batch
   * and automatically roll excess into the next positive batch(es) as explicit line items.
   * Only the latest batch is ever allowed to prompt or carry an oversold deficit.
   */
  const handleCartItemQuantityChange = (cartIdx: number, newQty: number) => {
    if (newQty <= 0) {
      setDraftCartItems((prev) => prev.filter((_, i) => i !== cartIdx));
      return;
    }

    const ci = draftCartItems[cartIdx];
    if (!ci) return;
    const orig = menuItems.find((m) => m.id === ci.menu_item_id);
    const activeBatches = orig?.active_batches || [];

    // If item doesn't track inventory batches or has no active batches
    if (!orig?.inventory_item_id || activeBatches.length === 0) {
      if (orig?.inventory_item_id && activeBatches.length === 0) {
        if (orig.allow_oversell === false) {
          setInlineNotice(`Item '${orig.name}' is Out of Stock and overselling is disabled.`);
          return;
        }
        const cleanName = ci.item_name.replace(/\[Oversold Backorder\]/gi, "").trim();
        setDraftCartItems((prev) =>
          prev.map((item, i) =>
            i === cartIdx
              ? {
                  ...item,
                  item_name: `${cleanName} [Oversold Backorder]`,
                  quantity: newQty,
                  allow_oversell: true,
                  selected_batch_id: null,
                  selected_batch_number: null,
                }
              : item
          )
        );
        return;
      }
      setDraftCartItems((prev) =>
        prev.map((item, i) => (i === cartIdx ? { ...item, quantity: newQty } : item))
      );
      return;
    }

    // Find the selected batch in active_batches
    const batchIdx = activeBatches.findIndex(
      (b) => b.id === (ci.selected_batch_id || activeBatches[0]?.id)
    );
    const curBatch = batchIdx >= 0 ? activeBatches[batchIdx] : activeBatches[0];
    const isLatestBatch = batchIdx === activeBatches.length - 1;

    // Calculate unallocated stock for curBatch (excluding this cartIdx)
    const availableQty = getUnallocatedBatchStock(
      curBatch.id,
      Number(curBatch.remaining_quantity),
      draftCartItems,
      cartIdx
    );

    // If within available stock or already marked allow_oversell
    if (newQty <= availableQty || ci.allow_oversell) {
      setDraftCartItems((prev) =>
        prev.map((item, i) => (i === cartIdx ? { ...item, quantity: newQty } : item))
      );
      return;
    }

    // If this IS the latest batch (no newer batches exist to roll into)
    if (isLatestBatch) {
      if (orig?.allow_oversell === false) {
        const cappedQty = Math.max(0, availableQty);
        setDraftCartItems((prev) =>
          prev
            .map((item, i) => (i === cartIdx ? { ...item, quantity: cappedQty } : item))
            .filter((it) => it.quantity > 0)
        );
        setInlineNotice(
          `Lot #${curBatch.batch_number} has only ${availableQty} in stock. Overselling is disabled for ${ci.item_name}.`
        );
        return;
      }

      // Allow oversell: Instant inline split
      const cleanName = ci.item_name.replace(/\[Oversold Backorder\]/gi, "").trim();
      const latestPrice = !ci.is_custom_price && curBatch?.retail_price ? Number(curBatch.retail_price) : ci.unit_price;
      const latestMrp = !ci.is_custom_price && curBatch?.mrp ? Number(curBatch.mrp) : ci.mrp;

      if (availableQty > 0) {
        const excess = newQty - availableQty;
        const line1 = {
          ...ci,
          item_name: cleanName,
          quantity: availableQty,
          selected_batch_id: curBatch.id,
          selected_batch_number: curBatch.batch_number,
          unit_price: latestPrice,
          base_unit_price: latestPrice,
          mrp: latestMrp,
          base_mrp: latestMrp,
          allow_oversell: false,
        };
        const line2 = {
          ...ci,
          item_name: `${cleanName} [Oversold Backorder]`,
          quantity: excess,
          selected_batch_id: null,
          selected_batch_number: curBatch?.batch_number ?? null,
          unit_price: latestPrice,
          base_unit_price: latestPrice,
          mrp: latestMrp,
          base_mrp: latestMrp,
          allow_oversell: true,
        };
        setDraftCartItems((prev) => {
          const next = [...prev];
          next.splice(cartIdx, 1, line1, line2);
          return next;
        });
        setInlineNotice(
          `Lot #${curBatch.batch_number} stock reached (${availableQty}). Added ${excess} as [Oversold Backorder].`
        );
        return;
      } else {
        setDraftCartItems((prev) =>
          prev.map((item, i) =>
            i === cartIdx
              ? {
                  ...item,
                  item_name: `${cleanName} [Oversold Backorder]`,
                  quantity: newQty,
                  selected_batch_id: null,
                  selected_batch_number: curBatch?.batch_number ?? null,
                  unit_price: latestPrice,
                  base_unit_price: latestPrice,
                  mrp: latestMrp,
                  base_mrp: latestMrp,
                  allow_oversell: true,
                }
              : item
          )
        );
        setInlineNotice(
          `Lot #${curBatch.batch_number} is out of stock. Marked ${newQty} as [Oversold Backorder].`
        );
        return;
      }
    }

    // IT IS AN OLDER BATCH:
    // Option A (Instant Inline Split into newer batches)
    const currentItem = draftCartItems[cartIdx];
    if (!currentItem) return;

    const updatedCart = [...draftCartItems];
    const targetOlderQty = availableQty > 0 ? availableQty : 0;
    const updatedOlderQty = Math.max(0, targetOlderQty);
    const actualExcess = newQty - updatedOlderQty;

    if (actualExcess <= 0) {
      return;
    }

    let excessToDistribute = actualExcess;
    const newerBatches = activeBatches.slice(batchIdx + 1);
    const splitSummaryMessages: string[] = [];

    updatedCart[cartIdx] = {
      ...currentItem,
      quantity: updatedOlderQty,
    };

    for (let k = 0; k < newerBatches.length; k++) {
      if (excessToDistribute <= 0) break;
      const nb = newerBatches[k];
      const isLast = k === newerBatches.length - 1;

      // Check if nb is already in the cart
      const existingNbIdx = updatedCart.findIndex(
        (it) => it.menu_item_id === currentItem.menu_item_id && it.selected_batch_id === nb.id
      );

      const nbAvail = getUnallocatedBatchStock(
        nb.id,
        Number(nb.remaining_quantity),
        updatedCart,
        existingNbIdx >= 0 ? existingNbIdx : -1
      );

      const batchPrice = !currentItem.is_custom_price && nb.retail_price ? Number(nb.retail_price) : currentItem.unit_price;
      const batchMrp = !currentItem.is_custom_price && nb.mrp ? Number(nb.mrp) : currentItem.mrp;

      if (isLast && excessToDistribute > nbAvail) {
        // Latest batch takes up to nbAvail, remaining is oversold backorder
        const normalTake = Math.max(0, nbAvail);
        if (normalTake > 0) {
          if (existingNbIdx >= 0) {
            updatedCart[existingNbIdx] = {
              ...updatedCart[existingNbIdx],
              quantity: updatedCart[existingNbIdx].quantity + normalTake,
            };
          } else {
            updatedCart.splice(cartIdx + 1, 0, {
              ...currentItem,
              selected_batch_id: nb.id,
              selected_batch_number: nb.batch_number,
              unit_price: batchPrice,
              base_unit_price: batchPrice,
              mrp: batchMrp,
              base_mrp: batchMrp,
              quantity: normalTake,
              allow_oversell: false,
            });
          }
          splitSummaryMessages.push(`+${normalTake} on Lot #${nb.batch_number} (₹${batchPrice.toFixed(2)})`);
        }

        const storewideDeficit = excessToDistribute - normalTake;
        if (orig?.allow_oversell === false) {
          splitSummaryMessages.push(`${storewideDeficit} excess blocked (overselling disabled)`);
        } else {
          const cleanName = currentItem.item_name.replace(/\[Oversold Backorder\]/gi, "").trim();
          updatedCart.push({
            ...currentItem,
            item_name: `${cleanName} [Oversold Backorder]`,
            quantity: storewideDeficit,
            selected_batch_id: null,
            selected_batch_number: nb.batch_number,
            unit_price: batchPrice,
            base_unit_price: batchPrice,
            mrp: batchMrp,
            base_mrp: batchMrp,
            allow_oversell: true,
          });
          splitSummaryMessages.push(`+${storewideDeficit} as [Oversold Backorder] (₹${batchPrice.toFixed(2)})`);
        }

        excessToDistribute = 0;
        break;
      }

      const takeQty = Math.min(nbAvail, excessToDistribute);
      if (takeQty <= 0) continue;

      if (existingNbIdx >= 0) {
        updatedCart[existingNbIdx] = {
          ...updatedCart[existingNbIdx],
          quantity: updatedCart[existingNbIdx].quantity + takeQty,
        };
      } else {
        updatedCart.splice(cartIdx + 1, 0, {
          ...currentItem,
          selected_batch_id: nb.id,
          selected_batch_number: nb.batch_number,
          unit_price: batchPrice,
          base_unit_price: batchPrice,
          mrp: batchMrp,
          base_mrp: batchMrp,
          quantity: takeQty,
          allow_oversell: false,
        });
      }

      splitSummaryMessages.push(`+${takeQty} on Lot #${nb.batch_number} (₹${batchPrice.toFixed(2)})`);
      excessToDistribute -= takeQty;
    }

    setDraftCartItems(updatedCart.filter((it) => it.quantity > 0));

    if (splitSummaryMessages.length > 0) {
      setInlineNotice(
        `Lot #${curBatch.batch_number} stock reached (${updatedOlderQty}). Added ${splitSummaryMessages.join(", ")}.`
      );
    }
  };

  const validateBeforeCreateBill = (proceedToPayment: boolean) => {
    for (let i = 0; i < draftCartItems.length; i++) {
      const ci = draftCartItems[i];
      const orig = menuItems.find((m) => m.id === ci.menu_item_id);
      const curBatch = orig?.active_batches?.find((b) => b.id === ci.selected_batch_id) || orig?.active_batches?.[0];
      if (orig?.inventory_item_id && curBatch && !ci.allow_oversell) {
        const avail = getUnallocatedBatchStock(curBatch.id, Number(curBatch.remaining_quantity), draftCartItems, i);
        if (ci.quantity > avail) {
          handleCartItemQuantityChange(i, ci.quantity);
          return;
        }
      }
    }
    void handleCreateBill(proceedToPayment);
  };

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
          validateBeforeCreateBill(true);
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
        const rawMrpNum = match.mrp ? parseFloat(String(match.mrp)) : itemPriceNum;
        const mrpNum = Math.max(rawMrpNum, itemPriceNum);
        const taxRateNum = match.tax_rate ? parseFloat(String(match.tax_rate)) : 0;
        const oldestBatch = match.active_batches?.[0];

        const isOos = match.is_out_of_stock || (match.inventory_item_id && match.current_stock !== undefined && Number(match.current_stock) <= 0);
        if (match.inventory_item_id && isOos && match.allow_oversell === false) {
          setInlineNotice(`'${match.name}' is Out of Stock. Overselling is disabled for this product.`);
          return;
        }

        const isBackorder = Boolean(match.inventory_item_id && isOos && match.allow_oversell !== false);
        const finalDishName = isBackorder ? `${match.name} [Oversold Backorder]` : match.name;

        setDraftCartItems((prev) => {
          const existingIdx = prev.findIndex(
            (ci) => ci.menu_item_id === match!.id && !ci.variant_id && ci.allow_oversell === isBackorder
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
              selected_batch_id: isBackorder ? null : (oldestBatch?.id || null),
              selected_batch_number: isBackorder ? null : (oldestBatch?.batch_number || null),
              allow_oversell: isBackorder,
              item_name: finalDishName,
              unit_price: itemPriceNum,
              mrp: mrpNum,
              tax_rate: taxRateNum,
              quantity: scannedQuantity,
              is_complimentary: false,
              selected_unit: match!.unit_label || "piece",
              base_unit_price: itemPriceNum,
              base_mrp: mrpNum,
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
    const isOos = item.is_out_of_stock || (item.inventory_item_id && item.current_stock !== undefined && Number(item.current_stock) <= 0);
    if (item.inventory_item_id && isOos && item.allow_oversell === false) {
      setInlineNotice(`'${item.name}' is Out of Stock. Overselling is disabled for this product.`);
      return;
    }

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
    const rawMrp = item.mrp ? parseFloat(String(item.mrp)) + (v ? parseFloat(v.price_delta) || 0 : 0) : baseRetailFallback;
    const itemMrpNum = Math.max(rawMrp, variantPriceNum);
    const itemTaxRateNum = taxRate;
    const baseDishName = v ? `${item.name} (${v.name})` : item.name;

    const isBackorder = Boolean(item.inventory_item_id && isOos && item.allow_oversell !== false);
    const finalItemName = isBackorder ? `${baseDishName} [Oversold Backorder]` : baseDishName;

    const oldestBatch = item.active_batches?.[0];
    setDraftCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (ci) => ci.menu_item_id === item.id && ci.variant_id === (v ? v.id : null) && ci.allow_oversell === isBackorder
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
          selected_batch_id: isBackorder ? null : (oldestBatch?.id || null),
          selected_batch_number: isBackorder ? null : (oldestBatch?.batch_number || null),
          allow_oversell: isBackorder,
          item_name: finalItemName,
          unit_price: variantPriceNum,
          mrp: itemMrpNum,
          tax_rate: itemTaxRateNum,
          quantity: qty,
          pricing_type: pricingMode,
          is_complimentary: false,
          selected_unit: item.unit_label || "piece",
          base_unit_price: variantPriceNum,
          base_mrp: itemMrpNum,
        },
      ];
    });
    if (isBackorder) {
      setInlineNotice(`'${item.name}' is out of stock. Added as [Oversold Backorder].`);
    }
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

        if (variantPriceNum !== ci.unit_price && !ci.is_complimentary && !ci.is_custom_price) {
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
                const isOos = Boolean(item.is_out_of_stock || (item.inventory_item_id && item.current_stock !== undefined && Number(item.current_stock) <= 0));
                const stockNum = item.current_stock !== undefined ? Number(item.current_stock) : null;
                const isBlocked = Boolean(item.inventory_item_id && isOos && item.allow_oversell === false);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isBlocked) {
                        setInlineNotice(`'${item.name}' is Out of Stock. Overselling is disabled for this product.`);
                        return;
                      }
                      if (itemVariants.length === 0) {
                        addItemToCart(item);
                      } else if (itemVariants.length === 1) {
                        addItemToCart(item, itemVariants[0]);
                      }
                    }}
                    className={`group relative rounded-md border p-4 min-h-[140px] h-auto flex flex-col justify-between transition-all duration-150 select-none ${
                      isBlocked
                        ? "cursor-not-allowed opacity-65 border-rose-500/40 bg-rose-500/5 hover:border-rose-500/60"
                        : pricingMode === "WHOLESALE" && wholesalePriceNum !== null
                        ? "cursor-pointer border-purple-500/40 bg-purple-500/5 hover:border-purple-500 shadow-xs"
                        : "cursor-pointer border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:border-sky-500 hover:shadow-md"
                    }`}
                  >
                    {/* Top Badges Row (Text only for OFF & GST, White text on In Cart) */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-2 font-semibold">
                        {isOos && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            item.allow_oversell === false
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          }`}>
                            {item.allow_oversell === false ? "OUT OF STOCK" : "OUT OF STOCK"}
                            {stockNum !== null && stockNum < 0 ? ` (${stockNum})` : ""}
                          </span>
                        )}
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
                                      offer_price: inlineOfferPrice ? String(inlineOfferPrice) : null,
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
                              offer_price: inlineOfferActive && inlineOfferPrice ? String(inlineOfferPrice) : null,
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
              {inlineNotice && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="h-4 w-4 shrink-0 text-sky-400" />
                    <span className="truncate">{inlineNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInlineNotice(null)}
                    className="text-sky-400/60 hover:text-sky-400 p-0.5 rounded transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
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

                        {/* Minimal lot selector pill if item has multiple positive lots */}
                        {originalItem?.active_batches && originalItem.active_batches.length > 1 && (
                          <div className="flex items-center gap-1">
                            {ci.allow_oversell ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-mono rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-400 font-semibold"
                                title={`Oversold Backorder priced at latest lot rate (${ci.selected_batch_number ? `Lot #${ci.selected_batch_number}` : "Latest Rate"})`}
                              >
                                Backorder · {ci.selected_batch_number ? `Lot #${ci.selected_batch_number}` : "Latest Lot"}
                              </span>
                            ) : (
                              <select
                                value={ci.selected_batch_id || (originalItem.active_batches[0]?.id ?? "")}
                                onChange={(e) => {
                                  const chosenBatch = originalItem.active_batches?.find((b) => b.id === e.target.value);
                                  if (!chosenBatch) return;
                                  const newPrice = !ci.is_custom_price && chosenBatch.retail_price ? Number(chosenBatch.retail_price) : ci.unit_price;
                                  const newMrp = !ci.is_custom_price && chosenBatch.mrp ? Number(chosenBatch.mrp) : ci.mrp;
                                  setDraftCartItems((prev) =>
                                    prev.map((item, i) => {
                                      if (i !== idx) return item;
                                      return {
                                        ...item,
                                        selected_batch_id: chosenBatch.id,
                                        selected_batch_number: chosenBatch.batch_number,
                                        unit_price: newPrice,
                                        base_unit_price: newPrice,
                                        mrp: newMrp,
                                        base_mrp: newMrp,
                                        allow_oversell: false,
                                      };
                                    })
                                  );
                                  const avail = getUnallocatedBatchStock(chosenBatch.id, Number(chosenBatch.remaining_quantity), draftCartItems, idx);
                                  if (ci.quantity > avail) {
                                    setTimeout(() => {
                                      handleCartItemQuantityChange(idx, ci.quantity);
                                    }, 0);
                                  }
                                }}
                                className="text-[11px] font-mono rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--text-secondary)] hover:border-sky-500 focus:outline-none cursor-pointer"
                                title="Select Inventory Lot"
                              >
                                {originalItem.active_batches.map((b) => {
                                  const unallocated = getUnallocatedBatchStock(b.id, Number(b.remaining_quantity), draftCartItems, idx);
                                  return (
                                    <option key={b.id} value={b.id}>
                                      Lot: {b.batch_number} · ₹{Number(b.retail_price ?? originalItem.price).toFixed(2)} ({unallocated} left){b.is_oldest ? " (oldest)" : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            )}
                            {ci.allow_oversell && (
                              <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">
                                Oversell
                              </span>
                            )}
                          </div>
                        )}
                        {(!originalItem?.active_batches || originalItem.active_batches.length <= 1) && ci.allow_oversell && (
                          <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">
                            Oversell
                          </span>
                        )}
                        <div className="flex items-center gap-2 font-mono text-[16px] pt-0.5">
                          <CartItemPriceInput
                            initialPrice={ci.unit_price}
                            onPriceChange={(newPrice) => {
                              setDraftCartItems((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        unit_price: newPrice,
                                        base_unit_price: newPrice,
                                        is_custom_price: true,
                                      }
                                    : item
                                )
                              );
                            }}
                          />
                          {ci.is_custom_price && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1 rounded">
                              Custom Price
                            </span>
                          )}
                          {isOfferApplied ? (
                            <span title="Special Offer Applied">
                              <Flame className="h-4 w-4 text-orange-400 fill-orange-400/20" />
                            </span>
                          ) : isEveningApplied ? (
                            <span title="Evening Price Applied">
                              <Moon className="h-4 w-4 text-amber-400 fill-amber-400/20" />
                            </span>
                          ) : null}
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
                          onQuantityChange={(q) => handleCartItemQuantityChange(idx, q)}
                        />
                        <button
                          type="button"
                          onClick={() => handleCartItemQuantityChange(idx, ci.quantity + 1)}
                          className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      {originalItem && originalItem.alternate_units && (originalItem.alternate_units as any[]).length > 0 ? (
                        <select
                          value={ci.selected_unit || originalItem.unit_label || "piece"}
                          onChange={(e) => {
                            const newUnit = e.target.value;
                            const altUnit = (originalItem.alternate_units as any[])?.find((au: any) => au.unit_label === newUnit);
                            const factor = (newUnit !== (originalItem.unit_label || "piece") && altUnit) ? Number(altUnit.conversion_factor) || 1 : 1;
                            
                            const basePrice = ci.base_unit_price ?? ci.unit_price;
                            const baseMrp = ci.base_mrp ?? ci.mrp ?? basePrice;
                            
                            const newPrice = basePrice * factor;
                            const newMrp = Math.max(baseMrp * factor, newPrice);

                            setDraftCartItems((prev) =>
                              prev.map((item, i) =>
                                i === idx ? {
                                  ...item,
                                  selected_unit: newUnit,
                                  unit_price: newPrice,
                                  mrp: newMrp,
                                  base_unit_price: basePrice,
                                  base_mrp: baseMrp,
                                  is_custom_price: false,
                                } : item
                              )
                            );
                          }}
                          className="ml-1 text-[10px] bg-transparent border border-[var(--border-strong)] rounded px-1 py-0.5 max-w-[60px] truncate focus:outline-none"
                        >
                          <option value={originalItem.unit_label || "piece"}>{originalItem.unit_label || "piece"}</option>
                          {(originalItem.alternate_units as any[]).map((au: any) => (
                            <option key={au.unit_label} value={au.unit_label}>{au.unit_label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)] ml-1 truncate max-w-[60px]">
                          {ci.selected_unit || originalItem?.unit_label || "piece"}
                        </span>
                      )}
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
                  onClick={() => validateBeforeCreateBill(false)}
                  className="rounded-xl border border-[var(--border-strong)] py-3 text-base font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={draftCartItems.length === 0}
                  onClick={() => validateBeforeCreateBill(true)}
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
      {/* Oversell Deficit & Batch Splitting Modal */}
      {oversellState && (
        <OversellBatchModal
          isOpen={Boolean(oversellState)}
          onClose={() => setOversellState(null)}
          itemName={oversellState.itemName}
          selectedBatchId={oversellState.selectedBatchId}
          selectedBatchNumber={oversellState.selectedBatchNumber}
          availableQty={oversellState.availableQty}
          requestedQty={oversellState.requestedQty}
          activeBatches={oversellState.activeBatches}
          unallocatedBatchStockMap={unallocatedBatchStockMap}
          onApplyAllocations={(allocations) => {
            handleApplyBatchAllocations(oversellState.cartItemIndex, allocations);
          }}
        />
      )}
    </div>
  );
}
