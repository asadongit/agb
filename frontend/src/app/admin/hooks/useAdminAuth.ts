/**
 * useAdminAuth — Custom hook for admin dashboard authentication state.
 *
 * Manages access/refresh tokens, login, logout, token refresh,
 * and provides an authenticated `apiRequest` wrapper.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  type LoginResponse,
} from "../adminTypes";
import { parseApiResponse } from "../adminUtils";

export function useAdminAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Read stored token safely on mount to prevent SSR hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      const storedToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
      if (storedToken) {
        setAccessToken(storedToken);
      }
    }
  }, []);

  const authHeaders = useMemo(() => {
    if (!accessToken) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const refreshTokenPromiseRef = useRef<Promise<string | null> | null>(null);

  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    if (refreshTokenPromiseRef.current) {
      return refreshTokenPromiseRef.current;
    }

    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    refreshTokenPromiseRef.current = (async () => {
      try {
        const apiBase = getApiBaseUrl();
        const response = await fetch(`${apiBase}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          window.localStorage.removeItem(ACCESS_TOKEN_KEY);
          window.localStorage.removeItem(REFRESH_TOKEN_KEY);
          setAccessToken(null);
          return null;
        }

        const data = (await response.json()) as LoginResponse;
        setAccessToken(data.access_token);
        window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        return data.access_token;
      } catch {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        setAccessToken(null);
        return null;
      } finally {
        refreshTokenPromiseRef.current = null;
      }
    })();

    return refreshTokenPromiseRef.current;
  }, []);

  const apiRequest = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (!authHeaders) throw new Error("Please sign in first.");

      const apiBase = getApiBaseUrl();
      let response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          ...authHeaders,
          ...(options?.headers || {}),
        },
      });

      if (response.status === 401) {
        const newAccessToken = await tryRefreshToken();
        if (newAccessToken) {
          response = await fetch(`${apiBase}${path}`, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAccessToken}`,
              ...(options?.headers || {}),
            },
          });
        }
      }

      return parseApiResponse<T>(response);
    },
    [authHeaders, tryRefreshToken]
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResponse> => {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseApiResponse<LoginResponse>(response);

      if (data.role === "SUPERADMIN") {
        throw new Error(
          "Superadmin accounts cannot access the Outlet dashboard. Please use the Superadmin Console at /superadmin."
        );
      }

      setAccessToken(data.access_token);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      return data;
    },
    []
  );

  const logout = useCallback(async () => {
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
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [accessToken]);

  return {
    accessToken,
    isMounted,
    authHeaders,
    apiRequest,
    login,
    logout,
  };
}
