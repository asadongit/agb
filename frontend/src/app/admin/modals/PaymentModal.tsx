/**
 * PaymentModal — Process Settlement Payment Modal (Cash / Direct UPI).
 *
 * Extracted from admin page.tsx (lines 6773-6973).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, CheckCircle2, CreditCard, DollarSign, Percent, QrCode, X } from "lucide-react";
import { apiRequest } from "../adminUtils";
import type { ManualBill } from "@/types";
import type { RestaurantProfile } from "../adminTypes";
import type { CustomerAnalytics } from "./CustomerInsightsModal";

type PaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onBackToDrawer?: () => void;
  onKeepAsDraft?: () => void;
  onDiscardBill?: () => void;
  paymentTargetBill: ManualBill | null;
  selectedPaymentMethod: "CASH" | "UPI";
  setSelectedPaymentMethod: (method: "CASH" | "UPI") => void;
  cashTendered: string;
  setCashTendered: (val: string) => void;
  handleMarkPaid: (cashDenominations?: Record<string, number>, redeemLoyaltyPoints?: number) => Promise<void>;
  onOpenDiscountModal?: (bill: ManualBill) => void;
  restaurant?: RestaurantProfile | null;
};

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export function PaymentModal({
  isOpen,
  onClose,
  onBackToDrawer,
  onKeepAsDraft,
  onDiscardBill,
  paymentTargetBill,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  cashTendered,
  setCashTendered,
  handleMarkPaid,
  onOpenDiscountModal,
  restaurant,
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

  const [isRestUpiConfirmed, setIsRestUpiConfirmed] = useState<boolean>(false);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics | null>(null);
  const [redeemPoints, setRedeemPoints] = useState<number>(0);

  // Fetch analytics for loyalty points
  useEffect(() => {
    if (isOpen && paymentTargetBill?.customer_phone) {
      const cleanPhone = paymentTargetBill.customer_phone.replace(/\D/g, "");
      if (cleanPhone.length >= 10) {
        apiRequest<CustomerAnalytics>(`/api/admin/customers/analytics?phone=${cleanPhone}&period=all_time`)
          .then(data => setCustomerAnalytics(data))
          .catch(() => setCustomerAnalytics(null));
      }
    } else {
      setCustomerAnalytics(null);
    }
  }, [isOpen, paymentTargetBill?.customer_phone]);

  // Bug 5 fix: Reset denomination counts and state whenever modal opens or bill changes
  useEffect(() => {
    if (isOpen) {
      setDenomCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setIsRestUpiConfirmed(false);
      setRedeemPoints(0);
    }
  }, [isOpen, paymentTargetBill?.id]);

  const denomTotal = useMemo(() => {
    return Object.entries(denomCounts).reduce((sum, [d, count]) => sum + Number(d) * count, 0);
  }, [denomCounts]);

  const targetCash = parseFloat(cashTendered) || 0;

  const subtotalAmount = useMemo(() => {
    if (!paymentTargetBill) return 0;
    if (paymentTargetBill.subtotal_amount && paymentTargetBill.subtotal_amount > 0) {
      return paymentTargetBill.subtotal_amount;
    }
    if (paymentTargetBill.items && paymentTargetBill.items.length > 0) {
      return paymentTargetBill.items.reduce((sum: number, item: any) => {
        const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
        return sum + price * (item.quantity || 1);
      }, 0);
    }
    return paymentTargetBill.total_amount || 0;
  }, [paymentTargetBill]);

  const calculatedDiscountRupees = useMemo(() => {
    if (!paymentTargetBill) return 0;
    const type = paymentTargetBill.discount_type;
    const val = paymentTargetBill.discount_value || 0;
    if (type === "PERCENT") {
      return subtotalAmount * (val / 100);
    } else if (type === "FLAT") {
      return val;
    } else if (type === "COMPLIMENTARY") {
      return subtotalAmount;
    } else if (subtotalAmount > paymentTargetBill.total_amount) {
      return subtotalAmount - paymentTargetBill.total_amount;
    }
    return 0;
  }, [paymentTargetBill, subtotalAmount]);

  const grandTotal = useMemo(() => {
    if (!paymentTargetBill) return 0;
    
    let base = paymentTargetBill.total_amount || 0;
    if (calculatedDiscountRupees > 0) {
      base = Math.max(0, subtotalAmount - calculatedDiscountRupees);
    }
    
    // Apply Loyalty Points Discount
    if (redeemPoints > 0 && restaurant?.loyalty_point_value_inr) {
      const loyaltyDiscount = redeemPoints * (parseFloat(String(restaurant.loyalty_point_value_inr)) || 0);
      base = Math.max(0, base - loyaltyDiscount);
    }
    
    return base;
  }, [paymentTargetBill, subtotalAmount, calculatedDiscountRupees, redeemPoints, restaurant]);

  const remainingNeeded = Math.max(0, grandTotal - targetCash);

  const remainingNeededAmt = useMemo(() => {
    const target = targetCash > grandTotal ? targetCash : grandTotal;
    return Math.max(0, target - denomTotal);
  }, [targetCash, grandTotal, denomTotal]);

  const smartHighlightedDenoms = useMemo(() => {
    if (remainingNeededAmt <= 0) return new Set<number>();

    const highlighted = new Set<number>();

    // Denominations above remaining, sorted smallest → largest
    const denomsAbove = [...DENOMINATIONS]
      .reverse()
      .filter((d) => d > remainingNeededAmt);

    // RULE 1: Any note ≤ remaining is ALWAYS possible (building exact change)
    DENOMINATIONS.forEach((d) => {
      if (d <= remainingNeededAmt) highlighted.add(d);
    });

    // RULE 2: For notes > remaining, allow them ONLY if they don't make previously tapped notes redundant
    denomsAbove.slice(0, 2).forEach((d) => {
      if (denomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (denomTotal + d) - grandTotal;
        // Non-redundancy condition: change must be strictly less than denomTotal
        if (resultingChange < denomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [remainingNeededAmt, denomTotal, grandTotal]);

  const smallestSingleNoteForGrandTotal = useMemo(() => {
    return [...DENOMINATIONS].reverse().find((d) => d >= grandTotal) || null;
  }, [grandTotal]);

  const handleAutoTapExact = (targetAmount: number) => {
    let rem = Math.floor(targetAmount);
    const newCounts: Record<number, number> = {
      500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
    };
    for (const d of DENOMINATIONS) {
      if (rem >= d) {
        const cnt = Math.floor(rem / d);
        newCounts[d] = cnt;
        rem %= d;
      }
    }
    setDenomCounts(newCounts);
    const totalTapped = Object.entries(newCounts).reduce((sum, [k, v]) => sum + Number(k) * v, 0);
    setCashTendered(totalTapped > 0 ? totalTapped.toString() : "");
  };

  // Validation rule: Cash denomination note tapping (denomTotal > 0) is MANDATORY for CASH payment
  const isPaymentValid = useMemo(() => {
    if (selectedPaymentMethod === "UPI") return true;
    if (denomTotal <= 0) return false;
    if (denomTotal >= grandTotal) return true;
    if (targetCash >= grandTotal) return true;
    return isRestUpiConfirmed && (denomTotal + Math.max(0, grandTotal - denomTotal)) >= grandTotal;
  }, [selectedPaymentMethod, denomTotal, grandTotal, isRestUpiConfirmed, targetCash]);

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
    } else {
      setCashTendered("");
    }
  };

  const handleResetNotes = () => {
    setDenomCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
    setCashTendered("");
    setIsRestUpiConfirmed(false);
    setRedeemPoints(0);
  };

  const onSettlePayment = async () => {
    await handleMarkPaid(denomCounts, redeemPoints);
    // Requirement 4: Once marked paid & settled, clear note denomination selection
    handleResetNotes();
    setCashTendered("");
  };

  const activeNotesList = Object.entries(denomCounts).filter(([_, count]) => count > 0);

  if (!isOpen || !paymentTargetBill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl max-h-[92vh] h-[90vh] flex flex-col rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
        {/* Header (Fixed Top flex-shrink-0) */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToDrawer || onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-primary)] hover:border-sky-500 hover:text-sky-400 transition shadow-xs cursor-pointer"
              title="Return back to item selection drawer"
            >
              <ArrowLeft className="h-4 w-4 text-sky-400" />
              <span>Back to Edit Items</span>
            </button>
            <div className="h-5 w-[1px] bg-[var(--border-subtle)] mx-0.5" />
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[var(--accent-brand)]" />
              <div>
                <h3 className="font-display text-base font-bold leading-none">Process Settlement Payment</h3>
                <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                  Bill #{paymentTargetBill.id.slice(0, 8).toUpperCase()} • Basket #{paymentTargetBill.basket_number}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDiscardBill || onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-400 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body: 2 Columns (Flex-1 min-h-0 overflow-hidden) */}
        <div className="flex-1 min-h-0 grid lg:grid-cols-12 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left Column: Bill Breakdown & Items */}
          <div className="lg:col-span-6 p-4 flex flex-col justify-between h-full min-h-0 overflow-hidden space-y-3">
            {/* Top Customer Info & Order Header */}
            <div className="space-y-2 flex-shrink-0">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Order Summary
                </span>
                <span className="text-[11px] font-mono font-bold text-[var(--accent-brand)] bg-[var(--accent-brand)]/10 px-2.5 py-0.5 rounded-md">
                  {paymentTargetBill.source ? paymentTargetBill.source.toUpperCase() : "POS BILL"}
                </span>
              </div>

              {/* Customer & Basket Info */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg-surface-elevated)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
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
            </div>

            {/* Middle Line Items List (ONLY THIS CONTAINER SCROLLS) */}
            {paymentTargetBill.items && paymentTargetBill.items.length > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1.5">
                <div className="sticky top-0 bg-[var(--bg-surface)] py-1 flex items-center justify-between px-3 text-[10px] uppercase font-bold text-[var(--text-muted)] border-b border-[var(--border-subtle)] z-10">
                  <span>Item Description</span>
                  <div className="flex items-center gap-6 font-mono">
                    <span className="w-16 text-right">MRP</span>
                    <span className="w-20 text-right">Selling Price</span>
                  </div>
                </div>
                {paymentTargetBill.items.map((item: any, idx: number) => {
                  const qty = item.quantity || 1;
                  const unitPrice = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
                  const lineSellingTotal = unitPrice * qty;
                  const itemMrpUnit = item.mrp !== undefined && item.mrp !== null ? (typeof item.mrp === "number" ? item.mrp : parseFloat(item.mrp) || unitPrice) : unitPrice;
                  const lineMrpTotal = itemMrpUnit * qty;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-bold text-[var(--text-primary)] truncate">
                          {qty}× {item.item_name || item.menu_item?.name || "Item"}
                        </span>
                        {item.is_complimentary && (
                          <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.2 rounded font-bold">
                            FREE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-6 font-mono">
                        <span className="text-[var(--text-muted)] line-through text-[11px] w-16 text-right">
                          ₹{lineMrpTotal.toFixed(2)}
                        </span>
                        <span className="font-bold text-[var(--text-primary)] w-20 text-right">
                          ₹{lineSellingTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-strong)] rounded-xl my-auto">
                Bill items recorded in active basket session
              </div>
            )}

            {/* Bottom Fixed Footer: Grand Total Box */}
            <div className="flex-shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3 space-y-1">
              <div className="flex justify-between text-xs text-[var(--text-muted)] font-mono">
                <span className="font-sans">Subtotal</span>
                <span>₹{subtotalAmount.toFixed(2)}</span>
              </div>

              {/* Loyalty Discount Summary */}
              {redeemPoints > 0 && restaurant?.loyalty_point_value_inr && (
                <div className="flex justify-between text-xs text-emerald-400 font-mono font-bold">
                  <span className="font-sans flex items-center gap-1.5">
                    Loyalty Redemptions
                    <span className="text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      ({redeemPoints} points)
                    </span>
                  </span>
                  <span>- ₹{(redeemPoints * (parseFloat(String(restaurant.loyalty_point_value_inr)) || 0)).toFixed(2)}</span>
                </div>
              )}

              {calculatedDiscountRupees > 0 && (
                <div className="flex justify-between text-xs text-sky-400 font-mono font-bold">
                  <span className="font-sans flex items-center gap-1.5">
                    Discount Applied
                    {paymentTargetBill.discount_type === "PERCENT" && (
                      <span className="text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                        ({paymentTargetBill.discount_value}% OFF)
                      </span>
                    )}
                    {paymentTargetBill.discount_type === "FLAT" && (
                      <span className="text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                        (Flat ₹{paymentTargetBill.discount_value})
                      </span>
                    )}
                    {paymentTargetBill.discount_type === "COMPLIMENTARY" && (
                      <span className="text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                        (Complimentary 100% OFF)
                      </span>
                    )}
                  </span>
                  <span>- ₹{calculatedDiscountRupees.toFixed(2)}</span>
                </div>
              )}

              {paymentTargetBill.tax_amount !== undefined && paymentTargetBill.tax_amount > 0 && (
                <div className="flex justify-between text-xs text-cyan-400 font-mono">
                  <span className="font-sans">GST Tax Component</span>
                  <span>₹{paymentTargetBill.tax_amount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-center border-t border-[var(--border-subtle)] pt-2 text-base font-bold font-mono text-[var(--text-primary)]">
                <span className="font-sans font-black text-xs uppercase tracking-wider">Grand Total Payable:</span>
                <span className="text-xl font-black text-sky-400">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Loyalty Points Input */}
            {customerAnalytics && (customerAnalytics.loyalty_points || 0) > 0 && restaurant?.loyalty_point_value_inr && parseFloat(String(restaurant.loyalty_point_value_inr)) > 0 && (
              <div className="flex-shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2 mt-3">
                <div className="flex items-center justify-between text-emerald-400 text-xs font-bold">
                  <span>Loyalty Points (Balance: {customerAnalytics.loyalty_points})</span>
                  <span>{parseFloat(String(restaurant.loyalty_point_value_inr)).toFixed(2)} INR/pt</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={customerAnalytics.loyalty_points}
                    value={redeemPoints || ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setRedeemPoints(Math.min(val, customerAnalytics.loyalty_points || 0));
                    }}
                    placeholder="Points to redeem"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 px-3 text-xs font-mono font-bold focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setRedeemPoints(customerAnalytics.loyalty_points || 0)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-500 text-[10px] font-bold hover:bg-emerald-500/30 transition whitespace-nowrap"
                  >
                    Max
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Settlement Method & Actions */}
          <div className="lg:col-span-6 p-4 flex flex-col justify-between h-full min-h-0 overflow-hidden space-y-3 bg-[var(--bg-surface)]">
            {/* Top Payment Method Selector (Compact Height) */}
            <div className="space-y-1.5 flex-shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Select Payment Method
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("CASH")}
                  className={`rounded-xl border p-2.5 flex items-center justify-center gap-2 text-xs font-bold transition ${
                    selectedPaymentMethod === "CASH"
                      ? "border-sky-500 bg-sky-500/10 text-sky-500 shadow-xs"
                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  <span>CASH PAYMENT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("UPI")}
                  className={`rounded-xl border p-2.5 flex items-center justify-center gap-2 text-xs font-bold transition ${
                    selectedPaymentMethod === "UPI"
                      ? "border-sky-500 bg-sky-500/10 text-sky-500 shadow-xs"
                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  <span>DIRECT UPI</span>
                </button>
              </div>
            </div>

            {/* Middle Cash Settlement Section (Compact Padding, No Scroll Required) */}
            {selectedPaymentMethod === "CASH" ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Cash Tendered by Customer (₹)
                  </label>
                  {denomTotal > 0 && (
                    <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                      From Notes: ₹{denomTotal}
                    </span>
                  )}
                </div>

                <input
                  type="number"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder={`e.g. ${Math.ceil(grandTotal / 100) * 100}`}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 px-3 text-sm font-mono font-bold focus:border-sky-500 outline-none"
                />

                {targetCash > 0 && denomTotal === 0 && (
                  <p className="text-[10px] text-amber-400 font-bold">
                    ⚠️ Note tapping is required. Tap note buttons below (₹500, ₹200, etc.) to validate payment.
                  </p>
                )}

                {/* Dynamic Interactive Cash Denomination Selector */}
                <div className="space-y-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Cash Denominations Tapped <span className="text-rose-400">*</span>
                    </span>
                    {remainingNeededAmt > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-sky-400">
                        Need ₹{remainingNeededAmt.toFixed(2)} more
                      </span>
                    )}
                  </div>

                  {/* Quick Auto-Tap Shortcuts Bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] whitespace-nowrap">
                      Quick Auto-Tap:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAutoTapExact(grandTotal)}
                      className="rounded-lg bg-sky-500/10 border border-sky-500/40 px-2 py-0.5 text-[10px] font-mono font-extrabold text-sky-500 hover:bg-sky-500 hover:text-white transition whitespace-nowrap"
                      title="Auto-fill exact note breakdown for Grand Total"
                    >
                      Exact ₹{grandTotal.toFixed(2)}
                    </button>

                    {smallestSingleNoteForGrandTotal && (
                      <button
                        type="button"
                        onClick={() => handleAutoTapExact(smallestSingleNoteForGrandTotal)}
                        className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)] hover:border-sky-500 hover:text-sky-500 transition whitespace-nowrap"
                        title={`Auto-fill single ₹${smallestSingleNoteForGrandTotal} note`}
                      >
                        1× ₹{smallestSingleNoteForGrandTotal} Note
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {DENOMINATIONS.map((d) => {
                      const isSmartHighlight = smartHighlightedDenoms.has(d);
                      const count = denomCounts[d] || 0;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleAddNote(d)}
                          className={`relative rounded-lg py-2 px-1 text-center font-mono transition text-sm font-black border-2 cursor-pointer ${
                            count > 0
                              ? "border-sky-500 bg-sky-500 text-white font-black ring-2 ring-sky-500/30 shadow-md"
                              : isSmartHighlight
                                ? "border-sky-500 bg-sky-500/10 text-sky-500 font-black ring-2 ring-sky-500/50 shadow-sm scale-[1.02] hover:bg-sky-500/20"
                                : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold opacity-60 hover:opacity-100"
                          }`}
                        >
                          ₹{d}
                          {count > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-white text-[9px] font-black border border-white shadow-md">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Denominations Breakdown Chips */}
                  {activeNotesList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">
                        Breakdown:
                      </span>
                      {activeNotesList.map(([denomStr, count]) => {
                        const denomNum = Number(denomStr);
                        return (
                          <span
                            key={denomStr}
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)]"
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

                {cashTendered && targetCash < grandTotal && (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-sky-300 font-bold font-mono">
                      <span>Shortfall / Cash Deficiency:</span>
                      <span>₹{remainingNeeded.toFixed(2)} short</span>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-primary)] cursor-pointer pt-1 border-t border-sky-500/20">
                      <input
                        type="checkbox"
                        checked={isRestUpiConfirmed}
                        onChange={(e) => setIsRestUpiConfirmed(e.target.checked)}
                        className="rounded h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300"
                      />
                      <span>Confirm remaining ₹{remainingNeeded.toFixed(2)} paid via UPI</span>
                    </label>
                  </div>
                )}

                {cashTendered && targetCash >= grandTotal && (
                  <div className="flex justify-between items-center text-xs font-mono font-bold border-t border-[var(--border-subtle)] pt-1.5 text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">Change to Return:</span>
                    <span className="text-sm font-black text-[var(--accent-brand)]">
                      ₹{(targetCash - grandTotal).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] space-y-2">
                <QrCode className="h-10 w-10 text-sky-400" />
                <p className="text-xs font-bold text-[var(--text-primary)]">Direct QR Code Payment</p>
                <p className="text-[11px] text-[var(--text-muted)]">Scan QR on customer screen or EDC device to collect ₹{grandTotal.toFixed(2)}</p>
              </div>
            )}

            {/* Bottom Actions Footer (Fixed at Bottom flex-shrink-0) */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)] flex-shrink-0">
              <button
                type="button"
                onClick={onDiscardBill || onClose}
                className="rounded-xl border border-[var(--border-strong)] px-3.5 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--border-subtle)] transition"
              >
                Cancel
              </button>
              <div className="flex items-center gap-1.5">
                {onOpenDiscountModal && (
                  <button
                    type="button"
                    onClick={() => onOpenDiscountModal(paymentTargetBill)}
                    className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-400 hover:bg-sky-500/20 transition flex items-center gap-1"
                    title="Apply Manager / Staff Discount"
                  >
                    <Percent className="h-3.5 w-3.5 text-sky-400" />
                    <span>Discount</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onKeepAsDraft || onClose}
                  className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:border-sky-500/40 hover:text-sky-400 transition flex items-center gap-1"
                  title="Park this bill as draft to resume later"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>Keep as Draft</span>
                </button>
                <button
                  type="button"
                  disabled={!isPaymentValid}
                  onClick={() => void onSettlePayment()}
                  className="rounded-xl bg-[var(--accent-brand)] px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-[var(--accent-brand-hover)] hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
