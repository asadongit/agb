"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  Crown,
  KeyRound,
  LogOut,
  Moon,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Sun,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import type { PaymentMode, StaffMember, StaffRole } from "@/types";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

type RestaurantUser = {
  id: string;
  email: string;
  role: "SUPERADMIN" | "RESTAURANT_ADMIN" | "STAFF";
  is_active: boolean;
  created_at: string;
};

type RestaurantWithUsers = {
  id: string;
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  razorpay_account_id?: string | null;
  direct_upi_id?: string | null;
  created_at: string;
  updated_at: string;
  users: RestaurantUser[];
};

type RestaurantCreateForm = {
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  razorpay_account_id: string;
  direct_upi_id: string;
};

type AdminUserForm = {
  email: string;
  password: string;
  role: "RESTAURANT_ADMIN" | "STAFF";
};

const SA_ACCESS_TOKEN_KEY = "superadmin_access_token";
const SA_REFRESH_TOKEN_KEY = "superadmin_refresh_token";

function decodeJwtRole(token: string): string | null {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return null;
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);
    return payload.role || null;
  } catch {
    return null;
  }
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : "Request failed. Please try again.";
    throw new Error(detail);
  }
  return payload as T;
}

export default function SuperadminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Theme Mode
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = (localStorage.getItem("app_theme") as "light" | "dark") || "light";
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
      if (stored === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("app_theme", next);
    document.documentElement.setAttribute("data-theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Directory state
  const [restaurants, setRestaurants] = useState<RestaurantWithUsers[]>([]);
  const [isLoadingRestaurants, setIsLoadingRestaurants] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Check stored token on load and verify role is SUPERADMIN
  useEffect(() => {
    setIsMounted(true);
    if (typeof window === "undefined") return;
    const storedToken = window.localStorage.getItem(SA_ACCESS_TOKEN_KEY);
    if (storedToken) {
      const role = decodeJwtRole(storedToken);
      if (role === "SUPERADMIN") {
        setAccessToken(storedToken);
      } else {
        window.localStorage.removeItem(SA_ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(SA_REFRESH_TOKEN_KEY);
      }
    }
  }, []);

  // Restaurant creation
  const [restaurantForm, setRestaurantForm] = useState<RestaurantCreateForm>({
    name: "",
    slug: "",
    payment_mode: "PAY_AT_COUNTER",
    razorpay_account_id: "",
    direct_upi_id: "",
  });
  const [isCreatingRestaurant, setIsCreatingRestaurant] = useState(false);

  // User creation
  const [adminUserForm, setAdminUserForm] = useState<AdminUserForm>({
    email: "",
    password: "",
    role: "RESTAURANT_ADMIN",
  });
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Step: "create_restaurant" | "create_admin" | "done"
  const [step, setStep] = useState<"create_restaurant" | "create_admin" | "done">("create_restaurant");

  const authHeaders = useMemo(() => {
    if (!accessToken) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const apiRequest = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (!authHeaders) throw new Error("Please sign in first.");
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: { ...authHeaders, ...(options?.headers || {}) },
      });
      return parseApiResponse<T>(response);
    },
    [authHeaders]
  );

  const [staffByOutlet, setStaffByOutlet] = useState<Record<string, StaffMember[]>>({});

  const loadStaffForOutlet = useCallback(
    async (restaurantId: string) => {
      if (!authHeaders || !restaurantId) return;
      try {
        const staffData = await apiRequest<StaffMember[]>(`/api/staff?restaurant_id=${restaurantId}`);
        setStaffByOutlet((prev) => ({ ...prev, [restaurantId]: staffData }));
      } catch (err) {
        console.error("Superadmin staff fetch error:", err);
      }
    },
    [apiRequest, authHeaders]
  );

  const loadRestaurants = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingRestaurants(true);
    setError(null);

    try {
      const data = await apiRequest<RestaurantWithUsers[]>("/api/admin/restaurants");
      setRestaurants(data);
      // Auto-expand all restaurant team sections by default
      setExpandedIds(new Set(data.map((r) => r.id)));
      data.forEach((r) => void loadStaffForOutlet(r.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load restaurants.";
      setError(message);
    } finally {
      setIsLoadingRestaurants(false);
    }
  }, [accessToken, apiRequest]);

  useEffect(() => {
    if (accessToken) {
      void loadRestaurants();
    }
  }, [accessToken, loadRestaurants]);

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticating(true);
    setError(null);
    setNotice(null);

    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseApiResponse<LoginResponse>(response);

      const userRole = decodeJwtRole(data.access_token);
      if (userRole !== "SUPERADMIN") {
        throw new Error(
          `Access denied. Superadmin credentials required. Your account role is '${userRole || "UNKNOWN"}'.`
        );
      }

      setAccessToken(data.access_token);
      window.localStorage.setItem(SA_ACCESS_TOKEN_KEY, data.access_token);
      window.localStorage.setItem(SA_REFRESH_TOKEN_KEY, data.refresh_token);
      setNotice("Signed in as superadmin.");
    } catch (loginError) {
      const message =
        loginError instanceof Error ? loginError.message : "Unable to sign in.";
      setError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const onLogout = async () => {
    try {
      if (accessToken) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch {
      // Ignore
    }

    setAccessToken(null);
    window.localStorage.removeItem(SA_ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(SA_REFRESH_TOKEN_KEY);
    setRestaurants([]);
    setStep("create_restaurant");
    setNotice("Signed out.");
  };

  const onCreateRestaurant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingRestaurant(true);
    setError(null);

    try {
      const payload = {
        name: restaurantForm.name.trim(),
        slug: restaurantForm.slug.trim(),
        payment_mode: restaurantForm.payment_mode,
        razorpay_account_id: restaurantForm.razorpay_account_id.trim() || null,
        direct_upi_id: restaurantForm.direct_upi_id.trim() || null,
      };

      const created = await apiRequest<RestaurantWithUsers>(
        "/api/admin/restaurants",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setSelectedRestaurantId(created.id);
      setRestaurantForm({
        name: "",
        slug: "",
        payment_mode: "PAY_AT_COUNTER",
        razorpay_account_id: "",
        direct_upi_id: "",
      });
      setNotice(`Restaurant "${created.name}" created successfully! Now assign an admin user.`);
      setStep("create_admin");
      void loadRestaurants();
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Unable to create restaurant.";
      setError(message);
    } finally {
      setIsCreatingRestaurant(false);
    }
  };

  const onCreateAdminUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRestaurantId) {
      setError("Select a restaurant first.");
      return;
    }

    setIsCreatingUser(true);
    setError(null);

    try {
      await apiRequest<{ message: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: adminUserForm.email.trim(),
          password: adminUserForm.password,
          restaurant_id: selectedRestaurantId,
          role: adminUserForm.role,
        }),
      });

      setNotice(
        `User "${adminUserForm.email}" (${adminUserForm.role.replace("_", " ")}) created successfully.`
      );
      setAdminUserForm({ email: "", password: "", role: "RESTAURANT_ADMIN" });
      setStep("done");
      void loadRestaurants();
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Unable to create user.";
      setError(message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const deleteRestaurant = async (restaurantId: string, restaurantName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${restaurantName}"?\n\nThis will permanently delete the restaurant, all categories, menu items, variants, orders, and associated user accounts!`
      )
    ) {
      return;
    }

    setError(null);
    try {
      await apiRequest<void>(`/api/admin/restaurants/${restaurantId}`, {
        method: "DELETE",
      });
      setNotice(`Restaurant "${restaurantName}" deleted successfully.`);
      void loadRestaurants();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete restaurant.";
      setError(message);
    }
  };

  const deleteUser = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Delete user account "${userEmail}"?`)) return;

    setError(null);
    try {
      await apiRequest<void>(`/api/auth/users/${userId}`, {
        method: "DELETE",
      });
      setNotice(`User account "${userEmail}" deleted.`);
      void loadRestaurants();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete user.";
      setError(message);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startAddUserForRestaurant = (restaurantId: string) => {
    setSelectedRestaurantId(restaurantId);
    setStep("create_admin");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const autoSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const filteredRestaurants = useMemo(() => {
    if (!searchQuery.trim()) return restaurants;
    const query = searchQuery.toLowerCase();
    return restaurants.filter((r) => {
      const matchesName = r.name.toLowerCase().includes(query);
      const matchesSlug = r.slug.toLowerCase().includes(query);
      const matchesUser = r.users.some((u) => u.email.toLowerCase().includes(query));
      return matchesName || matchesSlug || matchesUser;
    });
  }, [restaurants, searchQuery]);

  const selectedRestaurantName = useMemo(() => {
    return restaurants.find((r) => r.id === selectedRestaurantId)?.name || "";
  }, [restaurants, selectedRestaurantId]);

  // Wait until mounted on client before rendering to prevent SSR hydration mismatch
  if (!isMounted) return null;

  // ── Pre-auth ──────────────────────────────────────────────────────
  if (!accessToken) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between mb-8">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-brand)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Outlet Admin Login
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <Moon className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span>{theme === "light" ? "Dark" : "Light"}</span>
            </button>
          </div>

          <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-[0_10px_35px_rgba(18,38,58,0.1)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold">Superadmin Portal</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Platform management &amp; restaurant directory
                </p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={onLogin}>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Superadmin Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm"
                  placeholder="superadmin@ApnaGreen Basket.com"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm"
                  placeholder="Minimum 8 characters"
                />
              </label>
              <button
                type="submit"
                disabled={isAuthenticating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isAuthenticating ? "Verifying..." : "Sign in as Superadmin"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {error && (
              <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800 font-medium">
                {error}
              </p>
            )}
            {notice && (
              <p className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800 font-medium">
                {notice}
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ── Post-auth: Superadmin Dashboard ──────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-lg font-bold">Superadmin Console</p>
              <p className="text-xs text-[var(--text-secondary)]">Platform Directory &amp; Outlet Provisioning</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <Moon className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
            </button>
            <button
              type="button"
              onClick={() => void loadRestaurants()}
              disabled={isLoadingRestaurants}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold hover:border-[var(--accent-brand)]"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingRestaurants ? "animate-spin" : ""}`} />
              Sync Directory
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-brand)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {notice && (
          <p className="rounded-xl bg-emerald-100 px-4 py-2 text-sm text-emerald-800 font-medium">
            {notice}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-800 font-medium">
            {error}
          </p>
        )}

        {/* Action Stepper / Creator Widget */}
        <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Onboard New Restaurant</h2>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                step === "create_restaurant" ? "bg-[var(--accent-brand)] text-white" : "bg-emerald-100 text-emerald-700"
              }`}>
                {step !== "create_restaurant" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                1. Restaurant
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                step === "create_admin" ? "bg-[var(--accent-brand)] text-white" : step === "done" ? "bg-emerald-100 text-emerald-700" : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
              }`}>
                {step === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                2. User Account
              </span>
            </div>
          </div>

          {/* Step 1: Create Restaurant */}
          {step === "create_restaurant" && (
            <form onSubmit={onCreateRestaurant} className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Restaurant Name</span>
                <input
                  type="text"
                  value={restaurantForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setRestaurantForm((prev) => ({
                      ...prev,
                      name,
                      slug: autoSlug(name),
                    }));
                  }}
                  required
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                  placeholder="L'Oasis Modern Bistro"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">URL Slug</span>
                <input
                  type="text"
                  value={restaurantForm.slug}
                  onChange={(e) =>
                    setRestaurantForm((prev) => ({ ...prev, slug: e.target.value }))
                  }
                  required
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                  placeholder="loasis-modern-bistro"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Payment Mode</span>
                <select
                  value={restaurantForm.payment_mode}
                  onChange={(e) =>
                    setRestaurantForm((prev) => ({
                      ...prev,
                      payment_mode: e.target.value as PaymentMode,
                    }))
                  }
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                >
                  <option value="PAY_AT_COUNTER">Pay At Counter (Verify/Collect at counter)</option>
                  <option value="RAZORPAY_GATEWAY">Razorpay Gateway (Instant automated)</option>
                </select>
              </label>

              {restaurantForm.payment_mode === "RAZORPAY_GATEWAY" && (
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Razorpay Account ID</span>
                  <input
                    type="text"
                    value={restaurantForm.razorpay_account_id}
                    onChange={(e) =>
                      setRestaurantForm((prev) => ({ ...prev, razorpay_account_id: e.target.value }))
                    }
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                    placeholder="acc_XXXXXXXXX"
                  />
                </label>
              )}

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isCreatingRestaurant}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-70"
                >
                  <Plus className="h-4 w-4" />
                  {isCreatingRestaurant ? "Creating..." : "Create Restaurant"}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Create User */}
          {step === "create_admin" && (
            <form onSubmit={onCreateAdminUser} className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Target Restaurant</span>
                <select
                  value={selectedRestaurantId}
                  onChange={(e) => setSelectedRestaurantId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                >
                  <option value="">Select Restaurant</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.slug})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold font-semibold">User Role</span>
                <select
                  value={adminUserForm.role}
                  onChange={(e) =>
                    setAdminUserForm((prev) => ({
                      ...prev,
                      role: e.target.value as "RESTAURANT_ADMIN" | "STAFF",
                    }))
                  }
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                >
                  <option value="RESTAURANT_ADMIN">Restaurant Admin</option>
                  <option value="STAFF">Kitchen / Floor Staff</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Email Address</span>
                <input
                  type="email"
                  value={adminUserForm.email}
                  onChange={(e) =>
                    setAdminUserForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  required
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                  placeholder="user@restaurant.com"
                />
              </label>

              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Password</span>
                <input
                  type="password"
                  value={adminUserForm.password}
                  onChange={(e) =>
                    setAdminUserForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                  placeholder="Minimum 8 characters"
                />
              </label>

              <div className="flex items-end justify-between gap-2 sm:col-span-1">
                <button
                  type="button"
                  onClick={() => setStep("create_restaurant")}
                  className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser || !selectedRestaurantId}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-70"
                >
                  <UserPlus className="h-4 w-4" />
                  {isCreatingUser ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Done */}
          {step === "done" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold">User Account Provisioned!</p>
                  <p className="text-xs text-emerald-700">The account can now sign in at /admin.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep("create_restaurant")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Onboard Another Outlet
              </button>
            </div>
          )}
        </section>

        {/* Directory Section */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Onboarded Outlets Directory</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Viewing {filteredRestaurants.length} of {restaurants.length} total restaurants along with their assigned admins and staff.
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative flex items-center min-w-[260px]">
              <Search className="absolute left-3 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search restaurant or user email..."
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-4 text-xs focus:border-[var(--accent-brand)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Loading Skeleton */}
          {isLoadingRestaurants && restaurants.length === 0 && (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-40 w-full animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
              ))}
            </div>
          )}

          {/* Empty Directory */}
          {!isLoadingRestaurants && filteredRestaurants.length === 0 && (
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center">
              <Store className="mx-auto h-12 w-12 text-[var(--text-muted)] mb-3" />
              <h3 className="font-display text-lg font-bold">No Restaurants Found</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {searchQuery ? `No outlets match "${searchQuery}"` : "Get started by onboarding your first restaurant above."}
              </p>
            </div>
          )}

          {/* Directory Restaurant Cards */}
          <div className="space-y-4">
            {filteredRestaurants.map((r) => {
              const isExpanded = expandedIds.has(r.id);
              const admins = r.users.filter((u) => u.role === "RESTAURANT_ADMIN");
              const staff = r.users.filter((u) => u.role === "STAFF");

              return (
                <article
                  key={r.id}
                  className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 shadow-xs transition-all hover:border-[var(--accent-brand)]"
                >
                  {/* Restaurant Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                          {r.name}
                        </h3>
                        <span className="rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--accent-brand)]">
                          /{r.slug}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          r.payment_mode === "RAZORPAY_GATEWAY"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          <CreditCard className="h-3 w-3" />
                          {r.payment_mode === "RAZORPAY_GATEWAY" ? "Razorpay Gateway" : "Pay At Counter"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Onboarded on {formatDateTime(r.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(r.id, r.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent-brand)] transition"
                        title="Copy Restaurant ID"
                      >
                        <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        <span className="font-mono">{copiedId === r.id ? "Copied ID!" : `${r.id.substring(0, 8)}...`}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => startAddUserForRestaurant(r.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add User
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteRestaurant(r.id, r.name)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                        title="Delete Restaurant"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        <span>Delete</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpand(r.id)}
                        className="p-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        aria-label="Toggle team view"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Crown className="h-4 w-4 text-amber-600" />
                        {admins.length} {admins.length === 1 ? "Admin" : "Admins"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Users className="h-4 w-4 text-sky-600" />
                        {staff.length} {staff.length === 1 ? "Staff Member" : "Staff Members"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpand(r.id)}
                      className="text-xs font-semibold text-[var(--accent-brand)] hover:underline"
                    >
                      {isExpanded ? "Hide Team Directory" : "View Team Directory"}
                    </button>
                  </div>

                  {/* Expandable Team Directory */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t border-[var(--border-subtle)] pt-4 animate-in fade-in duration-200">
                      {/* Admins Group */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <Crown className="h-4 w-4 text-amber-600" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            Restaurant Admins ({admins.length})
                          </h4>
                        </div>

                        {admins.length === 0 ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            ⚠️ No admin user assigned to this restaurant yet. Click &quot;Add User&quot; above to create one.
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {admins.map((u) => (
                              <div
                                key={u.id}
                                className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-amber-50/40 p-3"
                              >
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                    <UserCheck className="h-3.5 w-3.5 text-amber-600" />
                                    {u.email}
                                  </p>
                                  <p className="text-[11px] text-[var(--text-muted)]">
                                    Joined {formatDateTime(u.created_at)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                    Admin
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => deleteUser(u.id, u.email)}
                                    className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition"
                                    title="Delete Admin Account"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Staff & Team Roster */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-4 w-4 text-[var(--accent-brand)]" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                              Outlet Staff &amp; Team Roster ({(staffByOutlet[r.id] || []).length})
                            </h4>
                          </div>
                        </div>

                        {!(staffByOutlet[r.id] && staffByOutlet[r.id].length > 0) ? (
                          <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs text-[var(--text-muted)]">
                            No staff members provisioned for this outlet yet.
                          </p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {staffByOutlet[r.id].map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3"
                              >
                                <div className="space-y-0.5 truncate">
                                  <p className="text-xs font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                                    <UserCheck className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                                    {s.name} ({s.email})
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                                      Role: {s.role.replace("_", " ")}
                                    </span>
                                    {s.has_pin && (
                                      <span className="text-[10px] text-emerald-600 font-bold">
                                        • PIN Active
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    s.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                  }`}>
                                    {s.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
