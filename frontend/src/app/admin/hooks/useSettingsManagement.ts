import { FormEvent, useState } from "react";
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
  });
  const [isSavingRestaurant, setIsSavingRestaurant] = useState(false);

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
