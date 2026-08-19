"use client";

import React, { useState } from "react";
import {
  Barcode,
  Edit,
  Image as ImageIcon,
  Layers,
  Moon,
  Percent,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  AdminCategory,
  AdminMenuItem,
  AdminVariant,
  MenuItemFormState,
  RestaurantProfile,
} from "../adminTypes";
import { MenuSettingsDrawer } from "../modals/MenuSettingsDrawer";
import { resolveImageUrl } from "@/lib/api";
import { uploadImageFile } from "../adminUtils";

interface MenuTabProps {
  categories: AdminCategory[];
  menuItems: AdminMenuItem[];
  variantsByItem: Record<string, AdminVariant[]>;
  selectedCategory: string;
  setSelectedCategory: (catId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSaveItem: (itemId: string | null, data: MenuItemFormState) => Promise<void>;
  onSaveBatchItems?: (updates: { id: string; name: string; mrp: string; price: string; evening_price: string }[]) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onToggleAvailability: (itemId: string, isAvailable: boolean) => Promise<void>;
  onOpenVariantModal: (item: AdminMenuItem) => void;
  onOpenOfferModal: (item: AdminMenuItem) => void;
  onCreateCategory?: (name: string) => Promise<any>;
  inventoryItems?: { id: string; name: string; barcode?: string | null }[];
  restaurant?: RestaurantProfile | null;
  onRestaurantUpdate?: (r: RestaurantProfile) => void;
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
  onSaveBatchItems,
  onDeleteItem,
  onToggleAvailability,
  onOpenVariantModal,
  onOpenOfferModal,
  onCreateCategory,
  inventoryItems,
  restaurant,
  onRestaurantUpdate,
}: MenuTabProps) {
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);

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

  const [modalError, setModalError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Inline Category Creation & Custom Tax state
  const [showInlineCatInput, setShowInlineCatInput] = useState(false);
  const [inlineCatName, setInlineCatName] = useState("");
  const [isCreatingInlineCat, setIsCreatingInlineCat] = useState(false);
  const [isCustomTax, setIsCustomTax] = useState(false);

  const handleInlineCategoryCreate = async () => {
    if (!inlineCatName.trim() || !onCreateCategory) return;
    try {
      setIsCreatingInlineCat(true);
      const created = await onCreateCategory(inlineCatName.trim());
      setInlineCatName("");
      setShowInlineCatInput(false);
      if (created?.id) {
        setFormData((prev) => ({ ...prev, category_id: created.id }));
      }
    } catch (err: any) {
      setModalError(err?.message || "Failed to create category");
    } finally {
      setIsCreatingInlineCat(false);
    }
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingImage(true);
      setModalError(null);
      const url = await uploadImageFile(file);
      setFormData((prev) => ({ ...prev, image_url: url }));
    } catch (err: any) {
      setModalError(err.message || "Failed to upload image photo.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setModalError(null);
    setShowInlineCatInput(false);
    setInlineCatName("");
    setIsCustomTax(false);
    setFormData({
      category_id: selectedCategory !== "ALL" ? selectedCategory : (categories[0]?.id || ""),
      inventory_item_id: null,
      name: "",
      barcode: "",
      image_url: "",
      price: "",
      wholesale_price: "",
      evening_price: "",
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
    setModalError(null);
    setShowInlineCatInput(false);
    setInlineCatName("");
    const isCustom = !!item.tax_category && !["GST 0%", "GST 5%", "GST 12%", "GST 18%", "GST 28%"].includes(item.tax_category);
    setIsCustomTax(isCustom);
    setFormData({
      category_id: item.category_id,
      inventory_item_id: item.inventory_item_id || null,
      name: item.name,
      barcode: item.barcode || "",
      image_url: item.image_url || "",
      price: item.price,
      wholesale_price: item.wholesale_price ? String(item.wholesale_price) : "",
      evening_price: item.evening_price ? String(item.evening_price) : "",
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
    setModalError(null);

    const priceNum = parseFloat(formData.price) || 0;
    const eveningPriceNum = formData.evening_price ? parseFloat(formData.evening_price) : null;
    const isEveningActive = restaurant?.evening_price_active ?? false;
    const effectivePriceNum = (isEveningActive && eveningPriceNum !== null && !isNaN(eveningPriceNum) && eveningPriceNum > 0)
      ? eveningPriceNum
      : priceNum;
    const mrpNum = formData.mrp ? parseFloat(formData.mrp) : null;

    if (!formData.category_id || formData.category_id.trim() === "") {
      setModalError("Please select a valid Category. If no categories exist, click '+ Category' to create one first.");
      return;
    }

    if (mrpNum !== null && !isNaN(mrpNum) && mrpNum > 0 && mrpNum < effectivePriceNum) {
      setModalError(`MRP (₹${mrpNum.toFixed(2)}) cannot be smaller than effective Selling Price (₹${effectivePriceNum.toFixed(2)}). MRP must be greater than or equal to Selling Price.`);
      return;
    }

    try {
      await onSaveItem(editingItem ? editingItem.id : null, formData);
      setIsItemModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || "Failed to save menu item.");
    }
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

          <button
            type="button"
            onClick={() => setIsSettingsDrawerOpen(true)}
            className="p-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent-brand)] hover:text-[var(--accent-brand)] transition"
            title="Menu Settings"
          >
            <Settings2 className="h-4 w-4" />
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
            const rawPriceVal = parseFloat(item.price) || 0;
            const eveningPriceVal = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
            const isEveningActive = restaurant?.evening_price_active ?? false;
            const priceVal = (isEveningActive && eveningPriceVal > 0) ? eveningPriceVal : rawPriceVal;
            const hasDiscount = mrpVal > priceVal;
            const discPercent = hasDiscount ? Math.round(((mrpVal - priceVal) / mrpVal) * 100) : 0;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 hover:border-[var(--accent-brand)] transition"
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail Image */}
                  <div className="h-12 w-12 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img
                        src={resolveImageUrl(item.image_url)}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-[var(--text-muted)] opacity-50" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                        <span className="truncate">{item.name}</span>
                        {isEveningActive && eveningPriceVal > 0 && (
                          <span title={`Evening Price Active: ₹${eveningPriceVal.toFixed(2)}`}>
                            <Moon className="h-3.5 w-3.5 text-amber-400 fill-amber-400/20 shrink-0 cursor-pointer" />
                          </span>
                        )}
                      </h4>
                      <div className="text-right shrink-0">
                        {hasDiscount && (
                          <span className="line-through text-xs text-[var(--text-muted)] font-mono block">
                            ₹{mrpVal.toFixed(2)}
                          </span>
                        )}
                        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                          ₹{priceVal.toFixed(2)}
                        </span>
                        {item.pricing_mode === "WEIGHT_BASED" && (
                          <span className="text-[10px] text-[var(--text-muted)] block">
                            per {item.unit_label || "kg"}
                          </span>
                        )}
                      </div>
                    </div>

                    {item.barcode && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-brand)] mt-0.5">
                        <Barcode className="h-3 w-3" />
                        {item.barcode}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={() => onToggleAvailability(item.id, !item.is_available)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
                      item.is_available
                        ? "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                        : "bg-red-500/10 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {item.is_available ? "In Stock" : "Unavailable"}
                  </button>

                  {hasDiscount && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
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

            {modalError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-400">
                ⚠️ {modalError}
              </div>
            )}

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

              <div>
                <label className="block font-semibold mb-1">Product Photo / Image (Optional)</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="https://... or upload photo"
                      value={formData.image_url || ""}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                    />
                    <label className="flex items-center gap-1.5 cursor-pointer rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition shrink-0">
                      <Upload className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                      <span>{isUploadingImage ? "Uploading..." : "Upload File"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploadingImage}
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {formData.image_url && (
                    <div className="relative flex items-center gap-3 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
                      <img
                        src={resolveImageUrl(formData.image_url)}
                        alt="Preview"
                        className="h-10 w-10 rounded-lg object-cover bg-black/20 shrink-0"
                      />
                      <span className="text-[11px] text-[var(--text-muted)] truncate flex-1 font-mono">
                        {formData.image_url}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image_url: "" })}
                        className="p-1 text-rose-400 hover:text-rose-300 transition shrink-0"
                        title="Remove photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-xs">Category *</label>
                    <button
                      type="button"
                      onClick={() => setShowInlineCatInput(!showInlineCatInput)}
                      className="text-[11px] font-bold text-[var(--accent-brand)] hover:underline"
                    >
                      {showInlineCatInput ? "Cancel" : "+ New"}
                    </button>
                  </div>

                  {showInlineCatInput ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input
                        type="text"
                        placeholder="Category name"
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleInlineCategoryCreate();
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={isCreatingInlineCat || !inlineCatName.trim()}
                        onClick={() => void handleInlineCategoryCreate()}
                        className="rounded-xl bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 shrink-0"
                      >
                        {isCreatingInlineCat ? "..." : "Add"}
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.category_id}
                      onChange={(e) => {
                        if (e.target.value === "__ADD_NEW__") {
                          setShowInlineCatInput(true);
                        } else {
                          setFormData({ ...formData, category_id: e.target.value });
                        }
                      }}
                      required
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                    >
                      {(!formData.category_id || categories.length === 0) && (
                        <option value="">-- Choose Category --</option>
                      )}
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Add New Category...</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-xs">Tax Category</label>
                  <select
                    value={isCustomTax ? "CUSTOM" : (formData.tax_category || "GST 0%")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "CUSTOM") {
                        setIsCustomTax(true);
                        const rate = formData.tax_rate || "5";
                        setFormData({
                          ...formData,
                          tax_category: `GST Custom (${rate}%)`,
                          tax_rate: rate,
                        });
                      } else {
                        setIsCustomTax(false);
                        let rate = "0";
                        if (val === "GST 5%") rate = "5";
                        else if (val === "GST 12%") rate = "12";
                        else if (val === "GST 18%") rate = "18";
                        else if (val === "GST 28%") rate = "28";
                        setFormData({ ...formData, tax_category: val, tax_rate: rate });
                      }
                    }}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    <option value="GST 0%">GST 0% (Exempt)</option>
                    <option value="GST 5%">GST 5%</option>
                    <option value="GST 12%">GST 12%</option>
                    <option value="GST 18%">GST 18%</option>
                    <option value="GST 28%">GST 28%</option>
                    <option value="CUSTOM">Custom Tax Rate...</option>
                  </select>

                  {isCustomTax && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="Rate e.g. 3"
                        value={formData.tax_rate || ""}
                        onChange={(e) => {
                          const rateVal = e.target.value;
                          setFormData({
                            ...formData,
                            tax_category: rateVal ? `GST Custom (${rateVal}%)` : "GST Custom",
                            tax_rate: rateVal,
                          });
                        }}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 font-mono text-xs text-[var(--text-primary)]"
                      />
                      <span className="text-xs font-bold text-[var(--text-muted)]">%</span>
                    </div>
                  )}
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

              <div>
                <label className="block font-semibold mb-1 flex items-center justify-between">
                  <span>Evening Price (₹) <span className="text-[10px] text-[var(--text-muted)] font-normal">(Optional)</span></span>
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">Priority Override</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Evening override price (replaces selling price)"
                  value={formData.evening_price || ""}
                  onChange={(e) => setFormData({ ...formData, evening_price: e.target.value })}
                  className="w-full rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 outline-none"
                />
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

      {/* Menu Settings Drawer (Bulk Price + Catalogue Print) */}
      <MenuSettingsDrawer
        isOpen={isSettingsDrawerOpen}
        onClose={() => setIsSettingsDrawerOpen(false)}
        menuItems={menuItems}
        categories={categories}
        restaurant={restaurant || null}
        onSaveBatchItems={onSaveBatchItems || (async () => {})}
        onRestaurantUpdate={onRestaurantUpdate}
      />
    </div>
  );
}
