"use client";

import React, { useState, useMemo } from "react";
import { ArrowRight, Barcode, Calendar, History, Minus, Plus, Printer, RefreshCw, RotateCcw, Search, ShoppingBag, Trash2, UserCheck, X } from "lucide-react";
import type { AdminMenuItem } from "../adminTypes";
import type { ManualBill } from "@/types";
import type { DraftCartItem } from "./CreateBillDrawer";

type CustomerReturnsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  billsList: ManualBill[];
  menuItems: AdminMenuItem[];
  onRequestReturn: (returnData: any) => Promise<void>;
};

export function CustomerReturnsModal({
  isOpen,
  onClose,
  billsList,
  menuItems,
  onRequestReturn,
}: CustomerReturnsModalProps) {
  const [lookupTab, setLookupTab] = useState<"USER_HISTORY" | "ITEM_SELECTION" | "INVOICE_NO">("USER_HISTORY");

  // Search queries
  const [customerSearch, setCustomerSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Selected Bill
  const [selectedBill, setSelectedBill] = useState<ManualBill | null>(null);

  // Return quantities: item_id -> quantity to return
  const [returnItemsMap, setReturnItemsMap] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("DEFECTIVE_PRODUCT");

  // Exchange items to add
  const [exchangeItems, setExchangeItems] = useState<DraftCartItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<"CASH" | "UPI" | "STORE_CREDIT">("CASH");

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

  // Filter bills by item search
  const filteredItemBills = billsList.filter((b) => {
    if (!itemSearch.trim()) return true;
    const q = itemSearch.toLowerCase();
    return b.items?.some((it: any) => (it.item_name || "").toLowerCase().includes(q));
  });

  // Filter bill by invoice ID
  const matchingInvoiceBill = billsList.find((b) => {
    if (!invoiceSearch.trim()) return false;
    const q = invoiceSearch.toLowerCase().trim();
    return b.id.toLowerCase().includes(q) || (b.basket_number && b.basket_number.toLowerCase().includes(q));
  });

  // Calculate return credit total
  const returnCreditTotal = selectedBill
    ? (selectedBill.items || []).reduce((sum: number, item: any) => {
        const qty = returnItemsMap[item.id] || 0;
        const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
        return sum + qty * price;
      }, 0)
    : 0;

  // Calculate exchange items total
  const exchangeItemsTotal = exchangeItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  // Net payable / refundable
  const netBalance = exchangeItemsTotal - returnCreditTotal;

  const handleToggleReturnItem = (itemId: string, maxQty: number) => {
    setReturnItemsMap((prev) => {
      const current = prev[itemId] || 0;
      if (current >= maxQty) {
        const next = { ...prev };
        delete next[itemId];
        return next;
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
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-5xl rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl flex flex-col h-[88vh] max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-sky-400" />
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Returns &amp; Exchanges with Bill
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content: 2 Columns */}
        <div className="flex-1 overflow-y-auto grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left Column: 3 Lookup Options & Bill Picker */}
          <div className="lg:col-span-6 p-5 space-y-4 flex flex-col">
            {/* 3 Lookup Options Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)]">
              <button
                type="button"
                onClick={() => setLookupTab("USER_HISTORY")}
                className={`rounded-xl py-2 px-2 text-xs font-bold transition flex flex-col items-center gap-1 ${
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
                onClick={() => setLookupTab("ITEM_SELECTION")}
                className={`rounded-xl py-2 px-2 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "ITEM_SELECTION"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                <span>2. Item Selection</span>
              </button>
              <button
                type="button"
                onClick={() => setLookupTab("INVOICE_NO")}
                className={`rounded-xl py-2 px-2 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "INVOICE_NO"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Barcode className="h-4 w-4" />
                <span>3. Invoice No</span>
              </button>
            </div>

            {/* Search Input based on active lookup option */}
            {lookupTab === "USER_HISTORY" && (
              <div className="relative">
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

            {lookupTab === "ITEM_SELECTION" && (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search item name or scan product barcode..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-sky-400 outline-none"
                />
              </div>
            )}

            {lookupTab === "INVOICE_NO" && (
              <div className="relative">
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

            {/* List of matching bills */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[300px]">
              {lookupTab === "INVOICE_NO" ? (
                matchingInvoiceBill ? (
                  <div
                    onClick={() => {
                      setSelectedBill(matchingInvoiceBill);
                      setReturnItemsMap({});
                    }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition ${
                      selectedBill?.id === matchingInvoiceBill.id
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
              ) : (lookupTab === "USER_HISTORY" ? filteredUserBills : filteredItemBills).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-12">No matching paid bills found.</p>
              ) : (
                (lookupTab === "USER_HISTORY" ? filteredUserBills : filteredItemBills).map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => {
                      setSelectedBill(bill);
                      setReturnItemsMap({});
                    }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition space-y-1 ${
                      selectedBill?.id === bill.id
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
                      <span>{new Date(bill.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Return Items Selector & Exchange Counter */}
          <div className="lg:col-span-6 p-5 space-y-5 flex flex-col justify-between">
            {!selectedBill ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--text-muted)] text-center space-y-2 py-16">
                <RotateCcw className="h-8 w-8 text-sky-400/60 animate-bounce" />
                <p className="font-semibold text-sm">Select a bill from the left to initiate Return or Exchange</p>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-y-auto">
                <div className="border-b border-[var(--border-subtle)] pb-2 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Selected Bill</span>
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
                    Select Line Items to Return:
                  </span>
                  {(selectedBill.items || []).map((item: any) => {
                    const retQty = returnItemsMap[item.id] || 0;
                    const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
                    const maxQty = typeof item.quantity === "number" ? item.quantity : parseFloat(item.quantity) || 1;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-3 flex items-center justify-between text-xs transition ${
                          retQty > 0
                            ? "border-sky-500/40 bg-sky-500/10"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
                        }`}
                      >
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">{item.item_name}</p>
                          <p className="font-mono text-[11px] text-[var(--text-muted)]">
                            ₹{price.toFixed(2)} × {maxQty} bought
                          </p>
                        </div>

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
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-bold text-[var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedBill || returnCreditTotal <= 0}
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
