import React, { useState, useEffect } from "react";
import { Barcode, CheckCircle2, Package, Sparkles, X, Building2, Plus, Search } from "lucide-react";
import type { InventoryUnit, InventoryItem, Supplier } from "@/types";

interface BarcodeRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  categories: string[];
  items?: InventoryItem[];
  suppliers?: Supplier[];
  prefillItem?: InventoryItem | null;
  onOpenAddSupplierModal?: () => void;
  onSuccess: (itemName: string, stock: string) => void;
  onboardItem: (data: {
    item_id?: string;
    barcode: string;
    name: string;
    category: string;
    unit: InventoryUnit;
    initial_stock: number;
    cost_per_unit: number;
    selling_price?: number;
    mrp?: number;
    wholesale_price?: number;
    tax_category?: string;
    tax_rate?: number;
    sorted_quantity?: number;
    total_billed_amount?: number;
    reorder_threshold?: number;
    batch_number?: string;
    expiry_date?: string;
    shelf_life_alert_hrs?: number;
    supplier_name?: string;
  }) => Promise<void>;
}

export function BarcodeRegisterModal({
  isOpen,
  onClose,
  barcode,
  categories,
  items = [],
  suppliers = [],
  prefillItem,
  onOpenAddSupplierModal,
  onSuccess,
  onboardItem,
}: BarcodeRegisterModalProps) {
  const [customBarcode, setCustomBarcode] = useState(barcode);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);

  const [category, setCategory] = useState(categories[0] || "General");
  const [categorySearch, setCategorySearch] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  const [unit, setUnit] = useState<InventoryUnit>("pcs");
  const [initialStock, setInitialStock] = useState("1");
  const [sortedQuantity, setSortedQuantity] = useState("");
  const [totalBilledAmount, setTotalBilledAmount] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("0");
  const [mrp, setMrp] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");

  const [taxCategory, setTaxCategory] = useState("GST 0%");
  const [taxRate, setTaxRate] = useState("0");
  const [customTaxRate, setCustomTaxRate] = useState("");

  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [shelfLifeAlertHrs, setShelfLifeAlertHrs] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-populate item fields from an existing InventoryItem instance
  const populateFromItem = (itm: InventoryItem) => {
    setSelectedItemId(itm.id);
    setName(itm.name);
    setCategory(itm.category || categories[0] || "General");
    setUnit(itm.unit || "pcs");
    if (itm.barcode) setCustomBarcode(itm.barcode);
    if (itm.mrp != null) setMrp(String(itm.mrp));
    if ((itm as any).selling_price != null) setSellingPrice(String((itm as any).selling_price));
    if (itm.wholesale_price != null) setWholesalePrice(String(itm.wholesale_price));
    if (itm.cost_per_unit != null) setCostPerUnit(String(itm.cost_per_unit));
    if (itm.tax_category) setTaxCategory(itm.tax_category);
    if (itm.tax_rate != null) setTaxRate(String(itm.tax_rate));
    if (itm.shelf_life_alert_hrs != null) setShelfLifeAlertHrs(String(itm.shelf_life_alert_hrs));
    const supp = (itm as any).supplier_name || (itm as any).batches?.[0]?.supplier_name || "";
    if (supp) setSupplierName(supp);
    setIsItemDropdownOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      if (prefillItem) {
        populateFromItem(prefillItem);
      } else {
        setSelectedItemId(undefined);
        setCustomBarcode(barcode);
        setName("");
        setCategory(categories[0] || "General");
        setUnit("pcs");
        setCostPerUnit("0");
        setMrp("");
        setSellingPrice("");
        setWholesalePrice("");
        setTaxCategory("GST 0%");
        setTaxRate("0");
        setSupplierName("");
      }
      setCategorySearch("");
      setIsCategoryDropdownOpen(false);
      setInitialStock("1");
      setSortedQuantity("");
      setTotalBilledAmount("");
      setCustomTaxRate("");
      setBatchNumber(`BAT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
      setExpiryDate("");
      setShelfLifeAlertHrs("");
      setError(null);
    }
  }, [isOpen, barcode, categories, prefillItem]);

  // Recalculate cost_per_unit dynamically when totalBilledAmount, sortedQuantity, or initialStock changes
  useEffect(() => {
    const billed = parseFloat(totalBilledAmount);
    const sorted = parseFloat(sortedQuantity);
    const initial = parseFloat(initialStock);

    if (!isNaN(billed) && billed > 0) {
      const effQty = !isNaN(sorted) && sorted > 0 ? sorted : !isNaN(initial) && initial > 0 ? initial : 1;
      setCostPerUnit((billed / effQty).toFixed(2));
    }
  }, [totalBilledAmount, sortedQuantity, initialStock]);

  if (!isOpen) return null;

  const handleTaxCategoryChange = (val: string) => {
    setTaxCategory(val);
    if (val === "GST 0%") setTaxRate("0");
    else if (val === "GST 5%") setTaxRate("5");
    else if (val === "GST 12%") setTaxRate("12");
    else if (val === "GST 18%") setTaxRate("18");
    else if (val === "GST 28%") setTaxRate("28");
  };

  const filteredCategories = categories.filter((c) =>
    c.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a product name");
      return;
    }

    const billed = parseFloat(totalBilledAmount);
    const sorted = parseFloat(sortedQuantity);
    const initial = parseFloat(initialStock) || 0;
    const sellPriceNum = parseFloat(sellingPrice);
    const mrpNum = parseFloat(mrp);

    if (initial < 0 || (!isNaN(sorted) && sorted < 0) || (!isNaN(billed) && billed < 0)) {
      setError("Stock quantities and bill amounts cannot be negative numbers");
      return;
    }

    if (!isNaN(mrpNum) && mrpNum > 0 && !isNaN(sellPriceNum) && sellPriceNum > mrpNum) {
      setError(`Selling price (₹${sellPriceNum.toFixed(2)}) cannot exceed MRP (₹${mrpNum.toFixed(2)})`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const effQty = !isNaN(sorted) && sorted > 0 ? sorted : (initial > 0 ? initial : 1);
      const finalCost = !isNaN(billed) && billed > 0 ? billed / effQty : parseFloat(costPerUnit) || 0;
      const finalTaxRate = taxCategory === "Custom" ? parseFloat(customTaxRate) || 0 : parseFloat(taxRate) || 0;

      await onboardItem({
        item_id: selectedItemId,
        barcode: customBarcode.trim(),
        name: name.trim(),
        category: category.trim() || "General",
        unit,
        initial_stock: initial,
        sorted_quantity: !isNaN(sorted) && sorted > 0 ? sorted : undefined,
        total_billed_amount: !isNaN(billed) && billed > 0 ? billed : undefined,
        cost_per_unit: finalCost,
        selling_price: sellingPrice.trim() ? parseFloat(sellingPrice) : undefined,
        mrp: mrp.trim() ? parseFloat(mrp) : undefined,
        wholesale_price: wholesalePrice.trim() ? parseFloat(wholesalePrice) : undefined,
        tax_category: taxCategory === "Custom" ? `GST ${finalTaxRate}%` : taxCategory,
        tax_rate: finalTaxRate,
        batch_number: batchNumber.trim() || undefined,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        shelf_life_alert_hrs: shelfLifeAlertHrs.trim() ? parseInt(shelfLifeAlertHrs, 10) : undefined,
        supplier_name: supplierName.trim() || undefined,
      });

      onSuccess(name.trim(), String(effQty));
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to register product");
    } finally {
      setIsSubmitting(false);
    }
  };

  const effStock = parseFloat(sortedQuantity) > 0 ? parseFloat(sortedQuantity) : parseFloat(initialStock) || 1;
  const computedCost = parseFloat(totalBilledAmount) > 0 ? (parseFloat(totalBilledAmount) / effStock).toFixed(2) : costPerUnit;
  const mrpVal = parseFloat(mrp);
  const sellVal = parseFloat(sellingPrice);
  const discountPercent = mrpVal > 0 && sellVal > 0 && mrpVal > sellVal ? Math.round(((mrpVal - sellVal) / mrpVal) * 100) : 0;
  const discountAmount = mrpVal > 0 && sellVal > 0 && mrpVal > sellVal ? (mrpVal - sellVal).toFixed(2) : "0.00";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {customBarcode.trim() ? "New Barcode Scanned!" : "Register Inventory Product & Batch"}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Inward stock with automatic cost calculation, MRP & tax rates.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barcode Field */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Barcode className="h-4 w-4 text-[var(--accent-brand)]" />
              Scanned / Item Barcode
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-normal">
              (Optional for loose items e.g. Potato)
            </span>
          </label>
          <input
            type="text"
            placeholder="Scan or type barcode (Optional)"
            value={customBarcode}
            onChange={(e) => setCustomBarcode(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono font-bold text-[var(--accent-brand)] focus:border-[var(--accent-brand)] focus:outline-none placeholder:font-sans placeholder:font-normal placeholder:text-[var(--text-muted)]"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Product Name with Existing Item Auto-Suggest */}
          <div className="relative">
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
              <span>Product / Item Name *</span>
              {selectedItemId && (
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  Adding batch to existing item
                </span>
              )}
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="Type to search existing item or enter new item name..."
              value={name}
              onFocus={() => setIsItemDropdownOpen(true)}
              onChange={(e) => {
                setName(e.target.value);
                setSelectedItemId(undefined);
                setIsItemDropdownOpen(true);
              }}
              onBlur={() => {
                setTimeout(() => setIsItemDropdownOpen(false), 200);
              }}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
            />

            {/* Existing Items Auto-suggest Dropdown */}
            {isItemDropdownOpen && name.trim() && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1 shadow-2xl">
                {items
                  .filter((itm) => itm.name.toLowerCase().includes(name.trim().toLowerCase()))
                  .slice(0, 8)
                  .map((itm) => (
                    <button
                      key={itm.id}
                      type="button"
                      onMouseDown={() => {
                        populateFromItem(itm);
                      }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--accent-brand)]/15 transition flex items-center justify-between border-b border-[var(--border-subtle)] last:border-0"
                    >
                      <div>
                        <p className="font-bold text-[var(--text-primary)]">{itm.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          Stock: {Number(itm.current_stock).toFixed(2)} {itm.unit} • {itm.category}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Select Existing
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Category Combobox Dropdown & Unit */}
          <div className="grid grid-cols-2 gap-3">
            {/* Category Combobox */}
            <div className="relative">
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Category *
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Select or type new category..."
                  value={isCategoryDropdownOpen ? categorySearch : category}
                  onFocus={() => {
                    setIsCategoryDropdownOpen(true);
                    setCategorySearch(category);
                  }}
                  onChange={(e) => {
                    setCategorySearch(e.target.value);
                    setCategory(e.target.value);
                    setIsCategoryDropdownOpen(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setIsCategoryDropdownOpen(false), 200);
                  }}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              {/* Combobox Dropdown List */}
              {isCategoryDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1 shadow-xl">
                  {filteredCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={() => {
                        setCategory(c);
                        setCategorySearch(c);
                        setIsCategoryDropdownOpen(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--accent-brand)]/15 hover:text-[var(--accent-brand)] transition"
                    >
                      {c}
                    </button>
                  ))}
                  {categorySearch.trim() && !categories.some(c => c.toLowerCase() === categorySearch.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onMouseDown={() => {
                        setCategory(categorySearch.trim());
                        setIsCategoryDropdownOpen(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 transition"
                    >
                      + Create category "{categorySearch.trim()}"
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Unit of Measurement
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              >
                <option value="pcs">Pieces / Pack (pcs)</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="g">Gram (g)</option>
                <option value="l">Liter (l)</option>
                <option value="ml">Milliliter (ml)</option>
              </select>
            </div>
          </div>

          {/* Inward Quantity & Invoice Cost Calculator */}
          <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]/40 p-3 space-y-2.5">
            <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
              <span>Inward Quantity & Invoice Cost</span>
              <span className="text-[10px] text-[var(--text-muted)] font-normal">Calculates Cost/Unit automatically</span>
            </h4>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Initial Qty *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="e.g. 100"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Total Billed (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 1000"
                  value={totalBilledAmount}
                  onChange={(e) => setTotalBilledAmount(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Sorted Qty (Opt)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 80"
                  value={sortedQuantity}
                  onChange={(e) => setSortedQuantity(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>
            </div>

            {/* Calculated Cost / Unit Feedback Badge */}
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-surface-elevated)] px-3 py-1.5 border border-[var(--border-subtle)] text-xs">
              <span className="text-[var(--text-muted)] font-medium">Cost / Unit:</span>
              <span className="font-mono font-bold text-emerald-400">
                ₹{computedCost} / {unit}
              </span>
            </div>
          </div>

          {/* Pricing (MRP vs Retail Selling Price vs Wholesale Price) */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                MRP (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Printed MRP"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Retail Price (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Store POS price"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Wholesale (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Bulk POS price"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                className="w-full rounded-xl border border-purple-500/40 bg-purple-500/5 px-3 py-2 text-xs font-mono text-purple-300 placeholder:text-purple-400/40 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Live Discount Preview Badge */}
          {discountPercent > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 font-medium">
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-[11px]">
                {discountPercent}% OFF
              </span>
              <span>Customer saves ₹{discountAmount} compared to MRP</span>
            </div>
          )}

          {/* Tax Category (GST Rate %) */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Tax Category (GST %)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={taxCategory}
                onChange={(e) => handleTaxCategoryChange(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              >
                <option value="GST 0%">GST 0% (Exempt)</option>
                <option value="GST 5%">GST 5%</option>
                <option value="GST 12%">GST 12%</option>
                <option value="GST 18%">GST 18%</option>
                <option value="GST 28%">GST 28%</option>
                <option value="Custom">Custom Tax Rate...</option>
              </select>

              {taxCategory === "Custom" && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Custom GST %"
                  value={customTaxRate}
                  onChange={(e) => setCustomTaxRate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* Batch Tracking & Supplier Fields */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 p-3 space-y-2.5">
            <h4 className="text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                Batch Lot & Supplier Details
              </span>
            </h4>

            {/* Supplier Selector */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-purple-400" /> Vendor / Supplier
                </span>
                {onOpenAddSupplierModal && (
                  <button
                    type="button"
                    onClick={onOpenAddSupplierModal}
                    className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Add Supplier
                  </button>
                )}
              </label>
              <div className="flex gap-2">
                <select
                  value={supplierName}
                  onChange={(e) => {
                    if (e.target.value === "__ADD_NEW__") {
                      if (onOpenAddSupplierModal) onOpenAddSupplierModal();
                    } else {
                      setSupplierName(e.target.value);
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select Supplier (Optional)...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} {s.phone ? `(${s.phone})` : ""}
                    </option>
                  ))}
                  {onOpenAddSupplierModal && (
                    <option value="__ADD_NEW__" className="font-bold text-purple-400">
                      + Add New Supplier...
                    </option>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Batch / Lot #
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1 text-red-400">
                  Shelf Life Alert (Hrs)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="Optional"
                  value={shelfLifeAlertHrs}
                  onChange={(e) => setShelfLifeAlertHrs(e.target.value)}
                  className="w-full rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-xs font-mono text-red-300 focus:border-red-500 focus:outline-none placeholder:text-red-900/50"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:opacity-90 transition disabled:opacity-50 shadow-md"
            >
              {isSubmitting ? (
                "Saving..."
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save & Inward Stock
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
