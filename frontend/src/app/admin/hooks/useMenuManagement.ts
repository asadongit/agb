"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminCategory,
  AdminMenuItem,
  AdminVariant,
  MenuItemFormState,
  OfferFormState,
  VariantFormState,
} from "../adminTypes";

type UseMenuManagementProps = {
  accessToken: string | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setNotice?: (msg: string | null) => void;
  setError?: (msg: string | null) => void;
};

export function useMenuManagement({
  accessToken,
  apiRequest,
  setNotice,
  setError,
}: UseMenuManagementProps) {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([]);
  const [variantsByItem, setVariantsByItem] = useState<Record<string, AdminVariant[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);

  // Variant Modal State
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<AdminMenuItem | null>(null);
  const [currentVariants, setCurrentVariants] = useState<AdminVariant[]>([]);

  // Offer Modal State
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [selectedItemForOffer, setSelectedItemForOffer] = useState<AdminMenuItem | null>(null);

  // Load categories, items, and variants
  const loadCategoriesAndMenuItems = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoadingMenu(true);
      const [cats, items] = await Promise.all([
        apiRequest<AdminCategory[]>("/api/admin/categories"),
        apiRequest<AdminMenuItem[]>("/api/admin/menu-items"),
      ]);
      setCategories(cats);
      setMenuItems(items);

      // Group variants
      const vMap: Record<string, AdminVariant[]> = {};
      items.forEach((item) => {
        if (item.variants) {
          vMap[item.id] = item.variants;
        }
      });
      setVariantsByItem(vMap);
    } catch (err: any) {
      if (setError) setError(err?.message || "Failed to load menu data");
    } finally {
      setIsLoadingMenu(false);
    }
  }, [accessToken, apiRequest, setError]);

  useEffect(() => {
    loadCategoriesAndMenuItems();
  }, [loadCategoriesAndMenuItems]);

  // Create / Update MenuItem
  const handleSaveMenuItem = useCallback(
    async (itemId: string | null, formData: MenuItemFormState) => {
      try {
        if (itemId) {
          const updated = await apiRequest<AdminMenuItem>(
            `/api/admin/menu-items/${itemId}`,
            {
              method: "PATCH",
              body: JSON.stringify(formData),
            }
          );
          setMenuItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
        } else {
          const created = await apiRequest<AdminMenuItem>("/api/admin/menu-items", {
            method: "POST",
            body: JSON.stringify(formData),
          });
          setMenuItems((prev) => [created, ...prev]);
        }
        if (setNotice) setNotice(itemId ? "Item updated" : "Item created");
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to save item");
        throw err;
      }
    },
    [apiRequest, setNotice, setError]
  );

  // Delete MenuItem
  const handleDeleteMenuItem = useCallback(
    async (itemId: string) => {
      try {
        await apiRequest(`/api/admin/menu-items/${itemId}`, { method: "DELETE" });
        setMenuItems((prev) => prev.filter((it) => it.id !== itemId));
        if (setNotice) setNotice("Item deleted");
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to delete item");
      }
    },
    [apiRequest, setNotice, setError]
  );

  // Toggle Availability
  const handleToggleAvailability = useCallback(
    async (itemId: string, isAvailable: boolean) => {
      try {
        const updated = await apiRequest<AdminMenuItem>(
          `/api/admin/menu-items/${itemId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ is_available: isAvailable }),
          }
        );
        setMenuItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to toggle availability");
      }
    },
    [apiRequest, setError]
  );

  // Variant Modal handlers
  const openVariantModal = (item: AdminMenuItem) => {
    setSelectedItemForVariants(item);
    setCurrentVariants(variantsByItem[item.id] || []);
    setIsVariantModalOpen(true);
  };

  const closeVariantModal = () => {
    setIsVariantModalOpen(false);
    setSelectedItemForVariants(null);
    setCurrentVariants([]);
  };

  const handleSaveVariant = async (
    itemId: string,
    variantId: string | null,
    formState: VariantFormState
  ) => {
    if (variantId) {
      const updated = await apiRequest<AdminVariant>(
        `/api/admin/menu-items/${itemId}/variants/${variantId}`,
        {
          method: "PATCH",
          body: JSON.stringify(formState),
        }
      );
      setVariantsByItem((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] || []).map((v) => (v.id === variantId ? updated : v)),
      }));
    } else {
      const created = await apiRequest<AdminVariant>(
        `/api/admin/menu-items/${itemId}/variants`,
        {
          method: "POST",
          body: JSON.stringify(formState),
        }
      );
      setVariantsByItem((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), created],
      }));
    }
  };

  const handleDeleteVariant = async (itemId: string, variantId: string) => {
    await apiRequest(`/api/admin/menu-items/${itemId}/variants/${variantId}`, {
      method: "DELETE",
    });
    setVariantsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter((v) => v.id !== variantId),
    }));
  };

  // Offer Modal handlers
  const openOfferModal = (item: AdminMenuItem) => {
    setSelectedItemForOffer(item);
    setIsOfferModalOpen(true);
  };

  const closeOfferModal = () => {
    setIsOfferModalOpen(false);
    setSelectedItemForOffer(null);
  };

  const handleSaveOffer = async (itemId: string, formState: OfferFormState) => {
    const updated = await apiRequest<AdminMenuItem>(
      `/api/admin/menu-items/${itemId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          is_on_offer: true,
          offer_price: formState.offer_price,
          offer_label: formState.offer_label,
        }),
      }
    );
    setMenuItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
    closeOfferModal();
  };

  return {
    categories,
    setCategories,
    menuItems,
    setMenuItems,
    variantsByItem,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    isLoadingMenu,
    loadCategoriesAndMenuItems,
    handleSaveMenuItem,
    handleDeleteMenuItem,
    handleToggleAvailability,
    // Variants
    isVariantModalOpen,
    selectedItemForVariants,
    currentVariants,
    openVariantModal,
    closeVariantModal,
    handleSaveVariant,
    handleDeleteVariant,
    // Offers
    isOfferModalOpen,
    selectedItemForOffer,
    openOfferModal,
    closeOfferModal,
    handleSaveOffer,
  };
}
