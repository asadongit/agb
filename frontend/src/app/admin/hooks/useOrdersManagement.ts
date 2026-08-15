import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import type { OrderStatus } from "@/types";
import type { AdminOrder, RestaurantProfile } from "../adminTypes";

type UseOrdersManagementProps = {
  accessToken: string | null;
  restaurant: RestaurantProfile | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  loadDashboard: () => Promise<void>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function useOrdersManagement({
  accessToken,
  restaurant,
  apiRequest,
  loadDashboard,
  setNotice,
  setError,
}: UseOrdersManagementProps) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const wsPingRef = useRef<NodeJS.Timeout | null>(null);
  const wsReconnectRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Orders from Backend API
  const fetchOrders = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<AdminOrder[]>("/api/admin/orders");
      setOrders(data);
    } catch {
      // Ignore initial/poll fetch errors
    }
  }, [accessToken, apiRequest]);

  // Initial fetch and 10s fallback polling loop
  useEffect(() => {
    if (accessToken) {
      void fetchOrders();
      const interval = setInterval(() => {
        void fetchOrders();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [accessToken, fetchOrders]);

  // WebSocket Live Feed
  const connectWebSocket = useCallback(async () => {
    if (!accessToken || !restaurant) return;
    setWsStatus("connecting");

    try {
      const apiBase = getApiBaseUrl();
      const ticketRes = await fetch(`${apiBase}/api/ws-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!ticketRes.ok) {
        setWsStatus("disconnected");
        return;
      }

      const { ticket } = await ticketRes.json();

      let wsBaseUrl = "";
      if (process.env.NEXT_PUBLIC_API_URL) {
        wsBaseUrl = process.env.NEXT_PUBLIC_API_URL.replace(/^http/, "ws").replace(/\/$/, "");
      } else if (typeof window !== "undefined") {
        const hostname = window.location.hostname || "localhost";
        const isSecure = window.location.protocol === "https:";
        const wsProto = isSecure ? "wss:" : "ws:";

        if (hostname.endsWith(".loca.lt") || hostname.includes("vercel.app")) {
          wsBaseUrl = `${wsProto}//${hostname}`;
        } else {
          wsBaseUrl = `${wsProto}//${hostname}:8000`;
        }
      }

      const ws = new WebSocket(
        `${wsBaseUrl}/ws/mart/${restaurant.id}?ticket=${ticket}`
      );
      wsRef.current = ws;

      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          setWsStatus("disconnected");
        }
      }, 6000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        setWsStatus("connected");
        wsPingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const message = JSON.parse(event.data);
          void fetchOrders();
          void loadDashboard();
          if (message.event === "ORDER_STATUS_CHANGED" && message.data) {
            setOrders((current) =>
              current.map((order) =>
                order.id === message.data.order_id
                  ? { ...order, status: message.data.new_status }
                  : order
              )
            );
          }
        } catch {
          // Ignore
        }
      };

      ws.onclose = () => {
        clearTimeout(connectTimeout);
        setWsStatus("disconnected");
        if (wsPingRef.current) {
          clearInterval(wsPingRef.current);
          wsPingRef.current = null;
        }
        wsReconnectRef.current = setTimeout(() => {
          void connectWebSocket();
        }, 5000);
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
        setWsStatus("disconnected");
        ws.close();
      };
    } catch {
      setWsStatus("disconnected");
    }
  }, [accessToken, restaurant, loadDashboard, fetchOrders]);

  useEffect(() => {
    if (restaurant && accessToken) {
      void connectWebSocket();
    }
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (wsPingRef.current) clearInterval(wsPingRef.current);
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
    };
  }, [restaurant, accessToken, connectWebSocket]);

  // Orders Actions
  const onUpdateOrderStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setError(null);
    try {
      const updated = await apiRequest<AdminOrder>(
        `/api/admin/orders/${orderId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? updated : o))
      );
      setNotice(`Order #${orderId.slice(0, 8)} moved to ${nextStatus}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update order status."
      );
    }
  };

  const onCancelOrder = async (orderId: string) => {
    setError(null);
    try {
      const updated = await apiRequest<AdminOrder>(
        `/api/admin/orders/${orderId}/cancel`,
        { method: "POST" }
      );
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? updated : o))
      );
      setNotice(`Order #${orderId.slice(0, 8)} cancelled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
    }
  };

  const kpis = useMemo(() => {
    const openOrders = orders.filter(
      (order) =>
        order.status !== "COMPLETED" &&
        order.status !== "CANCELLED" &&
        order.status !== "REFUNDED"
    ).length;
    const pendingVerification = orders.filter(
      (order) => order.status === "PENDING_VERIFICATION"
    ).length;
    const paidOrPreparing = orders.filter(
      (order) => order.status === "PAID" || order.status === "PAYMENT_PENDING"
    ).length;
    const completionRate = orders.length
      ? Math.round(
          (orders.filter((order) => order.status === "COMPLETED").length /
            orders.length) *
            100
        )
      : 0;

    return {
      openOrders,
      pendingVerification,
      paidOrPreparing,
      completionRate,
    };
  }, [orders]);

  return {
    orders,
    setOrders,
    wsStatus,
    kpis,
    onUpdateOrderStatus,
    onCancelOrder,
  };
}
