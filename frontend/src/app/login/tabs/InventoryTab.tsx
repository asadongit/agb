"use client";

import React, { useState, useMemo, useRef } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Filter,
  History,
  Layers,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  PackageX,
  Phone,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  Tag,
  RotateCcw,
  FileText,
  Printer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Receipt,
  FileBarChart,
  ShoppingCart,
  Edit2,
} from "lucide-react";
import type {
  BatchDetail,
  BatchExpiryAlert,
  InventoryItem,
  InventoryUnit,
  PurchaseReturn,
  StockChangeType,
  StockLedgerEntry,
  Supplier,
  WastageReason,
} from "@/types";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { BarcodeRegisterModal } from "../components/BarcodeRegisterModal";
import { LogWastageModal } from "../modals/LogWastageModal";
import { BatchHistoryDrawer } from "../components/BatchHistoryDrawer";
import { BulkOperationsMenu } from "../components/BulkOperationsMenu";
import { AddSupplierModal } from "../components/AddSupplierModal";
import { AdjustBatchStockModal } from "../components/AdjustBatchStockModal";
import { ReturnBillModal } from "../components/ReturnBillModal";
import { PrintBarcodesModal } from "../components/PrintBarcodesModal";
import { parseUTCDate } from "../adminUtils";
import type { InventoryTabType, ScanFeedItem } from "../hooks/useInventoryManagement";

interface InventoryTabProps {
  activeSubTab: InventoryTabType;
  setActiveSubTab: (tab: InventoryTabType) => void;
  inventoryViewMode?: "combined" | "batches";
  setInventoryViewMode?: (mode: "combined" | "batches") => void;
  items: InventoryItem[];
  batches: BatchDetail[];
  suppliers?: Supplier[];
  createSupplier?: (data: { name: string; phone?: string; email?: string; address?: string }) => Promise<any>;
  updateSupplier?: (supplierId: string, data: any) => Promise<any>;
  fetchBatches?: (itemId?: string) => Promise<any>;
  alerts: BatchExpiryAlert[];
  ledgerEntries: StockLedgerEntry[];
  ledgerTotal: number;
  ledgerPage: number;
  setLedgerPage: (page: number) => void;
  ledgerPageSize: number;
  ledgerFilterItem: string;
  setLedgerFilterItem: (id: string) => void;
  ledgerFilterType: StockChangeType | "";
  setLedgerFilterType: (type: StockChangeType | "") => void;
  isLoading: boolean;
  error: string | null;
  scanQty: number;
  setScanQty: (m: number) => void;
  scanWeight: number | "";
  setScanWeight: (w: number | "") => void;
  scannedBarcode: string;
  setScannedBarcode: (code: string) => void;
  isRegisterModalOpen: boolean;
  setIsRegisterModalOpen: (open: boolean) => void;
  unregisteredBarcode: string;
  scanFeed: ScanFeedItem[];
  handleBarcodeScan: (code: string) => void;
  onboardScannedItem: (data: any) => Promise<any>;
  // Batch Drawer & Supplier Modal
  selectedBatchItem?: InventoryItem | null;
  isBatchDrawerOpen?: boolean;
  openBatchDrawer?: (item: InventoryItem) => void;
  closeBatchDrawer?: () => void;
  deleteInventoryItem?: (itemId: string) => Promise<boolean>;
  deleteBatch?: (batchId: string) => Promise<boolean>;
  isAddSupplierModalOpen?: boolean;
  setIsAddSupplierModalOpen?: (open: boolean) => void;
  openEditSupplierModal?: (supplier: Supplier) => void;
  editingSupplier?: Supplier;
  setEditingSupplier?: (supplier: Supplier | undefined) => void;
  // Wastage
  isWastageModalOpen: boolean;
  selectedWastageItem: InventoryItem | null;
  selectedWastageBatch: BatchDetail | null;
  openWastageModal: (item: InventoryItem, batch?: BatchDetail | null) => void;
  closeWastageModal: () => void;
  logWastage: (data: {
    item_id: string;
    quantity: number;
    reason: WastageReason;
    notes?: string;
    batch_number?: string;
  }) => Promise<void>;
  catalogCategories?: { id: string; name: string }[];
  authToken?: string;
}

export function InventoryTab({
  activeSubTab,
  setActiveSubTab,
  inventoryViewMode = "combined",
  setInventoryViewMode,
  items,
  batches,
  suppliers = [],
  createSupplier,
  updateSupplier,
  fetchBatches,
  alerts,
  ledgerEntries,
  ledgerTotal,
  ledgerPage,
  setLedgerPage,
  ledgerPageSize,
  ledgerFilterItem,
  setLedgerFilterItem,
  ledgerFilterType,
  setLedgerFilterType,
  isLoading,
  error,
  scanQty,
  setScanQty,
  scanWeight,
  setScanWeight,
  scannedBarcode,
  setScannedBarcode,
  isRegisterModalOpen,
  setIsRegisterModalOpen,
  unregisteredBarcode,
  scanFeed,
  handleBarcodeScan,
  onboardScannedItem,
  selectedBatchItem,
  isBatchDrawerOpen = false,
  openBatchDrawer,
  closeBatchDrawer,
  deleteInventoryItem,
  deleteBatch,
  isAddSupplierModalOpen = false,
  setIsAddSupplierModalOpen,
  openEditSupplierModal,
  editingSupplier,
  setEditingSupplier,
  isWastageModalOpen,
  selectedWastageItem,
  selectedWastageBatch,
  openWastageModal,
  closeWastageModal,
  logWastage,
  catalogCategories,
  authToken,
}: InventoryTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");
  const manualBarcodeRef = useRef<HTMLInputElement>(null);

  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (localError) {
      const timer = setTimeout(() => setLocalError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [localError]);

  // Global Barcode Listener for Inventory Tab
  useBarcodeScanner({
    onScan: (barcode) => {
      setSearchQuery(barcode);
    },
    enabled: activeSubTab === "items", // only listen when looking at the products table
  });

  // Prefill Item state for adding a batch to an existing product
  const [prefillItem, setPrefillItem] = useState<InventoryItem | null>(null);

  // Batch Stock Adjustment Modal state
  const [selectedAdjustBatch, setSelectedAdjustBatch] = useState<BatchDetail | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  // Return Bill Modal state
  const [selectedReturnBill, setSelectedReturnBill] = useState<PurchaseReturn | null>(null);
  const [isReturnBillModalOpen, setIsReturnBillModalOpen] = useState(false);

  // Print Barcodes Modal state
  const [selectedPrintItem, setSelectedPrintItem] = useState<InventoryItem | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    if (catalogCategories && catalogCategories.length > 0) {
      catalogCategories.forEach((c) => set.add(c.name));
    }
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [items, catalogCategories]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchQuery.trim()) return suppliers;
    const q = supplierSearchQuery.toLowerCase().trim();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
  }, [suppliers, supplierSearchQuery]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode && item.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        selectedCategory === "ALL" || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, selectedCategory]);

  const lowStockCount = items.filter(
    (i) => parseFloat(i.current_stock) <= parseFloat(i.reorder_threshold)
  ).length;

  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcodeInput.trim()) {
      handleBarcodeScan(manualBarcodeInput.trim());
      setManualBarcodeInput("");
      setTimeout(() => manualBarcodeRef.current?.focus(), 0);
    }
  };

  return (
    <div className="space-y-6">
      {localError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 flex items-center justify-between text-sm font-bold text-rose-500">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full bg-rose-500 p-0.5 text-[var(--bg-surface)]">
              <X className="h-4 w-4" />
            </span>
            {localError}
          </div>
          <button type="button" onClick={() => setLocalError(null)} className="opacity-70 hover:opacity-100 uppercase text-[10px] tracking-wider px-2 py-1 rounded bg-rose-500/20">
            Dismiss
          </button>
        </div>
      )}
      
      {/* Top Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Total Catalog Items</span>
            <Boxes className="h-4 w-4 text-[var(--accent-brand)]" />
          </div>
          <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
            {items.length}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Active Batch Lots</span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="font-display text-2xl font-bold text-emerald-400">
            {batches.length}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Low Stock Alerts</span>
            <TrendingDown className="h-4 w-4 text-amber-400" />
          </div>
          <p className="font-display text-2xl font-bold text-amber-400">
            {lowStockCount}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Near-Expiry Lots</span>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <p className="font-display text-2xl font-bold text-red-400">
            {alerts.length}
          </p>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab("items")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "items"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <ScanLine className="h-4 w-4" />
            Barcode & Item Master
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("batches")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "batches"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <Layers className="h-4 w-4" />
            Batch Lots & FEFO
            {batches.length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                {batches.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("suppliers")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "suppliers"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <Building2 className="h-4 w-4 text-purple-400" />
            Suppliers & Vendors
            {suppliers.length > 0 && (
              <span className="rounded-full bg-purple-500/20 text-purple-300 px-1.5 py-0.2 text-[10px] font-mono">
                {suppliers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("ledger")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "ledger"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <History className="h-4 w-4" />
            Movement Ledger
          </button>
        </div>

        <div className="flex items-center gap-2">
          <BulkOperationsMenu entity="inventory" authToken={authToken} />
          <button
            type="button"
            onClick={() => {
              setScannedBarcode("");
              setIsRegisterModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-md transition active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Stock / Register Product
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: Barcode Scanner Station & Item Master */}
      {activeSubTab === "items" && (
        <div className="space-y-6">
          {/* Hardware Barcode Scanner Live Station Banner */}
          <div className="rounded-2xl border border-[var(--border-strong)] bg-gradient-to-r from-emerald-950/40 via-[var(--bg-surface)] to-emerald-950/30 p-4 sm:p-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-4 ring-emerald-500/10">
                  <Barcode className="h-6 w-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                      Hardware Barcode Scanner Station
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Gun Ready
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Pull the physical scanner trigger anytime. Known items auto-increment count; new barcodes pop up a quick registration modal.
                  </p>
                </div>
              </div>

              {/* Manual Scan Code Entry */}
              <form
                onSubmit={handleManualScanSubmit}
                className="flex items-center gap-2 min-w-[280px]"
              >
                <div className="flex items-center gap-1 border border-[var(--border-strong)] rounded-xl bg-[var(--bg-surface-elevated)] h-9 px-1">
                  <span className="pl-2 text-xs text-[var(--text-muted)] font-bold">Qty:</span>
                  <input
                    type="number"
                    min="1"
                    value={scanQty}
                    onChange={(e) => setScanQty(parseInt(e.target.value) || 1)}
                    className="w-10 bg-transparent py-1 text-xs text-center text-[var(--text-primary)] font-mono font-bold focus:outline-none"
                    title="Batch count multiplier for next scan"
                  />
                  <span className="text-[var(--border-strong)]">|</span>
                  <span className="text-xs text-[var(--text-muted)] font-bold">Wgt:</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={scanWeight}
                    onChange={(e) => setScanWeight(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    placeholder="Auto"
                    className="w-14 bg-transparent py-1 text-xs text-center text-[var(--text-primary)] font-mono font-bold focus:outline-none"
                    title="Optional: Weight per unit (kg). If provided, it multiplies with Qty."
                  />
                </div>
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    ref={manualBarcodeRef}
                    type="text"
                    placeholder="Scan or type barcode..."
                    value={manualBarcodeInput}
                    onChange={(e) => setManualBarcodeInput(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow hover:opacity-90 transition"
                >
                  Lookup
                </button>
              </form>
            </div>

            {/* Live Scan Feed Strip */}
            {scanFeed.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">
                  Recent Scan Feed
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {scanFeed.slice(0, 5).map((scan) => (
                    <div
                      key={scan.id}
                      className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-[var(--bg-surface-elevated)] px-3 py-1.5 border border-[var(--border-subtle)] text-xs"
                    >
                      <PackageCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="font-semibold text-[var(--text-primary)]">{scan.name}</span>
                      <span className="font-mono text-emerald-400 font-bold">+{scan.quantity}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        (Now: {scan.newStock})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search product name or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Items Table */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Barcode</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Current Stock</th>
                    <th className="py-3 px-4">Cost Price</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Package className="h-10 w-10 text-[var(--text-muted)] opacity-50" />
                          <p className="text-sm font-medium text-[var(--text-muted)]">
                            No inventory items found. Scan a barcode or inward stock.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setScannedBarcode("");
                              setIsRegisterModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-md transition active:scale-95"
                          >
                            <Plus className="h-4 w-4" />
                            + Add First Stock / Register Product
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const stockNum = parseFloat(item.current_stock) || 0;
                      const thresholdNum = parseFloat(item.reorder_threshold) || 0;
                      const isLow = stockNum <= thresholdNum;

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-[var(--bg-surface-elevated)] transition"
                        >
                          <td className="py-3 px-4">
                            <span className="font-bold text-[var(--text-primary)] block">
                              {item.name}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {item.barcode ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[var(--accent-brand)] rounded bg-[var(--bg-surface-elevated)] px-2 py-0.5 border border-[var(--border-subtle)]">
                                <Barcode className="h-3 w-3" />
                                {item.barcode}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)] italic">
                                No barcode
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">
                            {item.category}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-mono font-bold ${
                                isLow ? "text-red-400" : "text-emerald-400"
                              }`}
                            >
                              {stockNum} {item.unit}
                            </span>
                            {isLow && (
                              <span className="ml-1.5 text-[10px] text-amber-400 font-semibold">
                                (Low)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                            ₹{parseFloat(item.cost_per_unit).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* View Batches Button */}
                              {openBatchDrawer && (
                                <button
                                  type="button"
                                  onClick={() => openBatchDrawer(item)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer"
                                  title="View all arrival batches for this item"
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                  View Batches
                                </button>
                              )}

                              {/* Print Barcode Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPrintItem(item);
                                  setIsPrintModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-400 hover:bg-purple-500/20 transition cursor-pointer"
                                title="Print custom barcodes for this item"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Print
                              </button>

                              {/* Log Wastage Button */}
                              {(() => {
                                const isOutOfStock = parseFloat(item.current_stock) <= 0;
                                return (
                                  <button
                                    type="button"
                                    disabled={isOutOfStock}
                                    onClick={() => openWastageModal(item)}
                                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                      isOutOfStock
                                        ? "border-gray-500/20 bg-gray-500/10 text-gray-500 cursor-not-allowed opacity-50"
                                        : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                                    }`}
                                    title={
                                      isOutOfStock
                                        ? "Cannot log wastage for item with 0 stock"
                                        : "Log spoilage, damage, or loss write-off"
                                    }
                                  >
                                    <PackageX className="h-3.5 w-3.5" />
                                    Log Wastage
                                  </button>
                                );
                              })()}

                              {/* Delete Item Button */}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm(`Are you sure you want to completely delete "${item.name}" from the inventory?\n\nThis will fail if any batches have remaining quantity > 0.`)) {
                                    try {
                                      if (deleteInventoryItem) await deleteInventoryItem(item.id);
                                    } catch (err: any) {
                                      setLocalError(err.message || "Failed to delete item.");
                                    }
                                  }
                                }}
                                className="inline-flex items-center justify-center rounded-lg border border-red-500/30 bg-transparent px-2 py-1 text-red-500 hover:bg-red-500/10 hover:text-red-400 transition cursor-pointer"
                                title="Delete this item entirely"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Batch Lots & FEFO */}
      {activeSubTab === "batches" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Unique Arrival Batch Lots & FEFO Tracking
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  All arrival lots sorted by expiration date (First-Expired, First-Out).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Batch Number</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Initial Gross Qty</th>
                    <th className="py-3 px-4">Sorted Usable Qty</th>
                    <th className="py-3 px-4">Remaining</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {batches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                        No batch records found yet.
                      </td>
                    </tr>
                  ) : (
                    batches.map((b) => {
                      const matchedItem = items.find((it) => it.id === b.item_id);
                      return (
                        <tr
                          key={b.id}
                          className="hover:bg-[var(--bg-surface-elevated)] transition"
                        >
                          <td className="py-3 px-4 font-mono font-bold text-[var(--accent-brand)]">
                            {b.batch_number}
                          </td>
                          <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                            {b.item_name}
                          </td>
                          <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                            {Number(b.initial_quantity ?? b.quantity).toFixed(2)} {b.unit}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                            {Number(b.quantity).toFixed(2)} {b.unit}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                            {b.remaining_quantity} {b.unit}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">
                            {b.expiry_date ? parseUTCDate(b.expiry_date).toLocaleDateString() : "—"}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                b.status === "ACTIVE"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : b.status === "EXPIRING_SOON"
                                  ? "bg-amber-500/10 text-amber-400"
                                  : b.status === "EXPIRED"
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-gray-500/10 text-[var(--text-muted)]"
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAdjustBatch(b);
                                  setIsAdjustModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                                title="Adjust stock, return to supplier (issue bill), or void batch"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Adjust / Return Stock
                              </button>

                              {matchedItem && (
                                (() => {
                                  const isBatchEmpty = parseFloat(String(b.remaining_quantity)) <= 0;
                                  return (
                                    <button
                                      type="button"
                                      disabled={isBatchEmpty}
                                      onClick={() => openWastageModal(matchedItem, b)}
                                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                        isBatchEmpty
                                          ? "border-gray-500/20 bg-gray-500/10 text-gray-500 cursor-not-allowed opacity-50"
                                          : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                                      }`}
                                      title={isBatchEmpty ? "Batch has 0 remaining stock" : "Log wastage write-off"}
                                    >
                                      <PackageX className="h-3.5 w-3.5" />
                                      Write Off
                                    </button>
                                  );
                                })()
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Suppliers & Vendors Directory */}
      {activeSubTab === "suppliers" && (
        <div className="space-y-4">
          {/* Header Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search vendor name, phone, email, location..."
                value={supplierSearchQuery}
                onChange={(e) => setSupplierSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-purple-500 focus:outline-none"
              />
            </div>

            {setIsAddSupplierModalOpen && (
              <button
                type="button"
                onClick={() => setIsAddSupplierModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                + Add New Supplier
              </button>
            )}
          </div>

          {/* Suppliers List Table */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Supplier / Company Name</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Location / Address</th>
                    <th className="py-3 px-4">Registered Date</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Building2 className="h-10 w-10 text-purple-400/50" />
                          <p className="text-sm font-medium text-[var(--text-muted)]">
                            {supplierSearchQuery.trim()
                              ? "No suppliers match your search query."
                              : "No registered suppliers found. Add vendors to track inward stock arrivals."}
                          </p>
                          {setIsAddSupplierModalOpen && (
                            <button
                              type="button"
                              onClick={() => setIsAddSupplierModalOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-md transition active:scale-95 cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                              + Add First Supplier
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-[var(--bg-surface-elevated)] transition">
                        <td className="py-3 px-4 font-bold text-[var(--text-primary)]">
                          <span className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              <Building2 className="h-3.5 w-3.5" />
                            </span>
                            {s.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                          {s.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 text-[var(--text-muted)]" />
                              {s.phone}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">
                          {s.email ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                              {s.email}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] max-w-xs truncate">
                          {s.address ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-[var(--text-muted)] flex-shrink-0" />
                              {s.address}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[var(--text-muted)]">
                          {parseUTCDate(s.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {openEditSupplierModal && (
                            <button
                              type="button"
                              onClick={() => openEditSupplierModal(s)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-purple-400 transition"
                              title="Edit Supplier"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
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

      {/* Sub-Tab 3: Stock Movement Ledger */}
      {activeSubTab === "ledger" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Stock Movement Audit Ledger
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Immutable audit trail of all inwarding, auto-deductions, and manual wastage adjustments.
                </p>
              </div>

              {/* Ledger Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={ledgerFilterType}
                  onChange={(e) => setLedgerFilterType(e.target.value as any)}
                  className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="">All Change Types</option>
                  <option value="INTAKE">Stock Intake / Inwarding</option>
                  <option value="AUTO_DEDUCTION">POS Auto-Deduction</option>
                  <option value="MANUAL_ADJUSTMENT">Manual / Wastage Adjustment</option>
                  <option value="RESTOCK">Customer Return Restock</option>
                  <option value="PURCHASE_RETURN">Supplier Purchase Return</option>
                  <option value="VOID_BATCH">Void / Discarded Batch</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Change Type</th>
                    <th className="py-3 px-4">Quantity Delta</th>
                    <th className="py-3 px-4">Resulting Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--text-muted)]">
                        No movement ledger entries found.
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((row) => {
                      const deltaNum = parseFloat(row.quantity_change) || 0;
                      const isPositive = deltaNum > 0;

                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-[var(--bg-surface-elevated)] transition"
                        >
                          <td className="py-3 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                            {new Date(row.created_at + (row.created_at.endsWith("Z") ? "" : "Z")).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                            {row.item_name || "—"}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                                String(row.change_type).toUpperCase().includes("INTAKE")
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : String(row.change_type).toUpperCase().includes("RESTOCK")
                                  ? "bg-sky-500/10 text-sky-500"
                                  : String(row.change_type).toUpperCase().includes("DEDUCTION")
                                  ? "bg-amber-500/10 text-amber-500"
                                  : String(row.change_type).toUpperCase().includes("PURCHASE_RETURN")
                                  ? "bg-rose-500/10 text-rose-500"
                                  : String(row.change_type).toUpperCase().includes("VOID")
                                  ? "bg-rose-500/10 text-rose-500"
                                  : String(row.change_type).toUpperCase().includes("MANUAL_ADJUSTMENT")
                                  ? "bg-purple-500/10 text-purple-400"
                                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-strong)]"
                              }`}
                            >
                              {row.change_type === "MANUAL_ADJUSTMENT" ? "WASTAGE / ADJ." : row.change_type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold">
                            <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                              {isPositive ? `+${deltaNum}` : deltaNum} {row.unit || ""}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[var(--text-secondary)]">
                            {row.resulting_stock} {row.unit || ""}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Register Modal (First-time scan onboarding & Inward Stock) */}
      <BarcodeRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => {
          setIsRegisterModalOpen(false);
          setPrefillItem(null);
        }}
        barcode={unregisteredBarcode}
        categories={categories}
        items={items}
        suppliers={suppliers}
        prefillItem={prefillItem}
        onOpenAddSupplierModal={() => setIsAddSupplierModalOpen?.(true)}
        onSuccess={(name, stock) => {
          console.log(`Registered ${name} with initial stock ${stock}`);
          setPrefillItem(null);
        }}
        onboardItem={onboardScannedItem}
      />

      {/* Batch History Slide-over Drawer */}
      {fetchBatches && (
        <BatchHistoryDrawer
          isOpen={isBatchDrawerOpen}
          onClose={() => closeBatchDrawer?.()}
          item={selectedBatchItem || null}
          fetchBatches={fetchBatches}
          onLogWastageClick={(itm) => openWastageModal(itm)}
          onAddStockClick={(itm) => {
            setScannedBarcode("");
            setPrefillItem(itm);
            setIsRegisterModalOpen(true);
          }}
          onAdjustBatchClick={(b) => {
            setSelectedAdjustBatch(b);
            setIsAdjustModalOpen(true);
          }}
          onDeleteBatchClick={async (b) => {
            if (deleteBatch) {
              try {
                await deleteBatch(b.id);
                closeBatchDrawer?.();
              } catch (err: any) {
                setLocalError(err.message || "Failed to delete batch");
              }
            }
          }}
        />
      )}

      {/* Add New Supplier Modal */}
      {createSupplier && (
        <AddSupplierModal
          isOpen={isAddSupplierModalOpen}
          onClose={() => {
            setIsAddSupplierModalOpen?.(false);
            setEditingSupplier?.(undefined);
          }}
          createSupplier={createSupplier}
          updateSupplier={updateSupplier}
          editingSupplier={editingSupplier}
        />
      )}

      {/* Log Wastage / Write-Off Modal */}
      <LogWastageModal
        isOpen={isWastageModalOpen}
        onClose={closeWastageModal}
        item={selectedWastageItem}
        batch={selectedWastageBatch}
        onLogWastage={logWastage}
      />

      {/* Adjust Batch Stock Modal */}
      <AdjustBatchStockModal
        isOpen={isAdjustModalOpen}
        onClose={() => {
          setIsAdjustModalOpen(false);
          setSelectedAdjustBatch(null);
        }}
        batch={selectedAdjustBatch}
        suppliers={suppliers}
        authToken={authToken}
        onSuccess={async (res) => {
          if (fetchBatches) await fetchBatches();
          // If return bill generated, fetch details and open ReturnBillModal
          if (res.return_id) {
            try {
              const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
              const r = await fetch(`${apiBase}/api/admin/inventory/purchase-returns/${res.return_id}`, {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              });
              if (r.ok) {
                const returnData = await r.json();
                setSelectedReturnBill(returnData);
                setIsReturnBillModalOpen(true);
              }
            } catch (err) {
              console.error("Failed to load return bill details:", err);
            }
          }
        }}
      />

      {/* Return Bill Modal */}
      <ReturnBillModal
        isOpen={isReturnBillModalOpen}
        onClose={() => {
          setIsReturnBillModalOpen(false);
          setSelectedReturnBill(null);
        }}
        purchaseReturn={selectedReturnBill}
      />
      {/* Print Barcodes Modal */}
      <PrintBarcodesModal
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setSelectedPrintItem(null);
        }}
        item={selectedPrintItem}
      />
    </div>
  );
}
