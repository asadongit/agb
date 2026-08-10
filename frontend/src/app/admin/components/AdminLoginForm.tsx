/**
 * AdminLoginForm — Pre-auth login screen for the admin dashboard.
 *
 * Extracted from the admin page.tsx god-file.
 */

"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Store } from "lucide-react";

type AdminLoginFormProps = {
  onLogin: (email: string, password: string) => Promise<void>;
};

export function AdminLoginForm({ onLogin }: AdminLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticating(true);
    setError(null);
    setNotice(null);

    try {
      await onLogin(email, password);
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
            Manage live basket orders, Products, and outlet settings
          </p>
        </div>

        <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-[0_10px_35px_rgba(18,38,58,0.1)]">
          <form className="space-y-4" onSubmit={handleSubmit}>
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
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
              {isAuthenticating ? "Signing in..." : "Sign in to Outlet"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-800">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
              {notice}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
