"use client";

import React, { useEffect, useState } from "react";
import {
  Building2,
  Calendar,
  IndianRupee,
  Phone,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { Customer } from "@/types";
import type { RestaurantProfile } from "../adminTypes";
import { AddCustomerModal } from "../components/AddCustomerModal";
import { EditCustomerModal } from "../components/EditCustomerModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import { BulkOperationsMenu } from "../components/BulkOperationsMenu";
import { QrCodesTab } from "./QrCodesTab";

interface CustomerServicesTabProps {
  restaurant: RestaurantProfile | null;
  authToken?: string;
  outletId?: string;
}

export function CustomerServicesTab({
  restaurant,
  authToken,
  outletId,
}: CustomerServicesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"directory" | "qrcodes">("directory");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [customerToRemove, setCustomerToRemove] = useState<string | null>(null);
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/customers${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch customer directory.");
      }
      const data = await res.json();
      setCustomers(data);
    } catch (err: any) {
      setError(err?.message || "Error loading customers.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "directory") {
      fetchCustomers();
    }
  }, [activeSubTab, searchQuery]);

  const handleAddCustomer = async (name: string, phone: string) => {
    const res = await fetch("/api/admin/customers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ name, phone }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to register customer.");
    }

    await fetchCustomers();
  };

  const handleEditCustomer = async (id: string, name: string, phone: string) => {
    const res = await fetch(`/api/admin/customers/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ name, phone }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to edit customer.");
    }

    await fetchCustomers();
  };

  const handleDeleteCustomer = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!res.ok) {
        throw new Error("Failed to delete customer.");
      }
      await fetchCustomers();
    } catch (err: any) {
      alert(err.message || "Failed to delete customer.");
    }
  };

  const totalSpentAll = customers.reduce((acc, c) => acc + (c.total_spent || 0), 0);
  const totalOrdersAll = customers.reduce((acc, c) => acc + (c.total_orders || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Toolbar & Subtabs Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-purple-400" />
            Customer Services
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Manage customer accounts, purchase history, and generate digital self-ordering QR codes.
          </p>
        </div>

        {/* Subtabs Switcher */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveSubTab("directory")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeSubTab === "directory"
                ? "bg-purple-600 text-white shadow-md"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Users className="h-4 w-4" />
            Customers Directory
            {customers.length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-mono">
                {customers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("qrcodes")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeSubTab === "qrcodes"
                ? "bg-purple-600 text-white shadow-md"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <QrCode className="h-4 w-4" />
            QR Codes Generator
          </button>
        </div>
      </div>

      {/* Subtab 1: Customers Directory */}
      {activeSubTab === "directory" && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Total Accounts
                </p>
                <p className="text-xl font-bold font-mono text-[var(--text-primary)]">
                  {customers.length}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <IndianRupee className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Total Customer Spend
                </p>
                <p className="text-xl font-bold font-mono text-emerald-400">
                  ₹{totalSpentAll.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Total Customer Orders
                </p>
                <p className="text-xl font-bold font-mono text-blue-400">
                  {totalOrdersAll}
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search customer name or phone number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <BulkOperationsMenu 
                entity="customers" 
                authToken={authToken} 
                onSuccess={fetchCustomers} 
              />
              <button
                type="button"
                onClick={() => setIsAddCustomerModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                + Register Customer
              </button>
            </div>
          </div>

          {/* Customers Directory Table */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4 text-center">Total Orders</th>
                    <th className="py-3 px-4 text-right">Total Spent (₹)</th>
                    <th className="py-3 px-4">Account Registered</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[var(--text-muted)]">
                        Loading customer records...
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Users className="h-10 w-10 text-purple-400/40" />
                          <p className="text-sm font-medium text-[var(--text-muted)]">
                            {searchQuery.trim()
                              ? "No customers match your search."
                              : "No registered customers found. Billing from POS auto-creates customer accounts."}
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsAddCustomerModalOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-md transition active:scale-95 cursor-pointer"
                          >
                            <UserPlus className="h-4 w-4" />
                            + Register First Customer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id} className="hover:bg-[var(--bg-surface-elevated)] transition">
                        <td className="py-3 px-4 font-bold text-[var(--text-primary)]">
                          <span className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                              {c.name.charAt(0).toUpperCase()}
                            </span>
                            {c.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 text-[var(--text-muted)]" />
                            {c.phone}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-blue-400">
                          {c.total_orders || 0}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          ₹{(c.total_spent || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                            {new Date(c.created_at).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCustomerToEdit(c);
                                setIsEditCustomerModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-500/10 transition cursor-pointer"
                              title="Edit customer"
                            >
                              <UserCheck className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerToRemove(c.id)}
                              className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                              title="Delete customer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 2: Digital QR Codes Generator */}
      {activeSubTab === "qrcodes" && (
        <QrCodesTab restaurant={restaurant} />
      )}

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={isAddCustomerModalOpen}
        onClose={() => setIsAddCustomerModalOpen(false)}
        onAddCustomer={handleAddCustomer}
      />
      
      {/* Edit Customer Modal */}
      <EditCustomerModal
        isOpen={isEditCustomerModalOpen}
        onClose={() => {
          setIsEditCustomerModalOpen(false);
          setCustomerToEdit(null);
        }}
        customer={customerToEdit}
        onEditCustomer={handleEditCustomer}
      />
      
      <ConfirmModal
        isOpen={!!customerToRemove}
        title="Remove Customer"
        message="Are you sure you want to remove this customer account? This action cannot be undone."
        confirmText="Remove"
        onConfirm={() => {
          if (customerToRemove) {
            void handleDeleteCustomer(customerToRemove);
          }
          setCustomerToRemove(null);
        }}
        onClose={() => setCustomerToRemove(null)}
      />
    </div>
  );
}
