/**
 * BillingTab — Billing & Point of Sale (POS) tab for the admin dashboard.
 *
 * Displays pending discount approvals queue, bill history table with search & filters,
 * and triggers for Create Bill, Discount, and Payment modals.
 * Extracted from admin page.tsx (lines 4180-4468).
 */

"use client";

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
} from "lucide-react";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import type { DiscountApproval, ManualBill, RolePermissions } from "@/types";
import type { RestaurantProfile } from "../adminTypes";

type BillingTabProps = {
  restaurant: RestaurantProfile | null;
  staffPermissions: RolePermissions | null;
  isLoadingBilling: boolean;
  loadBillingData: () => Promise<void>;
  pendingApprovals: DiscountApproval[];
  handleResolveApproval: (approvalId: string, approved: boolean) => Promise<void>;
  billsList: ManualBill[];
  billingStatusFilter: "ALL" | "DRAFT" | "PENDING_APPROVAL" | "FINALIZED" | "PAID" | "CANCELLED";
  setBillingStatusFilter: (filter: "ALL" | "DRAFT" | "PENDING_APPROVAL" | "FINALIZED" | "PAID" | "CANCELLED") => void;
  billingSearchQuery: string;
  setBillingSearchQuery: (q: string) => void;

  // Modal triggers
  onOpenCreateBill: () => void;
  onResumeDraft?: (bill: ManualBill) => void;
  onOpenDiscountModal: (bill: ManualBill) => void;
  onOpenPaymentModal: (bill: ManualBill) => void;
};

export function BillingTab({
  restaurant,
  staffPermissions,
  isLoadingBilling,
  loadBillingData,
  pendingApprovals,
  handleResolveApproval,
  billsList,
  billingStatusFilter,
  setBillingStatusFilter,
  billingSearchQuery,
  setBillingSearchQuery,
  onOpenCreateBill,
  onResumeDraft,
  onOpenDiscountModal,
  onOpenPaymentModal,
}: BillingTabProps) {
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

      {/* PENDING DISCOUNT APPROVALS QUEUE (FOR MANAGERS/ADMINS) */}
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
                    {new Date(appr.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
            {(["ALL", "DRAFT", "PENDING_APPROVAL", "FINALIZED", "PAID", "CANCELLED"] as const).map((st) => (
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
              type="text"
              value={billingSearchQuery}
              onChange={(e) => setBillingSearchQuery(e.target.value)}
              placeholder="Search by Bill ID or Table..."
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
                      } else if (billingStatusFilter === "PENDING_APPROVAL") {
                        if (ds !== "PENDING_APPROVAL") return false;
                      } else if (billingStatusFilter === "FINALIZED") {
                        if (s !== "FINALIZED" && s !== "COMPLETED" && s !== "PAID") return false;
                      } else if (s !== billingStatusFilter && ds !== billingStatusFilter) {
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
                    <tr key={b.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
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
                                : "FREE"}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right font-mono font-black text-sm text-[var(--text-primary)]">
                        ₹{b.total_amount.toFixed(2)}
                      </td>

                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${b.status === "PAID" || b.status === "SERVED" || b.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : b.discount_status === "PENDING_APPROVAL"
                              ? "bg-amber-100 text-amber-800 animate-pulse"
                              : b.status === "CANCELLED"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
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

                      <td className="p-3.5 text-right space-x-1">
                        {/* Resume / Edit Draft Button */}
                        {(b.status === "DRAFT" || b.status === "PENDING") && onResumeDraft && (
                          <button
                            type="button"
                            onClick={() => onResumeDraft(b)}
                            className="p-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:border-amber-400 transition"
                            title="Resume / Edit Draft Bill"
                          >
                            <FileEdit className="h-4 w-4" />
                          </button>
                        )}

                        {/* Apply Discount Button */}
                        {b.status !== "PAID" && b.status !== "COMPLETED" && (
                          <button
                            type="button"
                            onClick={() => onOpenDiscountModal(b)}
                            className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-emerald-600 transition"
                            title="Apply Discount"
                          >
                            <Percent className="h-4 w-4" />
                          </button>
                        )}

                        {/* View / Download PDF Receipt Buttons */}
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", {}, "view");
                            }}
                            className="p-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-500 hover:border-cyan-400 transition"
                            title="View PDF Bill"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", {}, "download");
                            }}
                            className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)] hover:border-[var(--accent-brand)] transition"
                            title="Download PDF Bill"
                          >
                            <Download className="h-4 w-4" />
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
    </div>
  );
}
