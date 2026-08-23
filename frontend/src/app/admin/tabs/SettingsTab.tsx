/**
 * SettingsTab — Restaurant profile settings tab for the admin dashboard.
 *
 * Manages restaurant name, slug, payment mode, logo, address, tax info,
 * session settings, verification rules, and flagged products.
 * Extracted from admin page.tsx (lines 5261-5628).
 */

"use client";

import { FormEvent, useState } from "react";
import { Loader2, Save, Settings2, Upload } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import type { PaymentMode } from "@/types";
import type {
  AdminMenuItem,
  RestaurantFormState,
  RestaurantProfile,
} from "../adminTypes";
import { ACCESS_TOKEN_KEY } from "../adminTypes";
import { formatRupees } from "../adminUtils";

type SettingsTabProps = {
  restaurant: RestaurantProfile | null;
  menuItems: AdminMenuItem[];
  restaurantForm: RestaurantFormState;
  setRestaurantForm: React.Dispatch<React.SetStateAction<RestaurantFormState>>;
  isSavingRestaurant: boolean;
  onSubmitRestaurantSettings: (event: FormEvent<HTMLFormElement>) => void;
  accessToken: string | null;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function SettingsTab({
  restaurant,
  menuItems,
  restaurantForm,
  setRestaurantForm,
  isSavingRestaurant,
  onSubmitRestaurantSettings,
  accessToken,
  setNotice,
  setError,
}: SettingsTabProps) {
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Outlet Settings</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Manage outlet profile, payment modes, Razorpay keys, and UPI details
        </p>
      </div>

      <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Outlet Profile &amp; Payment Gateway</h2>
            <p className="text-xs text-[var(--text-secondary)]">Configure outlet payment mode and info</p>
          </div>
        </div>

        <form onSubmit={onSubmitRestaurantSettings} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Outlet Name</span>
            <input
              value={restaurantForm.name}
              onChange={(event) =>
                setRestaurantForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              required
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">URL Slug</span>
            <input
              value={restaurantForm.slug}
              onChange={(event) =>
                setRestaurantForm((current) => ({
                  ...current,
                  slug: event.target.value,
                }))
              }
              required
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Payment Mode</span>
            <select
              value={restaurantForm.payment_mode}
              onChange={(event) =>
                setRestaurantForm((current) => ({
                  ...current,
                  payment_mode: event.target.value as PaymentMode,
                }))
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
            >
              <option value="PAY_AT_COUNTER">Pay At Counter (Verify/Collect at counter)</option>
              <option value="RAZORPAY_GATEWAY">Razorpay Gateway (Instant automated)</option>
              <option value="BOTH">Both (Customer can choose at checkout)</option>
            </select>
          </label>

          {/* Store Logo & Tax / Registration Info */}
          <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Official Store & Receipt Branding</h3>

            {/* Logo Upload Input */}
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Store Logo URL</span>
              <div className="flex gap-2">
                <input
                  value={restaurantForm.logo_url}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      logo_url: event.target.value,
                    }))
                  }
                  placeholder="https://... or upload image"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
                <label className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-xs transition shrink-0 ${isUploadingLogo ? "bg-amber-600 opacity-80 pointer-events-none" : "bg-[var(--accent-brand)] hover:opacity-90"}`}>
                  {isUploadingLogo ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Logo</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isUploadingLogo}
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingLogo(true);
                      const formData = new FormData();
                      formData.append("file", file);
                      try {
                        const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) || accessToken;
                        const apiBase = getApiBaseUrl();
                        const res = await fetch(`${apiBase}/api/upload/image`, {
                          method: "POST",
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                          body: formData,
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setRestaurantForm((prev) => ({ ...prev, logo_url: data.url }));
                          setNotice("Store logo uploaded successfully! Click Save Settings.");
                        } else {
                          const errData = await res.json().catch(() => ({}));
                          setError(errData.detail || "Logo upload failed.");
                        }
                      } catch (err) {
                        console.error("Logo upload error:", err);
                        setError("Logo upload failed. Check connection.");
                      } finally {
                        setIsUploadingLogo(false);
                      }
                    }}
                  />
                </label>
              </div>
            </label>

            {/* Address */}
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Store Address</span>
              <input
                value={restaurantForm.address}
                onChange={(event) =>
                  setRestaurantForm((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
                placeholder="Full store address for receipts"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Contact Phone */}
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Contact Phone</span>
                <input
                  value={restaurantForm.phone}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="+91 9876543210"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
              </label>

              {/* GSTIN */}
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">GSTIN</span>
                <input
                  value={restaurantForm.gstin}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      gstin: event.target.value,
                    }))
                  }
                  placeholder="01AAFCB7044K1ZV"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                />
              </label>

              {/* FSSAI Registration */}
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">FSSAI Registration</span>
                <input
                  value={restaurantForm.fssai_no}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      fssai_no: event.target.value,
                    }))
                  }
                  placeholder="10718026..."
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              {/* Outlet Email */}
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Outlet Email</span>
                <input
                  type="email"
                  value={restaurantForm.email}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="store@apnagreenbasket.com"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                />
              </label>

              {/* Place of Supply */}
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Place of Supply (State)</span>
                <input
                  type="text"
                  value={restaurantForm.place_of_supply}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      place_of_supply: event.target.value,
                    }))
                  }
                  placeholder="Jammu and Kashmir"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
                <span className="text-[10px] text-[var(--text-muted)] block">State name for GST compliance on bills</span>
              </label>
            </div>

            {/* Bill QR URL */}
            <label className="block space-y-1 mt-3">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Bill QR URL</span>
              <input
                type="url"
                value={restaurantForm.bill_qr_url}
                onChange={(event) =>
                  setRestaurantForm((current) => ({
                    ...current,
                    bill_qr_url: event.target.value,
                  }))
                }
                placeholder="https://apnagreenbasket.com"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
              />
              <span className="text-[10px] text-[var(--text-muted)] block">URL encoded in the printed receipt QR code. (e.g., website or app store link)</span>
            </label>

            {/* Invoice Terms & Conditions */}
            <label className="block space-y-1 mt-3">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Invoice Terms & Conditions</span>
              <textarea
                value={restaurantForm.invoice_terms_conditions}
                onChange={(event) =>
                  setRestaurantForm((current) => ({
                    ...current,
                    invoice_terms_conditions: event.target.value,
                  }))
                }
                placeholder="1. Goods once sold will not be taken back."
                rows={3}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
              />
              <span className="text-[10px] text-[var(--text-muted)] block">These terms will be dynamically printed at the bottom of the A4 Tax Invoice.</span>
            </label>
          </div>

          {(restaurantForm.payment_mode === "RAZORPAY_GATEWAY" || restaurantForm.payment_mode === "BOTH") && (
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Razorpay Account ID</span>
              <input
                value={restaurantForm.razorpay_account_id}
                onChange={(event) =>
                  setRestaurantForm((current) => ({
                    ...current,
                    razorpay_account_id: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                placeholder="acc_XXXXXXXXX"
              />
            </label>
          )}

          {/* Loyalty Program Settings */}
          <div className="space-y-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <span>Customer Loyalty Program</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Points Earned Per ₹100 Spent</span>
                <input
                  type="number"
                  min={0}
                  value={restaurantForm.loyalty_points_per_100_inr}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      loyalty_points_per_100_inr: parseInt(event.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-bold text-sky-400"
                />
                <span className="text-[10px] text-[var(--text-muted)] block">
                  e.g. 5 means ₹350 bill earns 18 points (rounded). Set to 0 to disable point accrual.
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">INR Value Per Point (₹)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={restaurantForm.loyalty_point_value_inr}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      loyalty_point_value_inr: event.target.value,
                    }))
                  }
                  placeholder="1.00"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                />
                <span className="text-[10px] text-[var(--text-muted)] block">
                  e.g. 1.00 means 10 points = ₹10 discount during redemption.
                </span>
              </label>
            </div>
          </div>

          {/* Basket Session Duration */}
          <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Basket Session Settings</h3>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Session Duration (minutes)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={restaurantForm.session_duration_minutes}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      session_duration_minutes: parseInt(event.target.value) || 30,
                    }))
                  }
                  className="w-24 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-center"
                />
                <span className="text-xs text-[var(--text-muted)]">min (5–120). How long a customer&apos;s basket session lasts before expiry.</span>
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Public Basket Number</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={restaurantForm.public_basket_number || ""}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      public_basket_number: event.target.value,
                    }))
                  }
                  placeholder="e.g. 0"
                  className="w-24 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-center"
                />
                <span className="text-xs text-[var(--text-muted)]">Basket number that bypasses session locking. Leave empty to disable.</span>
              </div>
            </label>
          </div>

          {/* Inventory & Expiry Alert Configuration */}
          <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <span>Inventory &amp; Expiry Alert Settings</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Near-Expiry Alert Threshold (Days)</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={restaurantForm.near_expiry_threshold_days}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      near_expiry_threshold_days: parseInt(event.target.value) || 7,
                    }))
                  }
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-bold text-amber-400"
                />
                <span className="text-[10px] text-[var(--text-muted)] block">
                  Batches expiring within these days trigger top-right notifications &amp; email/whatsapp alerts.
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Alert Emails (Comma Separated)</span>
                  <input
                    type="text"
                    value={restaurantForm.notification_emails}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        notification_emails: event.target.value,
                      }))
                    }
                    placeholder="admin1@example.com, admin2@example.com"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                  />
                  <span className="text-[10px] text-[var(--text-muted)] block">
                    Emails for near-expiry & shelf-life alerts.
                  </span>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Alert Phones (Comma Separated)</span>
                  <input
                    type="text"
                    value={restaurantForm.notification_phones}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        notification_phones: event.target.value,
                      }))
                    }
                    placeholder="+919876543210, +919998887776"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                  />
                  <span className="text-[10px] text-[var(--text-muted)] block">
                    WhatsApp/SMS numbers for alerts.
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Verification Rules Settings */}
          <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Basket Verification Rules (Manager+)
              </h3>
              <span className="text-[10px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                Rule Precedence: Flagged Overrides Cutoff
              </span>
            </div>

            {/* Amount Cutoff */}
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                Auto-Skip Amount Cutoff (₹)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Disabled (Manual for all)"
                  value={restaurantForm.verification_amount_cutoff || ""}
                  onChange={(event) =>
                    setRestaurantForm((current) => ({
                      ...current,
                      verification_amount_cutoff: event.target.value,
                    }))
                  }
                  className="w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
                <span className="text-xs text-[var(--text-muted)]">
                  Orders under this amount skip manual verification unless containing a flagged product. Leave blank to require verification for all orders.
                </span>
              </div>
            </label>

            {/* Flagged Items Selector */}
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                Flagged Products (Always Require Verification)
              </span>
              <p className="text-xs text-[var(--text-muted)]">
                Products checked below will ALWAYS require manual staff verification at the counter, regardless of order total.
              </p>
              {menuItems.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic">No products available in catalog.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3">
                  {menuItems.map((item) => {
                    const isFlagged = restaurantForm.flagged_item_ids.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isFlagged}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setRestaurantForm((current) => {
                                const updated = checked
                                  ? [...current.flagged_item_ids, item.id]
                                  : current.flagged_item_ids.filter((id) => id !== item.id);
                                return { ...current, flagged_item_ids: updated };
                              });
                            }}
                            className="h-4 w-4 rounded-md border-[var(--border-strong)] text-[var(--accent-brand)] focus:ring-0 accent-[var(--accent-brand)]"
                          />
                          <span className="font-medium text-[var(--text-primary)]">{item.name}</span>
                        </div>
                        <span className="text-[var(--text-muted)] font-mono">{formatRupees(item.price)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {restaurant && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Restaurant ID</p>
              <p className="mt-1 font-mono text-xs text-[var(--text-primary)] select-all break-all">{restaurant.id}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSavingRestaurant}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
          >
            <Save className="h-4 w-4" />
            {isSavingRestaurant ? "Saving..." : "Save Settings"}
          </button>
        </form>
      </article>
    </div>
  );
}
