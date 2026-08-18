"use client";

import { useState, useEffect, useCallback } from "react";
import type { NotificationItem } from "../components/NotificationPanel";

type UseNotificationManagementProps = {
  accessToken: string | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
};

export function useNotificationManagement({
  accessToken,
  apiRequest,
}: UseNotificationManagementProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [thresholdDays, setThresholdDays] = useState<number>(7);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingNotifications(true);
    try {
      const data = await apiRequest<{
        notifications: NotificationItem[];
        unread_count: number;
        threshold_days: number;
      }>("/api/admin/notifications");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
      setThresholdDays(data.threshold_days || 7);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [accessToken, apiRequest]);

  useEffect(() => {
    if (accessToken) {
      void fetchNotifications();
      // Auto-poll notifications every 45 seconds
      const timer = setInterval(() => {
        void fetchNotifications();
      }, 45000);
      return () => clearInterval(timer);
    }
  }, [accessToken, fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await apiRequest<NotificationItem>(`/api/admin/notifications/${id}/read`, {
        method: "PATCH",
      });
      void fetchNotifications();
    } catch (err) {
      console.error("Error marking notification read:", err);
    }
  };

  return {
    notifications,
    unreadCount,
    thresholdDays,
    isNotificationPanelOpen,
    setIsNotificationPanelOpen,
    isLoadingNotifications,
    fetchNotifications,
    handleMarkRead,
  };
}
