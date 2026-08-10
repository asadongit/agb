"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BatchDetail,
  BatchExpiryAlert,
  InventoryItem,
  InventoryUnit,
  RecipeIngredient,
  ScanLookupResponse,
  StockChangeType,
  StockIntake,
  StockLedgerEntry,
  WastageReason,
} from "@/types";

export type InventoryTabType =
  | "items"
  | "intake"
  | "batches"
  | "recipes"
  | "ledger"
  | "alerts";

export interface ScanFeedItem {
  id: string;
  barcode: string;
  name: string;
  quantity: number;
  unit: InventoryUnit;
  newStock: string;
  timestamp: string;
  batchNumber?: string;
}

export function useInventoryManagement(
  apiRequest: <T>(url: string, options?: RequestInit) => Promise<T>,
  playBeep?: (freq?: number) => void
) {
  const [activeSubTab, setActiveSubTab] = useState<InventoryTabType>("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [alerts, setAlerts] = useState<BatchExpiryAlert[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<StockLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize] = useState(20);
  const [ledgerFilterItem, setLedgerFilterItem] = useState<string>("");
  const [ledgerFilterType, setLedgerFilterType] = useState<StockChangeType | "">("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Barcode Scanner Station state
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState("");
  const [scanFeed, setScanFeed] = useState<ScanFeedItem[]>([]);

  // Wastage Modal state
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [selectedWastageItem, setSelectedWastageItem] = useState<InventoryItem | null>(null);
  const [selectedWastageBatch, setSelectedWastageBatch] = useState<BatchDetail | null>(null);

  // Load inventory items
  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiRequest<InventoryItem[]>("/api/admin/inventory/items");
      setItems(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load inventory items");
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest]);

  // Load batches with FEFO status
  const fetchBatches = useCallback(async () => {
    try {
      const data = await apiRequest<BatchDetail[]>("/api/admin/inventory/batches");
      setBatches(data);
    } catch (err: any) {
      console.error("Failed to load batches:", err);
    }
  }, [apiRequest]);

  // Load expiry alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await apiRequest<BatchExpiryAlert[]>(
        "/api/admin/inventory/near-expiry-alerts"
      );
      setAlerts(data);
    } catch (err: any) {
      console.error("Failed to load expiry alerts:", err);
    }
  }, [apiRequest]);

  // Load paginated stock ledger
  const fetchLedger = useCallback(async () => {
    try {
      let url = `/api/admin/inventory/ledger?page=${ledgerPage}&page_size=${ledgerPageSize}`;
      if (ledgerFilterItem) url += `&item_id=${ledgerFilterItem}`;
      if (ledgerFilterType) url += `&change_type=${ledgerFilterType}`;

      const data = await apiRequest<{
        items: StockLedgerEntry[];
        total: number;
        page: number;
        total_pages: number;
      }>(url);
      setLedgerEntries(data.items);
      setLedgerTotal(data.total);
    } catch (err: any) {
      console.error("Failed to load ledger:", err);
    }
  }, [apiRequest, ledgerPage, ledgerPageSize, ledgerFilterItem, ledgerFilterType]);

  useEffect(() => {
    fetchItems();
    fetchBatches();
    fetchAlerts();
  }, [fetchItems, fetchBatches, fetchAlerts]);

  useEffect(() => {
    if (activeSubTab === "ledger") {
      fetchLedger();
    }
  }, [activeSubTab, fetchLedger]);

  // Handle hardware barcode scan event
  const handleBarcodeScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setScannedBarcode(trimmed);

      try {
        // First, check if barcode exists in inventory
        const lookup = await apiRequest<ScanLookupResponse>(
          `/api/admin/inventory/barcode/${encodeURIComponent(trimmed)}`
        );

        if (lookup.found && lookup.item) {
          // Recognized barcode -> Rapid auto-increment (+1)
          const updatedItem = await apiRequest<InventoryItem>(
            "/api/admin/inventory/scan-increment",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ barcode: trimmed, quantity: 1 }),
            }
          );

          if (playBeep) playBeep(880); // Higher success tone

          // Update local state
          setItems((prev) =>
            prev.map((it) => (it.id === updatedItem.id ? updatedItem : it))
          );

          // Add to live scan feed
          setScanFeed((prev) => [
            {
              id: Math.random().toString(36).substring(2, 9),
              barcode: trimmed,
              name: updatedItem.name,
              quantity: 1,
              unit: updatedItem.unit,
              newStock: updatedItem.current_stock,
              timestamp: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 19),
          ]);

          fetchBatches();
        } else {
          // New unrecognized barcode -> Open registration modal
          if (playBeep) playBeep(440); // Alert prompt tone
          setUnregisteredBarcode(trimmed);
          setIsRegisterModalOpen(true);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to process barcode scan");
      }
    },
    [apiRequest, playBeep, fetchBatches]
  );

  // First-time scan onboarding submission
  const onboardScannedItem = useCallback(
    async (data: {
      barcode: string;
      name: string;
      category: string;
      unit: InventoryUnit;
      initial_stock: number;
      cost_per_unit: number;
      selling_price?: number;
      reorder_threshold?: number;
      batch_number?: string;
      expiry_date?: string;
      supplier_name?: string;
    }) => {
      const newItem = await apiRequest<InventoryItem>(
        "/api/admin/inventory/scan-onboard",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      setItems((prev) => [newItem, ...prev]);
      setScanFeed((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          barcode: data.barcode,
          name: newItem.name,
          quantity: data.initial_stock,
          unit: newItem.unit,
          newStock: newItem.current_stock,
          timestamp: new Date().toLocaleTimeString(),
          batchNumber: data.batch_number,
        },
        ...prev.slice(0, 19),
      ]);

      fetchBatches();
      fetchItems();
    },
    [apiRequest, fetchBatches, fetchItems]
  );

  // Log stock wastage / write-off
  const logWastage = useCallback(
    async (data: {
      item_id: string;
      quantity: number;
      reason: WastageReason;
      notes?: string;
      batch_number?: string;
    }) => {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        item_id: string;
        item_name: string;
        quantity_wasted: number;
        new_current_stock: string;
        estimated_loss_amount: number;
      }>("/api/admin/inventory/wastage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // Update item in local list
      setItems((prev) =>
        prev.map((it) =>
          it.id === data.item_id
            ? { ...it, current_stock: String(res.new_current_stock) }
            : it
        )
      );

      fetchBatches();
      fetchLedger();
    },
    [apiRequest, fetchBatches, fetchLedger]
  );

  const openWastageModal = (item: InventoryItem, batch?: BatchDetail | null) => {
    setSelectedWastageItem(item);
    setSelectedWastageBatch(batch || null);
    setIsWastageModalOpen(true);
  };

  const closeWastageModal = () => {
    setIsWastageModalOpen(false);
    setSelectedWastageItem(null);
    setSelectedWastageBatch(null);
  };

  return {
    activeSubTab,
    setActiveSubTab,
    items,
    batches,
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
    setError,
    fetchItems,
    fetchBatches,
    fetchAlerts,
    fetchLedger,
    // Scanner
    scannedBarcode,
    setScannedBarcode,
    isRegisterModalOpen,
    setIsRegisterModalOpen,
    unregisteredBarcode,
    scanFeed,
    handleBarcodeScan,
    onboardScannedItem,
    // Wastage
    isWastageModalOpen,
    selectedWastageItem,
    selectedWastageBatch,
    openWastageModal,
    closeWastageModal,
    logWastage,
  };
}
