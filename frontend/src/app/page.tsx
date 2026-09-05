"use client";

import { useEffect } from "react";
import { AdminLoginForm } from "./login/components/AdminLoginForm";
import { useAdminAuth } from "./login/hooks/useAdminAuth";

export default function RootPinLoginPage() {
  const { accessToken, isMounted, pinLogin } = useAdminAuth();

  useEffect(() => {
    if (isMounted && accessToken) {
      window.location.href = "/login";
    }
  }, [isMounted, accessToken]);

  if (!isMounted || accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--border-subtle)] border-t-[var(--accent-brand)]" />
          <p className="text-sm font-medium text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  const handlePinLogin = async (outletId: string, staffId: string, pin: string) => {
    await pinLogin(outletId, staffId, pin);
    window.location.href = "/login";
  };

  return <AdminLoginForm onLogin={async () => {}} onPinLogin={handlePinLogin} onlyPin={true} />;
}
