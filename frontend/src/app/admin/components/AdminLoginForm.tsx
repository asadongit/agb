/**
 * AdminLoginForm — Pre-auth login screen for the admin dashboard.
 * Supports both Email/Password login and Quick Staff PIN login.
 */

"use client";

import { FormEvent, useState, useEffect } from "react";
import { ArrowRight, KeyRound, Mail, Store, Eye, EyeOff } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import { ToastNotification } from "@/app/components/ToastNotification";

type OutletOption = {
  id: string;
  name: string;
  slug: string;
};

type AdminLoginFormProps = {
  onLogin: (email: string, password: string) => Promise<void>;
  onPinLogin?: (outletId: string, staffId: string, pin: string) => Promise<void>;
};

export function AdminLoginForm({ onLogin, onPinLogin }: AdminLoginFormProps) {
  const [authMethod, setAuthMethod] = useState<"email" | "pin">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outletId, setOutletId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [staffList, setStaffList] = useState<{id: string, name: string}[]>([]);
  const [isLoadingOutlets, setIsLoadingOutlets] = useState(false);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    let isSubscribed = true;
    async function loadOutlets() {
      setIsLoadingOutlets(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/public/outlets`);
        if (res.ok && isSubscribed) {
          const data: OutletOption[] = await res.json();
          setOutlets(data);
          const savedOutlet = typeof window !== "undefined" ? localStorage.getItem("agb_last_outlet_id") : null;
          if (savedOutlet && data.some((o) => o.id === savedOutlet)) {
            setOutletId(savedOutlet);
          } else if (data.length === 1) {
            setOutletId(data[0].id);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isSubscribed) setIsLoadingOutlets(false);
      }
    }

    void loadOutlets();
    return () => {
      isSubscribed = false;
    };
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    async function loadStaff() {
      if (!outletId) {
        setStaffList([]);
        setStaffId("");
        return;
      }
      setIsLoadingStaff(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/public/outlets/${outletId}/staff`);
        if (res.ok && isSubscribed) {
          const data = await res.json();
          setStaffList(data);
          const savedStaff = typeof window !== "undefined" ? localStorage.getItem("agb_last_staff_id") : null;
          if (savedStaff && data.some((s: any) => s.id === savedStaff)) {
            setStaffId(savedStaff);
          } else if (data.length === 1) {
            setStaffId(data[0].id);
          } else {
            setStaffId("");
          }
        }
      } catch {
        if (isSubscribed) setStaffList([]);
      } finally {
        if (isSubscribed) setIsLoadingStaff(false);
      }
    }
    void loadStaff();
    return () => {
      isSubscribed = false;
    };
  }, [outletId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticating(true);
    setError(null);
    setNotice(null);

    try {
      if (authMethod === "email") {
        await onLogin(email, password);
      } else {
        if (!onPinLogin) throw new Error("PIN Login is not configured.");
        if (!outletId.trim()) throw new Error("Please select a Store.");
        if (!staffId.trim()) throw new Error("Please select your Name.");
        if (pin.length !== 4) throw new Error("PIN must be 4 digits.");
        if (typeof window !== "undefined") {
          localStorage.setItem("agb_last_outlet_id", outletId.trim());
          localStorage.setItem("agb_last_staff_id", staffId.trim());
        }
        await onPinLogin(outletId.trim(), staffId.trim(), pin.trim());
      }
      setNotice("Signed in successfully.");
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in right now.";
      setError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] px-4 py-14 sm:px-6 flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Outlet Operations Login</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage live basket orders, POS Billing, Products & Staff
          </p>
        </div>

        <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-[0_10px_35px_rgba(18,38,58,0.1)]">
          {/* Method Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--bg-base)] p-1.5 mb-6 border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => {
                setAuthMethod("email");
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition ${
                authMethod === "email"
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Email & Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod("pin");
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition ${
                authMethod === "pin"
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Staff POS PIN
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {authMethod === "email" ? (
              <>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm"
                    placeholder="admin@outlet.com"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] pl-3 pr-10 py-2 text-sm"
                      placeholder="Minimum 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Select Outlet / Store</span>
                  {isLoadingOutlets ? (
                    <div className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-muted)] font-mono animate-pulse">
                      Loading store outlets...
                    </div>
                  ) : (
                    <select
                      value={outletId}
                      onChange={(event) => setOutletId(event.target.value)}
                      required
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm font-medium"
                    >
                      <option value="">-- Choose Your Outlet --</option>
                      {outlets.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} (/{o.slug})
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Select Staff Member</span>
                  {isLoadingStaff ? (
                    <div className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-muted)] font-mono animate-pulse">
                      Loading staff...
                    </div>
                  ) : (
                    <select
                      value={staffId}
                      onChange={(event) => setStaffId(event.target.value)}
                      required
                      disabled={!outletId || staffList.length === 0}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      <option value="">-- Choose Your Name --</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Staff 4-Digit PIN</span>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      required
                      maxLength={4}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-center text-xl font-bold tracking-widest font-mono"
                      placeholder="••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:cursor-not-allowed disabled:opacity-70 mt-2"
            >
              {isAuthenticating ? "Signing in..." : authMethod === "email" ? "Sign in to Outlet" : "Quick PIN Login"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <ToastNotification 
            notice={notice} 
            error={error} 
            clear={() => { setNotice(null); setError(null); }} 
          />
        </section>
      </div>
    </div>
  );
}
