"use client";

import React, { useState } from "react";
import {
  Barcode,
  Edit,
  Layers,
  Percent,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import type {
  AdminCategory,
  AdminMenuItem,
  AdminVariant,
  MenuItemFormState,
} from "../adminTypes";

interface MenuTabProps {
  categories: AdminCategory[];
  menuItems: AdminMenuItem[];
  variantsByItem: Record<string, AdminVariant[]>;
  selectedCategory: string;
  setSelectedCategory: (catId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSaveItem: (itemId: string | null, data: MenuItemFormState) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onToggleAvailability: (itemId: string, isAvailable: boolean) => Promise<void>;
  onOpenVariantModal: (item: AdminMenuItem) => void;
  onOpenOfferModal: (item: AdminMenuItem) => void;
  onCreateCategory?: (name: string) => Promise<any>;
  inventoryItems?: { id: string; name: string; barcode?: string | null }[];
}

export function MenuTab({
  categories,
  menuItems,
  variantsByItem,
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  onSaveItem,
  onDeleteItem,
  onToggleAvailability,
  onOpenVariantModal,
  onOpenOfferModal,
  onCreateCategory,
  inventoryItems,
}: MenuTabProps) {
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null);

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [isSubmittingCat, setIsSubmittingCat] = useState(false);

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim() || !onCreateCategory) return;
    try {
      setIsSubmittingCat(true);
      await onCreateCategory(newCatName.trim());
      setNewCatName("");
      setIsCategoryModalOpen(false);
    } catch {
      /* handled in hook */
    } finally {
      setIsSubmittingCat(false);
    }
  };

  const [formData, setFormData] = useState<MenuItemFormState>({
    category_id: categories[0]?.id || "",
    inventory_item_id: null,
    name: "",
    barcode: "",
    price: "",
    description: "",
    is_available: true,
    is_on_offer: false,
    is_verification_required: false,
    offer_price: "",
    offer_label: "",
    mrp: "",
    tax_category: "GST 0%",
    tax_rate: "0",
    pricing_mode: "FIXED_UNIT",
    unit_label: "piece",
  });

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      category_id: selectedCategory !== "ALL" ? selectedCategory : (categories[0]?.id || ""),
      inventory_item_id: null,
      name: "",
      barcode: "",
      price: "",
      description: "",
      is_available: true,
      is_on_offer: false,
      is_verification_required: false,
      offer_price: "",
      offer_label: "",
      mrp: "",
      tax_category: "GST 0%",
      tax_rate: "0",
      pricing_mode: "FIXED_UNIT",
      unit_label: "piece",
    });
    setIsItemModalOpen(true);
  };

  const openEditModal = (item: AdminMenuItem) => {
    setEditingItem(item);
    setFormData({
      category_id: item.category_id,
      inventory_item_id: item.inventory_item_id || null,
      name: item.name,
      barcode: item.barcode || "",
      price: item.price,
      description: item.description || "",
      is_available: item.is_available,
      is_on_offer: !!item.is_on_offer,
      is_verification_required: !!item.is_verification_required,
      offer_price: item.offer_price || "",
      offer_label: item.offer_label || "",
      mrp: item.mrp || "",
      tax_category: item.tax_category || "GST 0%",
      tax_rate: String(item.tax_rate ?? 0),
      pricing_mode: item.pricing_mode || "FIXED_UNIT",
      unit_label: item.unit_label || "piece",
    });
    setIsItemModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveItem(editingItem ? editingItem.id : null, formData);
    setIsItemModalOpen(false);
  };

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.barcode && item.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat =
      selectedCategory === "ALL" || item.category_id === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Category Pills & Actions Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`flex-shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              selectedCategory === "ALL"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            All Products ({menuItems.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCategory(c.id)}
              className={`flex-shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                selectedCategory === c.id
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
              }`}
            >
              {c.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex-shrink-0 rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/10 transition flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Category
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search items or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)]"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
          >
            <Tag className="h-4 w-4 text-[var(--accent-brand)]" />
            + Category
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-1.5 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* Product Cards Grid / Empty State */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-12 text-center">
          <div className="rounded-full bg-[var(--accent-brand)]/10 p-4 text-[var(--accent-brand)] mb-3">
            <Sparkles className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">No products in catalog</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-sm">
            Your catalog is currently empty. Click the <span className="font-semibold text-[var(--accent-brand)]">+ Add Item</span> button above to create your first product.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" />
            Add First Product
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => {
            const variants = variantsByItem[item.id] || [];
            const mrpVal = item.mrp ? parseFloat(item.mrp) : 0;
            const priceVal = parseFloat(item.price) || 0;
            const hasDiscount = mrpVal > priceVal;
            const discPercent = hasDiscount ? Math.round(((mrpVal - priceVal) / mrpVal) * 100) : 0;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 hover:border-[var(--accent-brand)] transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-[var(--text-primary)]">{item.name}</h4>
                    {item.barcode && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-brand)] mt-0.5">
                        <Barcode className="h-3 w-3" />
                        {item.barcode}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    {hasDiscount && (
                      <span className="line-through text-xs text-[var(--text-muted)] font-mono block">
                        ₹{mrpVal.toFixed(2)}
                      </span>
                    )}
                    <span className="font-mono text-sm font-bold text-emerald-400">
                      ₹{priceVal.toFixed(2)}
                    </span>
                    {item.pricing_mode === "WEIGHT_BASED" && (
                      <span className="text-[10px] text-[var(--text-muted)] block">
                        per {item.unit_label || "kg"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={() => onToggleAvailability(item.id, !item.is_available)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                      item.is_available
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-red-500/10 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {item.is_available ? "In Stock" : "Unavailable"}
                  </button>

                  {hasDiscount && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                      🏷️ {discPercent}% OFF
                    </span>
                  )}

                  {item.inventory_item_id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                      Direct 1:1 Stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] font-bold text-gray-400 border border-gray-500/30">
                      Recipe / Auto Match
                    </span>
                  )}

                  {item.tax_category && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                      {item.tax_category}
                    </span>
                  )}

                  {item.is_verification_required && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                      <ShieldAlert className="h-3 w-3" />
                      Anti-Theft Verified
                    </span>
                  )}

                  {item.is_on_offer && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30">
                      <Sparkles className="h-3 w-3" />
                      Offer: ₹{item.offer_price}
                    </span>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenVariantModal(item)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--accent-brand)] transition"
                      title="Manage Variants"
                    >
                      <Layers className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenOfferModal(item)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-purple-400 transition"
                      title="Special Offer"
                    >
                      <Percent className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-blue-400 transition"
                      title="Edit Item"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition"
                    title="Delete Item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Item Modal */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-2xl">
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              {editingItem ? "Edit Menu Item" : "Create New Menu Item"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Barcode (Optional)</label>
                <input
                  type="text"
                  placeholder="Scan or enter barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                />
              </div>

              {inventoryItems && inventoryItems.length > 0 && (
                <div>
                  <label className="block font-semibold mb-1">Direct Inventory Item (1:1 Stock Link)</label>
                  <select
                    value={formData.inventory_item_id || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, inventory_item_id: e.target.value || null })
                    }
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">-- Direct 1:1 Auto-Match / Recipe Managed --</option>
                    {inventoryItems.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} {inv.barcode ? `(${inv.barcode})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Category *</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Tax Category</label>
                  <select
                    value={formData.tax_category || "GST 0%"}
                    onChange={(e) => {
                      const val = e.target.value;
                      let rate = "0";
                      if (val === "GST 5%") rate = "5";
                      else if (val === "GST 12%") rate = "12";
                      else if (val === "GST 18%") rate = "18";
                      else if (val === "GST 28%") rate = "28";
                      setFormData({ ...formData, tax_category: val, tax_rate: rate });
                    }}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    <option value="GST 0%">GST 0% (Exempt)</option>
                    <option value="GST 5%">GST 5%</option>
                    <option value="GST 12%">GST 12%</option>
                    <option value="GST 18%">GST 18%</option>
                    <option value="GST 28%">GST 28%</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Printed price"
                    value={formData.mrp || ""}
                    onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="POS Billed price"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_available}
                    onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>Available in Store</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_verification_required}
                    onChange={(e) =>
                      setFormData({ ...formData, is_verification_required: e.target.checked })
                    }
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>Anti-Theft Verified</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-xs font-bold text-[var(--text-on-accent)]"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Creation Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-[var(--accent-brand)]" />
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Create New Category
              </h3>
            </div>

            <form onSubmit={handleCreateCategorySubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fresh Dairy & Milk, Beverages, Bakery"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCat || !newCatName.trim()}
                  className="rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-xs font-bold text-[var(--text-on-accent)] disabled:opacity-50"
                >
                  {isSubmittingCat ? "Creating..." : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
