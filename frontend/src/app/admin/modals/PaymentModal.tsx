/**
 * PaymentModal — Process Settlement Payment Modal (Cash / Direct UPI).
 *
 * Extracted from admin page.tsx (lines 6773-6973).
 */

"use client";

import { useMemo, useState } from "react";
import { Bookmark, CheckCircle2, CreditCard, DollarSign, Percent, QrCode, X } from "lucide-react";
import type { ManualBill } from "@/types";

type PaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  paymentTargetBill: ManualBill | null;
  selectedPaymentMethod: "CASH" | "UPI";
  setSelectedPaymentMethod: (method: "CASH" | "UPI") => void;
  cashTendered: string;
  setCashTendered: (val: string) => void;
  handleMarkPaid: (cashDenominations?: Record<string, number>) => Promise<void>;
  onOpenDiscountModal?: (bill: ManualBill) => void;
};

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export function PaymentModal({
  isOpen,
  onClose,
  paymentTargetBill,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  cashTendered,
  setCashTendered,
  handleMarkPaid,
  onOpenDiscountModal,
}: PaymentModalProps) {
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });

  const denomTotal = useMemo(() => {
    return Object.entries(denomCounts).reduce((sum, [d, count]) => sum + Number(d) * count, 0);
  }, [denomCounts]);

  const targetCash = parseFloat(cashTendered) || 0;
  const remainingNeeded = Math.max(0, targetCash - denomTotal);

  const handleAddNote = (denom: number) => {
    const nextCounts = { ...denomCounts, [denom]: (denomCounts[denom] || 0) + 1 };
    setDenomCounts(nextCounts);
    const nextTotal = Object.entries(nextCounts).reduce((sum, [k, v]) => sum + Number(k) * v, 0);
    if (nextTotal > targetCash || targetCash === 0) {
      setCashTendered(nextTotal.toString());
    }
  };

  const handleRemoveNote = (denom: number) => {
    if ((denomCounts[denom] || 0) <= 0) return;
    const nextCounts = { ...denomCounts, [denom]: denomCounts[denom] - 1 };
    setDenomCounts(nextCounts);
    const nextTotal = Object.entries(nextCounts).reduce((sum, [k, v]) => sum + Number(k) * v, 0);
    if (nextTotal > 0) {
      setCashTendered(nextTotal.toString());
    }
  };

  const handleResetNotes = () => {
    setDenomCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
  };

  const activeNotesList = Object.entries(denomCounts).filter(([_, count]) => count > 0);

  if (!isOpen || !paymentTargetBill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl max-h-[95vh] h-[85vh] flex flex-col rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[var(--accent-brand)]" />
            <div>
              <h3 className="font-display text-lg font-bold">Process Settlement Payment</h3>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                Bill #{paymentTargetBill.id.slice(0, 8).toUpperCase()} • Basket #{paymentTargetBill.basket_number}
              </p>
            </div>
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
          {/* Left Column: Bill Breakdown & Items */}
          <div className="lg:col-span-7 p-6 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Order Summary
                </span>
                <span className="text-xs font-mono font-bold text-[var(--accent-brand)] bg-[var(--accent-brand)]/10 px-2.5 py-1 rounded-lg">
                  {paymentTargetBill.source ? paymentTargetBill.source.toUpperCase() : "POS BILL"}
                </span>
              </div>

              {/* Customer & Basket Info */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg-surface-elevated)] p-3.5 rounded-2xl border border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Customer</span>
                  <span className="font-bold text-[var(--text-primary)]">
                    {paymentTargetBill.customer_name || "Walk-In Customer"}
                  </span>
                  {paymentTargetBill.customer_phone && (
                    <span className="block text-[11px] text-[var(--text-muted)]">{paymentTargetBill.customer_phone}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Basket / Station</span>
                  <span className="font-bold text-[var(--text-primary)]">{paymentTargetBill.basket_number}</span>
                </div>
              </div>

              {/* Line Items Table if present */}
              {paymentTargetBill.items && paymentTargetBill.items.length > 0 ? (
                <div className="space-y-1.5 flex-1 max-h-[300px] overflow-y-auto pr-1">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Line Items</span>
                  {paymentTargetBill.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs"
                    >
                      <span className="font-bold text-[var(--text-primary)]">
                        {item.quantity}× {item.item_name || item.menu_item?.name || "Item"}
                      </span>
                      <span className="font-mono font-bold text-[var(--text-secondary)]">
                        ₹{((item.unit_price || 0) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-strong)] rounded-2xl">
                  Bill items recorded in active basket session
                </div>
              )}
            </div>

            {/* Grand Total Box */}
            <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4 space-y-1">
              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span>Subtotal</span>
                <span className="font-mono">₹{(paymentTargetBill.subtotal_amount || paymentTargetBill.total_amount).toFixed(2)}</span>
              </div>
              {paymentTargetBill.discount_value && paymentTargetBill.discount_value > 0 && (
                <div className="flex justify-between text-xs text-amber-600">
                  <span>Discount Applied</span>
                  <span className="font-mono">- ₹{paymentTargetBill.discount_value.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-[var(--border-subtle)] pt-2.5 text-base font-bold font-mono text-[var(--text-primary)]">
                <span className="font-sans font-black text-sm">Grand Total Payable:</span>
                <span className="text-xl font-black text-[var(--accent-brand)]">₹{paymentTargetBill.total_amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Settlement Method & Actions */}
          <div className="lg:col-span-5 p-6 space-y-6 flex flex-col justify-between bg-[var(--bg-surface)]">
            <div className="space-y-5">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Select Payment Method
              </span>

              {/* Payment Method Selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("CASH")}
                  className={`rounded-2xl border p-4 flex flex-col items-center justify-center gap-2 text-xs font-bold transition ${selectedPaymentMethod === "CASH"
                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] shadow-xs"
                    : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                    }`}
                >
                  <DollarSign className="h-5 w-5" />
                  CASH PAYMENT
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("UPI")}
                  className={`rounded-2xl border p-4 flex flex-col items-center justify-center gap-2 text-xs font-bold transition ${selectedPaymentMethod === "UPI"
                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] shadow-xs"
                    : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                    }`}
                >
                  <QrCode className="h-5 w-5" />
                  DIRECT UPI
                </button>
              </div>

              {/* Cash Tendered & Interactive Denomination Counter */}
              {selectedPaymentMethod === "CASH" && (
                <div className="space-y-3.5 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Cash Tendered by Customer (₹)
                    </label>
                    {denomTotal > 0 && (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        From Notes: ₹{denomTotal}
                      </span>
                    )}
                  </div>

                  <input
                    type="number"
                    value={cashTendered}
                    onChange={(e) => {
                      setCashTendered(e.target.value);
                      handleResetNotes();
                    }}
                    placeholder={`e.g. ${Math.ceil(paymentTargetBill.total_amount / 100) * 100}`}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 text-base font-mono font-bold focus:border-[var(--accent-brand)] outline-none"
                  />

                  {/* Dynamic Interactive Cash Denomination Selector */}
                  <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        Cash Denominations Tapped
                      </span>
                      {targetCash > 0 && remainingNeeded > 0 && denomTotal < targetCash && (
                        <span className="font-mono text-[10px] font-semibold text-amber-400">
                          Need ₹{remainingNeeded} more
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-5 gap-1.5">
                      {DENOMINATIONS.map((d) => {
                        const isSmartHighlight = targetCash > 0 && denomTotal < targetCash && d <= remainingNeeded;
                        const count = denomCounts[d] || 0;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => handleAddNote(d)}
                            className={`relative rounded-xl py-2 px-1 text-center font-mono transition text-xs font-bold border ${
                              isSmartHighlight
                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-md ring-1 ring-emerald-500/50 hover:bg-emerald-500/30 scale-[1.02]"
                                : count > 0
                                  ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-extrabold"
                                  : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-elevated)]"
                            }`}
                          >
                            ₹{d}
                            {count > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-black shadow-xs">
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Denominations Breakdown Chips */}
                    {activeNotesList.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">
                          Breakdown:
                        </span>
                        {activeNotesList.map(([denomStr, count]) => {
                          const denomNum = Number(denomStr);
                          return (
                            <span
                              key={denomStr}
                              className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[11px] font-mono font-bold text-[var(--text-primary)]"
                            >
                              ₹{denomStr} × {count}
                              <button
                                type="button"
                                onClick={() => handleRemoveNote(denomNum)}
                                className="ml-1 text-[var(--text-muted)] hover:text-rose-400"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={handleResetNotes}
                          className="ml-auto text-[10px] font-bold text-rose-400 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {cashTendered && parseFloat(cashTendered) >= paymentTargetBill.total_amount && (
                    <div className="flex justify-between items-center text-xs font-mono font-bold border-t border-[var(--border-subtle)] pt-2 text-[var(--text-primary)]">
                      <span className="text-[var(--text-muted)]">Change to Return:</span>
                      <span className="text-base font-black text-[var(--accent-brand)]">
                        ₹{(parseFloat(cashTendered) - paymentTargetBill.total_amount).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--border-subtle)] transition"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                {onOpenDiscountModal && (
                  <button
                    type="button"
                    onClick={() => onOpenDiscountModal(paymentTargetBill)}
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1.5"
                    title="Apply Manager / Staff Discount"
                  >
                    <Percent className="h-4 w-4 text-emerald-400" />
                    <span>Discount</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition flex items-center gap-1.5"
                  title="Park this bill as draft to resume later"
                >
                  <Bookmark className="h-4 w-4" />
                  <span>Keep as Draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleMarkPaid(denomCounts)}
                  className="rounded-xl bg-[var(--accent-brand)] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[var(--accent-brand-hover)] transition flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Mark Paid &amp; Settle</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
