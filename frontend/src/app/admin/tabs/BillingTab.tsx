/**
 * BillingTab — Billing & Point of Sale (POS) tab for the admin dashboard.
 *
 * Displays pending discount approvals queue, bill history table with search & filters,
 * and triggers for Create Bill, Discount, and Payment modals.
 * Extracted from admin page.tsx (lines 4180-4468).
 */

"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Percent,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  Eye,
  Download,
  FileEdit,
  RotateCcw,
  Banknote,
  Calendar,
  Trash2,
  X,
} from "lucide-react";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { DiscountApproval, ManualBill, RolePermissions } from "@/types";
import type { RestaurantProfile, AdminMenuItem } from "../adminTypes";
import { apiRequest , parseUTCDate} from "../adminUtils";
import { CustomerReturnsModal } from "../modals/CustomerReturnsModal";
import { ReturnSuccessModal } from "../modals/ReturnSuccessModal";
import { DeleteBillModal } from "../modals/DeleteBillModal";

type BillingTabProps = {
  restaurant: RestaurantProfile | null;
  staffPermissions: RolePermissions | null;
  isLoadingBilling: boolean;
  loadBillingData: () => Promise<void>;
  pendingApprovals: DiscountApproval[];
  handleResolveApproval: (approvalId: string, approve: boolean) => Promise<void>;
  billsList: ManualBill[];
  menuItems?: AdminMenuItem[];
  billingStatusFilter: any;
  setBillingStatusFilter: (status: any) => void;
  billingSearchQuery: string;
  setBillingSearchQuery: (query: string) => void;

  // Modal triggers
  onOpenCreateBill: () => void;
  onResumeDraft: (bill: ManualBill) => void;
  onOpenDiscountModal: (bill: ManualBill) => void;
  onOpenPaymentModal: (bill: ManualBill) => void;
  onEditCompletedBill?: (bill: ManualBill) => void;
  onDeleteBill?: (billId: string) => Promise<void>;
};

export function BillingTab({
  restaurant,
  staffPermissions,
  isLoadingBilling,
  loadBillingData,
  pendingApprovals,
  handleResolveApproval,
  billsList,
  menuItems = [],
  billingStatusFilter,
  setBillingStatusFilter,
  billingSearchQuery,
  setBillingSearchQuery,
  onOpenCreateBill,
  onResumeDraft,
  onOpenDiscountModal,
  onOpenPaymentModal,
  onEditCompletedBill,
  onDeleteBill,
}: BillingTabProps) {
  const [returnsModalOpen, setReturnsModalOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<ManualBill | null>(null);
  const [successReturnData, setSuccessReturnData] = useState<any | null>(null);
  const [showReturnSuccessModal, setShowReturnSuccessModal] = useState(false);
  const [showDenomWidget, setShowDenomWidget] = useState(false);
  
  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === "+" || e.code === "NumpadAdd") {
        e.preventDefault();
        onOpenCreateBill();
      } else if (e.key === "/") {
        e.preventDefault();
        document.getElementById("billing-search-input")?.focus();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        const recentBill = billsList.find(b => b.status === "PAID" || b.status === "COMPLETED");
        if (recentBill) {
          generateReceiptPDF(recentBill as any, restaurant?.name || "RESTAURANT", {}, restaurant || {}, "view");
        }
      }
    };
    
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onOpenCreateBill, billsList, restaurant]);
  
  const [liveDrawerData, setLiveDrawerData] = useState<{
    denominations: Record<string, number>;
    total_balance: number;
  } | null>(null);

  // Drawer Transaction Modal State
  const [drawerTxModalOpen, setDrawerTxModalOpen] = useState(false);
  const [drawerTxType, setDrawerTxType] = useState<"MANUAL_DEPOSIT" | "MANUAL_WITHDRAWAL">("MANUAL_DEPOSIT");
  const [drawerTxDenoms, setDrawerTxDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });
  const [drawerTxNotes, setDrawerTxNotes] = useState("");
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  const fetchLiveDrawer = async () => {
    try {
      const data = await apiRequest<{
        denominations: Record<string, number>;
        total_balance: number;
      }>("/api/billing/drawer-state");
      setLiveDrawerData(data);
    } catch (err) {
      console.error("Error loading live drawer:", err);
    }
  };

  useEffect(() => {
    if (showDenomWidget) {
      void fetchLiveDrawer();
    }
  }, [showDenomWidget]);

  const handleDrawerTxSubmit = async () => {
    setIsSubmittingTx(true);
    try {
      await apiRequest("/api/billing/drawer-transaction", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: drawerTxType,
          denominations: drawerTxDenoms,
          notes: drawerTxNotes || null,
        }),
      });
      setDrawerTxModalOpen(false);
      setDrawerTxNotes("");
      setDrawerTxDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      void fetchLiveDrawer();
    } catch (err: any) {
      alert(err.message || "Failed to process drawer transaction");
    } finally {
      setIsSubmittingTx(false);
    }
  };

  const handleProcessCustomerReturn = async (returnData: any) => {
    try {
      const res = await apiRequest<any>("/api/billing/returns", {
        method: "POST",
        body: JSON.stringify(returnData),
      });
      setSuccessReturnData(res);
      setReturnsModalOpen(false);
      setShowReturnSuccessModal(true);
      void loadBillingData();
    } catch (err: any) {
      alert(err instanceof Error ? err.message : "Failed to process return.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[var(--accent-brand)]" />
            Billing &amp; Point of Sale (POS)
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Create walk-in &amp; phone bills, apply manager discounts, process Cash &amp; UPI payments, and print PDF receipts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDenomWidget(!showDenomWidget)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${showDenomWidget ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]" : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)]"}`}
          >
            <Banknote className="h-4 w-4" />
            Live Cash Drawer
          </button>
          <button
            type="button"
            onClick={() => setReturnsModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] transition"
          >
            <RotateCcw className="h-4 w-4" />
            Returns &amp; Exchanges
          </button>
          <button
            type="button"
            onClick={() => void loadBillingData()}
            disabled={isLoadingBilling}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingBilling ? "animate-spin" : ""}`} />
            Sync Billing
          </button>
          <button
            type="button"
            onClick={onOpenCreateBill}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
          >
            <Plus className="h-4 w-4" />
            Create New Bill
          </button>
        </div>
      </div>

{/* LIVE CASH DRAWER WIDGET */}
      {showDenomWidget && (
        <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2 font-bold text-emerald-300">
              <Banknote className="h-5 w-5 text-emerald-400" />
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">Live Cash Drawer State</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setDrawerTxType("MANUAL_DEPOSIT"); setDrawerTxModalOpen(true); }}
                className="rounded-lg bg-emerald-500/20 text-emerald-500 px-3 py-1 text-xs font-bold hover:bg-emerald-500/30 transition"
              >
                + Add Cash (Float)
              </button>
              <button
                type="button"
                onClick={() => { setDrawerTxType("MANUAL_WITHDRAWAL"); setDrawerTxModalOpen(true); }}
                className="rounded-lg bg-rose-500/20 text-rose-500 px-3 py-1 text-xs font-bold hover:bg-rose-500/30 transition"
              >
                - Withdraw Cash (Drop)
              </button>
              <button onClick={fetchLiveDrawer} className="p-1 text-emerald-400 hover:text-emerald-300">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!liveDrawerData ? (
            <p className="text-xs text-[var(--text-muted)] py-4">Loading live drawer state...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[var(--text-secondary)]">Current Physical Balance:</span>
                <span className="font-mono text-xl text-emerald-400 font-black">
                  ₹{liveDrawerData.total_balance.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((d) => {
                  const count = liveDrawerData.denominations[String(d)] || 0;
                  return (
                    <div
                      key={`drawer-${d}`}
                      className={`rounded-xl border p-2 text-center space-y-0.5 ${count < 0 ? 'border-rose-500/20 bg-rose-500/10' : count > 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'}`}
                    >
                      <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                        ₹{d} Notes
                      </span>
                      <span className={`font-mono font-bold text-sm block ${count < 0 ? 'text-rose-400' : 'text-[var(--text-primary)]'}`}>
                        {count}×
                      </span>
                      <span className={`font-mono text-[10px] block font-semibold ${count < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        ₹{d * count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>
      )}
      {pendingApprovals.length > 0 && (!staffPermissions || staffPermissions.can_manage_billing) && (
        <article className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h2 className="font-display text-lg font-bold">Pending Discount Approvals Queue</h2>
            </div>
            <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {pendingApprovals.length} Pending
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingApprovals.map((appr) => (
              <div
                key={appr.id}
                className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between text-xs border-b border-[var(--border-subtle)] pb-2">
                  <span className="font-mono font-bold text-[var(--accent-brand)]">
                    Basket #{appr.order_basket_number}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {parseUTCDate(appr.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Requested By:</span>
                    <span className="font-bold text-[var(--text-primary)]">{appr.requested_by_name || "Cashier"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Discount Requested:</span>
                    <span className="font-bold text-emerald-600">
                      {appr.discount_type === "PERCENT"
                        ? `${appr.discount_value}% OFF`
                        : appr.discount_type === "FLAT"
                          ? `₹${appr.discount_value} OFF`
                          : "100% COMPLIMENTARY"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Order Total:</span>
                    <span className="font-mono font-bold">₹{appr.order_total_amount.toFixed(2)}</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Reason Note:</span>
                    <p className="text-xs italic text-[var(--text-secondary)] rounded-lg bg-[var(--bg-surface-elevated)] p-2 mt-0.5">
                      &quot;{appr.reason_note}&quot;
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => void handleResolveApproval(appr.id, true)}
                    className="flex-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResolveApproval(appr.id, false)}
                    className="flex-1 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* BILL HISTORY & MANAGEMENT TABLE */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-4">
        {/* Filter Tabs */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto text-xs font-bold">
            {(["ALL", "DRAFT", "PENDING / PAYMENT", "VERIFICATION", "PAID / COMPLETED", "REFUNDED", "CANCELLED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setBillingStatusFilter(st)}
                className={`rounded-xl px-3 py-1.5 transition ${billingStatusFilter === st
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                  }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              id="billing-search-input"
              type="text"
              value={billingSearchQuery}
              onChange={(e) => setBillingSearchQuery(e.target.value)}
              placeholder="Search by Bill ID or Table... (/)"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-3 text-xs"
            />
          </div>
        </div>

        {/* Bills List Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5">Bill ID &amp; Source</th>
                <th className="p-3.5">Table &amp; Customer</th>
                <th className="p-3.5 text-center">Items</th>
                <th className="p-3.5 text-right">Subtotal</th>
                <th className="p-3.5 text-right">Discount</th>
                <th className="p-3.5 text-right">Grand Total</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {billsList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[var(--text-muted)]">
                    No bills found matching filters. Create your first bill above!
                  </td>
                </tr>
              ) : (
                billsList
                  .filter((b) => {
                    if (billingStatusFilter !== "ALL") {
                      const s = (b.status || "").toUpperCase();
                      const ds = (b.discount_status || "").toUpperCase();
                      if (billingStatusFilter === "DRAFT") {
                        if (s !== "DRAFT" && s !== "PENDING" && s !== "PAYMENT_PENDING") return false;
                      } else if (billingStatusFilter === "PENDING / PAYMENT") {
                        if (s !== "PENDING" && s !== "PAYMENT_PENDING") return false;
                      } else if (billingStatusFilter === "VERIFICATION") {
                        if (s !== "PENDING_VERIFICATION" && ds !== "PENDING_APPROVAL") return false;
                      } else if (billingStatusFilter === "PAID / COMPLETED") {
                        if (s !== "PAID" && s !== "COMPLETED" && s !== "FINALIZED") return false;
                      } else if (billingStatusFilter === "REFUNDED") {
                        if (s !== "REFUNDED") return false;
                      } else if (billingStatusFilter === "CANCELLED") {
                        if (s !== "CANCELLED") return false;
                      } else if (s !== billingStatusFilter) {
                        return false;
                      }
                    }
                    if (billingSearchQuery) {
                      const q = billingSearchQuery.toLowerCase();
                      return (
                        b.id.toLowerCase().includes(q) ||
                        b.basket_number.toLowerCase().includes(q) ||
                        (b.customer_name && b.customer_name.toLowerCase().includes(q))
                      );
                    }
                    return true;
                  })
                  .map((b) => (
                    <tr key={b.id} className={`hover:bg-[var(--bg-surface-elevated)]/50 transition ${b.status === "REFUNDED" ? "opacity-50" : ""}`}>
                      <td className="p-3.5 font-mono">
                        <span className="font-bold text-[var(--text-primary)]">#{b.id.slice(0, 8).toUpperCase()}</span>
                        <span className="block text-[10px] uppercase font-bold text-[var(--accent-brand)]">{b.source}</span>
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-[var(--text-primary)]">Basket #{b.basket_number}</span>
                        {b.customer_name && (
                          <span className="block text-[10px] text-[var(--text-muted)]">{b.customer_name}</span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-bold font-mono">{b.items?.length || 0}</td>

                      <td className="p-3.5 text-right font-mono">₹{b.subtotal_amount.toFixed(2)}</td>

                      <td className="p-3.5 text-right font-mono">
                        {b.discount_type ? (
                          <span className="text-emerald-600 font-bold">
                            {b.discount_type === "PERCENT"
                              ? `-${b.discount_value}%`
                              : b.discount_type === "FLAT"
                                ? `-₹${b.discount_value}`
                                : b.discount_type === "COMPLIMENTARY_ITEMS"
                                  ? `-₹${b.discount_value}`
                                  : "FREE"}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right font-mono font-black text-sm text-[var(--text-primary)]">
                        <div>₹{b.total_amount.toFixed(2)}</div>
                        {(b as any).credit_applied > 0 && (
                          <div className="text-[10px] text-emerald-500 font-bold mt-0.5 whitespace-nowrap">
                            Credit Used: ₹{(b as any).credit_applied}
                          </div>
                        )}
                        {Number((b as any).debit_applied) > 0 && (
                          <div className="text-[10px] text-red-500 font-bold mt-0.5 whitespace-nowrap">
                            Debit Recorded: ₹{Number((b as any).debit_applied).toFixed(2)}
                          </div>
                        )}
                        {Number((b as any).debt_settled) > 0 && (
                          <div className="text-[10px] text-emerald-500 font-bold mt-0.5 whitespace-nowrap">
                            Debt Settled (Payed Udhaar): +₹{Number((b as any).debt_settled).toFixed(2)}
                          </div>
                        )}
                        {Number((b as any).credit_awarded) > 0 && (
                          <div className="text-[10px] text-sky-500 font-bold mt-0.5 whitespace-nowrap">
                            Wallet Credited: +₹{Number((b as any).credit_awarded).toFixed(2)}
                          </div>
                        )}
                        {Number((b as any).credit_cashed_out) > 0 && (
                          <div className="text-[10px] text-orange-400 font-bold mt-0.5 whitespace-nowrap">
                            Credit Cashed Out: ₹{Number((b as any).credit_cashed_out).toFixed(2)}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${b.status === "PAID" || b.status === "SERVED" || b.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : b.discount_status === "PENDING_APPROVAL"
                              ? "bg-amber-500/10 text-amber-400 animate-pulse"
                              : b.status === "CANCELLED" || b.status === "REFUNDED"
                                ? "bg-rose-500/10 text-rose-400"
                                : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)]"
                            }`}
                        >
                          {b.discount_status === "PENDING_APPROVAL"
                            ? "Pending Discount Approval"
                            : b.status === "PENDING"
                              ? "DRAFT"
                              : b.status}
                        </span>
                        {b.payment_method && (
                          <span className="block text-[10px] text-[var(--text-muted)] font-mono uppercase mt-0.5">
                            Via {b.payment_method}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                        {/* Resume / Edit Draft Button */}
                        {(b.status === "DRAFT" || b.status === "PENDING") && onResumeDraft && (
                          <button
                            type="button"
                            onClick={() => onResumeDraft(b)}
                            className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                            title="Resume / Edit Draft Bill"
                          >
                            <FileEdit className="h-4 w-4" />
                          </button>
                        )}
                        
                        {/* Delete Draft Button */}
                        {onDeleteBill && b.status !== "PAID" && b.status !== "COMPLETED" && b.status !== "REFUNDED" && (
                          <button
                            type="button"
                            onClick={() => setBillToDelete(b)}
                            className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-red-500/50 hover:text-red-400 transition"
                            title="Delete Bill Permanently"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}

                        {/* Apply Discount Button */}
                        {b.status !== "PAID" && b.status !== "COMPLETED" && b.status !== "REFUNDED" && (
                          <button
                            type="button"
                            onClick={() => onOpenDiscountModal(b)}
                            className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                            title="Apply Discount"
                          >
                            <Percent className="h-4 w-4" />
                          </button>
                        )}

                        {/* Edit Completed Bill Button */}
                        {(b.status === "PAID" || b.status === "COMPLETED") && onEditCompletedBill && (
                          <button
                            type="button"
                            onClick={() => onEditCompletedBill(b)}
                            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                            title="Edit this completed bill (Voids old bill)"
                          >
                            <FileEdit className="h-4 w-4" />
                            <span>Edit Bill</span>
                          </button>
                        )}

                        {/* View / Download PDF Receipt Buttons */}
                          <button
                            type="button"
                            onClick={() => {
                              generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", {}, restaurant || {}, "view");
                            }}
                            className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                            title="View PDF Bill"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", {}, restaurant || {}, "download");
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--text-muted)] transition"
                          >
                            <Download className="h-4 w-4" />
                            <span>Bill</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              generateA4InvoicePDF(b as any, restaurant?.name || "RESTAURANT", {}, restaurant || {}, "download");
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--text-muted)] transition"
                          >
                            <Download className="h-4 w-4" />
                            <span>Invoice</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Customer Returns & Exchanges Modal */}
      <CustomerReturnsModal
        isOpen={returnsModalOpen}
        onClose={() => setReturnsModalOpen(false)}
        billsList={billsList.filter((b) => b.status === "PAID" || b.status === "COMPLETED")}
        menuItems={menuItems}
        onRequestReturn={handleProcessCustomerReturn}
        restaurantName={restaurant?.name || "ApnaGreen Basket"}
        restaurant={restaurant}
      />

      {/* Centered Return Success Modal */}
      <ReturnSuccessModal
        isOpen={showReturnSuccessModal}
        onClose={() => {
          setShowReturnSuccessModal(false);
          setSuccessReturnData(null);
        }}
        returnData={successReturnData}
        restaurantName={restaurant?.name || "ApnaGreen Basket"}
        restaurant={restaurant}
      />

      {/* Delete Bill Modal */}
      {billToDelete && onDeleteBill && (
        <DeleteBillModal
          isOpen={true}
          onClose={() => setBillToDelete(null)}
          order={billToDelete}
          onConfirm={async (id) => {
            await onDeleteBill(id);
            setBillToDelete(null);
          }}
        />
      )}

      {drawerTxModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl shadow-xl flex flex-col h-full border border-[var(--border-strong)] relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
              <h2 className={`text-sm font-bold ${drawerTxType === "MANUAL_DEPOSIT" ? 'text-emerald-400' : 'text-rose-400'}`}>
                {drawerTxType === "MANUAL_DEPOSIT" ? "Add Cash to Drawer" : "Withdraw Cash from Drawer"}
              </h2>
              <button onClick={() => setDrawerTxModalOpen(false)} className="rounded-md p-1.5 hover:bg-[var(--bg-surface-elevated)] transition-colors">
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Notes Tapped</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((d) => {
                    const count = drawerTxDenoms[d] || 0;
                    return (
                      <button
                        key={`tx-${d}`}
                        onClick={() => setDrawerTxDenoms({ ...drawerTxDenoms, [d]: count + 1 })}
                        className={`relative rounded-lg py-1 px-1 text-center font-mono text-xs font-bold border transition ${
                          count > 0 ? (drawerTxType === "MANUAL_DEPOSIT" ? "border-emerald-500 bg-emerald-500 text-white" : "border-rose-500 bg-rose-500 text-white") : "border-[var(--border-strong)] bg-transparent text-[var(--text-muted)]"
                        }`}
                      >
                        ₹{d}
                        {count > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-black border border-white">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {Object.values(drawerTxDenoms).some(c => c > 0) && (
                  <div className="flex gap-2 text-[10px] mt-2">
                    <button onClick={() => setDrawerTxDenoms({500:0,200:0,100:0,50:0,20:0,10:0,5:0,2:0,1:0})} className="text-rose-400 font-bold underline">Clear All</button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Reason / Note</label>
                <input
                  type="text"
                  value={drawerTxNotes}
                  onChange={(e) => setDrawerTxNotes(e.target.value)}
                  placeholder={drawerTxType === "MANUAL_DEPOSIT" ? "e.g. Morning Float" : "e.g. End of day drop"}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs focus:border-sky-500 outline-none"
                />
              </div>

              <div className="flex justify-between items-center text-sm font-mono font-bold mt-4 pt-4 border-t border-[var(--border-subtle)]">
                <span>Total Amount:</span>
                <span className={drawerTxType === "MANUAL_DEPOSIT" ? "text-emerald-400" : "text-rose-400"}>
                  ₹{Object.entries(drawerTxDenoms).reduce((sum, [d, c]) => sum + Number(d)*c, 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)] flex gap-2">
              <button
                disabled={isSubmittingTx || Object.values(drawerTxDenoms).every(c => c === 0)}
                onClick={handleDrawerTxSubmit}
                className="w-full rounded-xl bg-[var(--accent-brand)] py-2.5 text-xs font-bold text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
              >
                {isSubmittingTx ? "Processing..." : "Submit Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
