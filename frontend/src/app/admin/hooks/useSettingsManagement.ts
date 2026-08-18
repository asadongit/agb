import { FormEvent, useState, useEffect } from "react";
import type {
  RestaurantFormState,
  RestaurantProfile,
} from "../adminTypes";

type UseSettingsManagementProps = {
  accessToken: string | null;
  restaurant: RestaurantProfile | null;
  setRestaurant: (rest: RestaurantProfile | null) => void;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function useSettingsManagement({
  accessToken,
  restaurant,
  setRestaurant,
  apiRequest,
  setNotice,
  setError,
}: UseSettingsManagementProps) {
  const [restaurantForm, setRestaurantForm] = useState<RestaurantFormState>({
    name: "",
    slug: "",
    payment_mode: "PAY_AT_COUNTER",
    razorpay_account_id: "",
    direct_upi_id: "",
    raw_upi_payload: "",
    logo_url: "",
    address: "",
    phone: "",
    gstin: "",
    fssai_no: "",
    session_duration_minutes: 30,
    public_basket_number: "",
    verification_amount_cutoff: "",
    flagged_item_ids: [],
    near_expiry_threshold_days: 7,
    notification_email: "",
  });
  const [isSavingRestaurant, setIsSavingRestaurant] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setRestaurantForm({
        name: restaurant.name || "",
        slug: restaurant.slug || "",
        payment_mode: restaurant.payment_mode || "PAY_AT_COUNTER",
        razorpay_account_id: restaurant.razorpay_account_id || "",
        direct_upi_id: restaurant.direct_upi_id || "",
        raw_upi_payload: restaurant.raw_upi_payload || "",
        logo_url: restaurant.logo_url || "",
        address: restaurant.address || "",
        phone: restaurant.phone || "",
        gstin: restaurant.gstin || "",
        fssai_no: restaurant.fssai_no || "",
        session_duration_minutes: restaurant.session_duration_minutes ?? 30,
        public_basket_number: restaurant.public_basket_number || "",
        verification_amount_cutoff:
          restaurant.verification_amount_cutoff !== null && restaurant.verification_amount_cutoff !== undefined
            ? String(restaurant.verification_amount_cutoff)
            : "",
        flagged_item_ids: restaurant.flagged_item_ids || [],
        near_expiry_threshold_days: restaurant.near_expiry_threshold_days ?? 7,
        notification_email: restaurant.notification_email || "",
      });
    }
  }, [restaurant]);

  const onSubmitRestaurantSettings = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setIsSavingRestaurant(true);
    setError(null);

    try {
      const payload = {
        name: restaurantForm.name.trim(),
        slug: restaurantForm.slug.trim(),
        payment_mode: restaurantForm.payment_mode,
        razorpay_account_id: restaurantForm.razorpay_account_id.trim() || null,
        direct_upi_id: restaurantForm.direct_upi_id.trim() || null,
        raw_upi_payload: restaurantForm.raw_upi_payload?.trim() || null,
        logo_url: restaurantForm.logo_url?.trim() || null,
        address: restaurantForm.address?.trim() || null,
        phone: restaurantForm.phone?.trim() || null,
        gstin: restaurantForm.gstin?.trim() || null,
        fssai_no: restaurantForm.fssai_no?.trim() || null,
        session_duration_minutes: restaurantForm.session_duration_minutes,
        public_basket_number: restaurantForm.public_basket_number?.trim() || null,
        verification_amount_cutoff: restaurantForm.verification_amount_cutoff?.trim() ? parseFloat(restaurantForm.verification_amount_cutoff) : null,
        flagged_item_ids: restaurantForm.flagged_item_ids || [],
        near_expiry_threshold_days: restaurantForm.near_expiry_threshold_days,
        notification_email: restaurantForm.notification_email?.trim() || null,
      };

      const updated = await apiRequest<RestaurantProfile>(
        "/api/admin/outlets/me",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      setRestaurant(updated);
      setNotice("Outlet configuration updated.");
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Unable to update outlet settings."
      );
    } finally {
      setIsSavingRestaurant(false);
    }
  };

  return {
    restaurantForm,
    setRestaurantForm,
    isSavingRestaurant,
    onSubmitRestaurantSettings,
  };
}
