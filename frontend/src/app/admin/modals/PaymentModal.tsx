/**
 * PaymentModal — Process Settlement Payment Modal (Cash / Direct UPI).
 *
 * Extracted from admin page.tsx (lines 6773-6973).
 */

"use client";

import { CheckCircle2, CreditCard, DollarSign, QrCode, X } from "lucide-react";
import type { ManualBill } from "@/types";

type PaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  paymentTargetBill: ManualBill | null;
  selectedPaymentMethod: "CASH" | "UPI";
  setSelectedPaymentMethod: (method: "CASH" | "UPI") => void;
  cashTendered: string;
  setCashTendered: (val: string) => void;
  handleMarkPaid: () => Promise<void>;
};

export function PaymentModal({
  isOpen,
  onClose,
  paymentTargetBill,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  cashTendered,
  setCashTendered,
  handleMarkPaid,
}: PaymentModalProps) {
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

              {/* Cash Tendered & Change Calculator */}
              {selectedPaymentMethod === "CASH" && (
                <div className="space-y-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4">
                  <label className="block space-y-1.5 text-xs font-bold">
                    <span className="text-[var(--text-muted)] uppercase tracking-wider">
                      Cash Tendered by Customer (₹)
                    </span>
                    <input
                      type="number"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={`e.g. ${Math.ceil(paymentTargetBill.total_amount / 100) * 100}`}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 text-base font-mono font-bold focus:border-[var(--accent-brand)] outline-none"
                    />
                  </label>

                  {/* Quick Presets */}
                  <div className="flex gap-1.5 pt-1">
                    {[
                      paymentTargetBill.total_amount,
                      100,
                      200,
                      500,
                    ].map((amt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCashTendered(amt.toString())}
                        className="flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1 text-[11px] font-mono font-bold text-[var(--text-secondary)] hover:border-[var(--accent-brand)]"
                      >
                        ₹{amt}
                      </button>
                    ))}
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
                className="rounded-xl border border-[var(--border-strong)] px-5 py-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleMarkPaid()}
                className="rounded-xl bg-[var(--accent-brand)] px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-[var(--accent-brand-hover)] transition flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Mark Paid &amp; Settle</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
