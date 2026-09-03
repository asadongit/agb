"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Barcode,
  Eye,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  UserCheck,
  X,
  FileText,
} from "lucide-react";
import type { AdminMenuItem } from "../adminTypes";
import type { ManualBill } from "@/types";
import type { DraftCartItem } from "./CreateBillDrawer";
import { generateReturnReceiptPDF } from "@/lib/pdfGenerator";
import { apiRequest , parseUTCDate} from "../adminUtils";

type DirectReturnItem = {
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
};

type CustomerReturnsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  billsList: ManualBill[];
  menuItems: AdminMenuItem[];
  onRequestReturn: (returnData: any) => Promise<void>;
  restaurantName?: string;
  restaurant?: any;
};

export function CustomerReturnsModal({
  isOpen,
  onClose,
  billsList,
  menuItems,
  onRequestReturn,
  restaurantName = "ApnaGreen Basket",
  restaurant,
}: CustomerReturnsModalProps) {
  const [lookupTab, setLookupTab] = useState<"USER_HISTORY" | "INVOICE_NO" | "RETURN_HISTORY">("USER_HISTORY");

  // Search queries
  const [customerSearch, setCustomerSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Mode: Bill-referenced return vs Direct un-billed return
  const [returnMode, setReturnMode] = useState<"BILL_REFERENCED" | "DIRECT_UNBILLED">("BILL_REFERENCED");

  // Selected Bill for bill-referenced return
  const [selectedBill, setSelectedBill] = useState<ManualBill | null>(null);

  // Return quantities for bill items: item_id -> quantity to return
  const [returnItemsMap, setReturnItemsMap] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("DEFECTIVE_PRODUCT");

  // Direct return items (when customer has no original bill)
  const [directReturnItems, setDirectReturnItems] = useState<DirectReturnItem[]>([]);
  const [directCustomerName, setDirectCustomerName] = useState("");
  const [directCustomerPhone, setDirectCustomerPhone] = useState("");

  // Exchange items to add
  const [exchangeItems, setExchangeItems] = useState<DraftCartItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<"CASH" | "UPI" | "STORE_CREDIT">("CASH");

  // Cash Denominations for refund (Given to Customer)
  const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const [refundCashDenoms, setRefundCashDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });
  
  // Cash Denominations Inward (Received from Customer)
  const [inwardCashDenoms, setInwardCashDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });

  const handleRefundDenomChange = (denom: number, change: number) => {
    setRefundCashDenoms(prev => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + change);
      return { ...prev, [denom]: next };
    });
  };

  const handleInwardDenomChange = (denom: number, change: number) => {
    setInwardCashDenoms(prev => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + change);
      return { ...prev, [denom]: next };
    });
  };

  const refundDenomTotal = Object.entries(refundCashDenoms).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);
  const inwardDenomTotal = Object.entries(inwardCashDenoms).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);

  // Return bills history state
  const [returnsHistoryList, setReturnsHistoryList] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Calculate return credit total (Bill-referenced vs Direct unbilled)
  const returnCreditTotal = returnMode === "BILL_REFERENCED" && selectedBill
    ? (selectedBill.items || []).reduce((sum: number, item: any) => {
        const qty = returnItemsMap[item.id] || 0;
        const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
        return sum + qty * price;
      }, 0)
    : directReturnItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  // Calculate exchange items total
  const exchangeItemsTotal = exchangeItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  // Net payable / refundable
  const netBalance = exchangeItemsTotal - returnCreditTotal;
  const totalRefundAmount = netBalance < 0 ? Math.abs(netBalance) : 0;
  const targetRefundAmt = totalRefundAmount;

  const currentNetRefundGiven = refundDenomTotal - inwardDenomTotal;

  const remainingNeededOutward = useMemo(() => {
    return Math.max(0, targetRefundAmt - currentNetRefundGiven);
  }, [targetRefundAmt, currentNetRefundGiven]);

  const remainingNeededInward = useMemo(() => {
    return Math.max(0, currentNetRefundGiven - targetRefundAmt);
  }, [targetRefundAmt, currentNetRefundGiven]);

  const smartHighlightedDenoms = useMemo(() => {
    if (remainingNeededOutward <= 0) return new Set<number>();

    const highlighted = new Set<number>();
    const denomsAbove = [...DENOMINATIONS].reverse().filter((d) => d > remainingNeededOutward);

    DENOMINATIONS.forEach((d) => {
      if (d <= remainingNeededOutward) highlighted.add(d);
    });

    denomsAbove.slice(0, 2).forEach((d) => {
      if (refundDenomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (currentNetRefundGiven + d) - targetRefundAmt;
        if (resultingChange < refundDenomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [remainingNeededOutward, currentNetRefundGiven, targetRefundAmt, refundDenomTotal]);

  const smartHighlightedInwardDenoms = useMemo(() => {
    if (remainingNeededInward <= 0) return new Set<number>();

    const highlighted = new Set<number>();
    const denomsAbove = [...DENOMINATIONS].reverse().filter((d) => d > remainingNeededInward);

    DENOMINATIONS.forEach((d) => {
      if (d <= remainingNeededInward) highlighted.add(d);
    });

    denomsAbove.slice(0, 2).forEach((d) => {
      if (inwardDenomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (inwardDenomTotal + d) - remainingNeededInward;
        if (resultingChange < inwardDenomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [remainingNeededInward, inwardDenomTotal]);

  // Fetch return bills history when tab 3 (Return Log) is opened
  useEffect(() => {
    if (isOpen && lookupTab === "RETURN_HISTORY") {
      void fetchReturnsHistory();
    }
  }, [isOpen, lookupTab]);

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedBill(null);
      setReturnItemsMap({});
      setReturnReason("DEFECTIVE_PRODUCT");
      setRefundMethod("CASH");
      setRefundCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setInwardCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setDirectReturnItems([]);
      setExchangeItems([]);
      setCustomerSearch("");
      setInvoiceSearch("");
      setLookupTab("USER_HISTORY");
    }
  }, [isOpen]);

  const fetchReturnsHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await apiRequest<any[]>("/api/billing/returns");
      setReturnsHistoryList(data || []);
    } catch (err) {
      console.error("Error loading returns history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  // Filter bills by customer search
  const filteredUserBills = billsList.filter((b) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
      (b.customer_phone && b.customer_phone.includes(q))
    );
  });

  // Filter bill by invoice ID
  const matchingInvoiceBill = billsList.find((b) => {
    if (!invoiceSearch.trim()) return false;
    const q = invoiceSearch.toLowerCase().trim();
    return b.id.toLowerCase().includes(q) || (b.basket_number && b.basket_number.toLowerCase().includes(q));
  });

  const handleToggleReturnItem = (itemId: string, maxQty: number) => {
    setReturnItemsMap((prev) => {
      const current = prev[itemId] || 0;
      if (current >= maxQty) {
        return prev;
      }
      return { ...prev, [itemId]: current + 1 };
    });
  };

  const handleSubReturnItem = (itemId: string) => {
    setReturnItemsMap((prev) => {
      const current = prev[itemId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: current - 1 };
    });
  };

  const handleSubmitReturn = async () => {
    if (returnMode === "BILL_REFERENCED") {
      if (!selectedBill) return;
      const returnItemsPayload = Object.entries(returnItemsMap).map(([order_item_id, quantity]) => ({
        order_item_id,
        quantity,
        reason: returnReason,
      }));

      if (returnItemsPayload.length === 0) {
        alert("Please select at least one item to return.");
        return;
      }

      await onRequestReturn({
        order_id: selectedBill.id,
        return_items: returnItemsPayload,
        exchange_items: exchangeItems,
        refund_payment_method: refundMethod,
        refund_cash_denominations: refundMethod === "CASH" ? refundCashDenoms : undefined,
        inward_cash_denominations: refundMethod === "CASH" ? inwardCashDenoms : undefined,
        notes: returnReason,
      });
    } else {
      // Direct Unbilled Return
      if (directReturnItems.length === 0) {
        alert("Please add at least one store item for direct return.");
        return;
      }

      const returnItemsPayload = directReturnItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        reason: returnReason,
      }));

      await onRequestReturn({
        order_id: null,
        customer_name: directCustomerName.trim() || null,
        customer_phone: directCustomerPhone.trim() || null,
        return_items: returnItemsPayload,
        exchange_items: exchangeItems,
        refund_payment_method: refundMethod,
        refund_cash_denominations: refundMethod === "CASH" ? refundCashDenoms : undefined,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-5xl rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl flex flex-col h-[88vh] max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-sky-400" />
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Returns &amp; Exchanges
            </h3>
            {returnMode === "DIRECT_UNBILLED" && (
              <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
                Direct Unbilled Return
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content Grid: Fixed Containers */}
        <div className="flex-1 overflow-hidden grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left Column: Fixed Header/Tabs/Search, Only Middle Box Scrollable */}
          <div className="lg:col-span-6 p-5 flex flex-col h-full overflow-hidden space-y-4">
            {/* 3 Lookup Options Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)] flex-shrink-0">
              <button
                type="button"
                onClick={() => setLookupTab("USER_HISTORY")}
                className={`rounded-xl py-2 px-1 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "USER_HISTORY"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <UserCheck className="h-4 w-4" />
                <span>1. User History</span>
              </button>
              <button
                type="button"
                onClick={() => setLookupTab("INVOICE_NO")}
                className={`rounded-xl py-2 px-1 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "INVOICE_NO"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Barcode className="h-4 w-4" />
                <span>2. Invoice No</span>
              </button>
              <button
                type="button"
                onClick={() => setLookupTab("RETURN_HISTORY")}
                className={`rounded-xl py-2 px-1 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "RETURN_HISTORY"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>3. Return Log</span>
              </button>
            </div>

            {/* Search Input based on active lookup option */}
            {lookupTab === "USER_HISTORY" && (
              <div className="relative flex-shrink-0">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search customer phone or name..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-sky-400 outline-none"
                />
              </div>
            )}

            {lookupTab === "INVOICE_NO" && (
              <div className="relative flex-shrink-0">
                <Barcode className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Enter or scan Bill / Invoice ID (e.g. 59C8D...)"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs font-mono text-[var(--text-primary)] focus:border-sky-400 outline-none"
                />
              </div>
            )}

            {/* Scrollable Middle List Box */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {lookupTab === "RETURN_HISTORY" ? (
                isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-12 text-xs text-[var(--text-muted)] space-y-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                    <span>Loading Return Bills History...</span>
                  </div>
                ) : returnsHistoryList.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] text-center py-12">No past return bills found.</p>
                ) : (
                  returnsHistoryList.map((ret) => (
                    <div
                      key={ret.id}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-2"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-sky-400">{ret.return_number}</span>
                        <span className="font-mono font-bold text-[var(--text-primary)]">
                          ₹{ret.total_refund_amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)]">
                        <span>Orig Bill: {ret.original_bill_number}</span>
                        <span>{parseUTCDate(ret.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
                        <span className="text-[11px] text-[var(--text-secondary)] font-semibold">
                          {ret.customer_name || "Walk-In Customer"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "view")}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-bold text-sky-400 hover:bg-sky-500/20"
                          >
                            <Eye className="h-3 w-3" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "download")}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-bold text-[var(--text-primary)] hover:border-sky-400"
                          >
                            <Printer className="h-3 w-3" />
                            <span>Print</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : lookupTab === "INVOICE_NO" ? (
                matchingInvoiceBill ? (
                  <div
                    onClick={() => {
                      setReturnMode("BILL_REFERENCED");
                      setSelectedBill(matchingInvoiceBill);
                      setReturnItemsMap({});
                    }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition ${
                      selectedBill?.id === matchingInvoiceBill.id && returnMode === "BILL_REFERENCED"
                        ? "border-sky-500/40 bg-sky-500/10"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-sky-400/60"
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono font-bold text-sky-400">
                        Bill #{matchingInvoiceBill.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="font-mono font-bold">₹{matchingInvoiceBill.total_amount.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] font-bold mt-1">
                      {matchingInvoiceBill.customer_name || "Walk-In Customer"} ({matchingInvoiceBill.customer_phone || "No Phone"})
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] text-center py-12">
                    Enter a valid invoice ID to view bill details.
                  </p>
                )
              ) : filteredUserBills.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-12">No matching paid bills found.</p>
              ) : (
                filteredUserBills.map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => {
                      setReturnMode("BILL_REFERENCED");
                      setSelectedBill(bill);
                      setReturnItemsMap({});
                    }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition space-y-1 ${
                      selectedBill?.id === bill.id && returnMode === "BILL_REFERENCED"
                        ? "border-sky-500/40 bg-sky-500/10"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-sky-400/60"
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono font-bold text-sky-400">
                        Bill #{bill.id.slice(0, 8).toUpperCase()} • Basket #{bill.basket_number}
                      </span>
                      <span className="font-mono font-bold text-[var(--text-primary)]">
                        ₹{bill.total_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)]">
                      <span>{bill.customer_name || "Walk-In"} ({bill.customer_phone || "N/A"})</span>
                      <span>{parseUTCDate(bill.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Return Items Selector & Summary (Fixed Header/Footer, Middle Scrollable) */}
          <div className="lg:col-span-6 p-5 flex flex-col h-full overflow-hidden justify-between space-y-4">
            {!selectedBill ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--text-muted)] text-center space-y-2 py-16">
                <RotateCcw className="h-8 w-8 text-sky-400/60 animate-bounce" />
                <p className="font-semibold text-sm">Select a bill from the left to initiate Return or Exchange</p>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1">
                {/* Header Block */}
                <div className="border-b border-[var(--border-subtle)] pb-2 flex justify-between items-center flex-shrink-0">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Selected Original Bill
                    </span>
                    <span className="font-mono font-bold text-sky-400 text-xs">
                      #{selectedBill.id.slice(0, 8).toUpperCase()} • {selectedBill.customer_name || "Walk-In"}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[var(--text-primary)]">
                    Original Total: ₹{selectedBill.total_amount.toFixed(2)}
                  </span>
                </div>

                {/* Line Items to select for return */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                    Select Bill Items to Return:
                  </span>

                  {(selectedBill.items || []).map((item: any) => {
                    const retQty = returnItemsMap[item.id] || 0;
                    const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
                    const totalQty = typeof item.quantity === "number" ? item.quantity : parseFloat(item.quantity) || 1;
                    const returnedQty = typeof item.returned_quantity === "number" ? item.returned_quantity : parseFloat(item.returned_quantity) || 0;
                    const maxQty = Math.max(0, totalQty - returnedQty);
                    const isFullyReturned = maxQty <= 0;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-3 flex items-center justify-between text-xs transition ${
                          retQty > 0
                            ? "border-sky-500/40 bg-sky-500/10"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
                        } ${isFullyReturned ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">{item.item_name} {isFullyReturned && "(Fully Returned)"}</p>
                          <p className="font-mono text-[11px] text-[var(--text-muted)]">
                            ₹{price.toFixed(2)} × {totalQty} bought {returnedQty > 0 && `(${returnedQty} returned)`}
                          </p>
                        </div>

                        {!isFullyReturned && (
                          <div className="flex items-center gap-2">
                            {retQty > 0 && (
                              <button
                                type="button"
                                onClick={() => handleSubReturnItem(item.id)}
                                className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                            )}
                            <span className="font-mono font-bold w-6 text-center text-sky-400">
                              {retQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleReturnItem(item.id, maxQty)}
                              className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Return Reason & Refund Method */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Return Reason</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <option value="DEFECTIVE_PRODUCT">Defective / Damaged</option>
                      <option value="EXPIRED_ITEM">Expired Item</option>
                      <option value="WRONG_ITEM">Wrong Item Purchased</option>
                      <option value="CUSTOMER_CHANGE_OF_MIND">Customer Changed Mind</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Refund Method</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <option value="CASH">Cash Refund</option>
                      <option value="UPI">UPI Refund</option>
                      <option value="STORE_CREDIT">Store Credit Voucher</option>
                    </select>
                  </div>
                </div>

                {refundMethod === "CASH" && (
                  <div className="pt-2 border-t border-[var(--border-subtle)] space-y-4">
                    {/* Outward Cash Section (Refund Given) */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-bold text-[var(--text-muted)] uppercase">
                        <span className="flex items-center gap-2">
                          Refund Given (Outwards)
                          {remainingNeededOutward > 0 && (
                            <span className="font-mono text-[10px] font-semibold text-sky-400 normal-case bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                              Need ₹{remainingNeededOutward.toFixed(2)}
                            </span>
                          )}
                        </span>
                        <span className="text-sky-400">Total: ₹{refundDenomTotal}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {DENOMINATIONS.map((d) => {
                          const isSmartHighlight = smartHighlightedDenoms.has(d);
                          const count = refundCashDenoms[d] || 0;
                          return (
                            <div
                              key={`outward-${d}`}
                              className={`relative rounded-lg flex font-mono transition font-black border-2 ${
                                count > 0
                                  ? "border-sky-500 bg-sky-500 text-white ring-2 ring-sky-500/30 shadow-md"
                                  : isSmartHighlight
                                    ? "border-sky-500 bg-sky-500/10 text-sky-500 ring-2 ring-sky-500/50 shadow-sm scale-[1.02] hover:bg-sky-500/20"
                                    : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-60 hover:opacity-100"
                              }`}
                            >
                              {count > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRefundDenomChange(d, -1);
                                  }}
                                  className="flex items-center justify-center px-1.5 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md"
                                  title={`Remove 1× ₹${d}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRefundDenomChange(d, 1)}
                                className="flex-1 py-1.5 px-2 text-center text-sm"
                              >
                                ₹{d}
                              </button>
                              {count > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-900 text-white text-xs font-black border border-white pointer-events-none">
                                  {count}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inward Cash Section (Cash Received) */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-bold text-[var(--text-muted)] uppercase">
                        <span className="flex items-center gap-2">
                          Cash Received (Inwards)
                          {remainingNeededInward > 0 && (
                            <span className="font-mono text-[10px] font-semibold text-emerald-400 normal-case bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              Need ₹{remainingNeededInward.toFixed(2)}
                            </span>
                          )}
                        </span>
                        <span className="text-emerald-400">Total: ₹{inwardDenomTotal}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {DENOMINATIONS.map((d) => {
                          const isSmartHighlight = smartHighlightedInwardDenoms.has(d);
                          const count = inwardCashDenoms[d] || 0;
                          return (
                            <div
                              key={`inward-${d}`}
                              className={`relative rounded-lg flex font-mono transition font-black border-2 ${
                                count > 0
                                  ? "border-emerald-500 bg-emerald-500 text-white shadow-md ring-2 ring-emerald-500/30"
                                  : isSmartHighlight
                                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 ring-2 ring-emerald-500/50 shadow-sm scale-[1.02] hover:bg-emerald-500/20"
                                    : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-60 hover:opacity-100"
                              }`}
                            >
                              {count > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleInwardDenomChange(d, -1);
                                  }}
                                  className="flex items-center justify-center px-1.5 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleInwardDenomChange(d, 1)}
                                className="flex-1 py-1.5 px-2 text-center text-sm"
                              >
                                ₹{d}
                              </button>
                              {count > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-900 text-white text-xs font-black border border-white pointer-events-none">
                                  {count}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Balance */}
                <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-[var(--text-muted)]">
                    <span>Return Credit Value:</span>
                    <span className="font-bold text-sky-400">₹{returnCreditTotal.toFixed(2)}</span>
                  </div>
                  {exchangeItemsTotal > 0 && (
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Exchange Items Total:</span>
                      <span className="font-bold text-[var(--text-primary)]">₹{exchangeItemsTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-[var(--border-subtle)] pt-2 font-bold font-sans">
                    <span>{netBalance > 0 ? "Additional Payable by Customer:" : "Net Refund / Credit Amount:"}</span>
                    <span className="font-mono text-base font-black text-sky-400">₹{Math.abs(netBalance).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Action */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={returnCreditTotal <= 0}
                onClick={handleSubmitReturn}
                className="rounded-xl bg-sky-500 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-sky-600 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Process Return &amp; Restock</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
