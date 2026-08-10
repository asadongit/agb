import { useCallback, useState } from "react";
import type {
  AnalyticsKpiSummary,
  FunnelAnalytics,
  PeakHoursAnalytics,
  ProfitMarginAnalytics,
  RevenueAnalytics,
  TopItemsAnalytics,
} from "@/types";

type UseAnalyticsManagementProps = {
  accessToken: string | null;
  authHeaders: Record<string, string> | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
};

export function useAnalyticsManagement({
  accessToken,
  authHeaders,
  apiRequest,
}: UseAnalyticsManagementProps) {
  const [analyticsGranularity, setAnalyticsGranularity] = useState<"hourly" | "daily" | "weekly" | "monthly">("daily");
  const [analyticsDatePreset, setAnalyticsDatePreset] = useState<"7d" | "30d" | "this_month" | "custom">("30d");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [drilldownBucket, setDrilldownBucket] = useState<string | null>(null);
  const [topItemsSortBy, setTopItemsSortBy] = useState<"quantity" | "revenue">("revenue");
  const [kpiData, setKpiData] = useState<AnalyticsKpiSummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueAnalytics | null>(null);
  const [peakHoursData, setPeakHoursData] = useState<PeakHoursAnalytics | null>(null);
  const [topItemsData, setTopItemsData] = useState<TopItemsAnalytics | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelAnalytics | null>(null);
  const [profitData, setProfitData] = useState<ProfitMarginAnalytics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Load Analytics Data
  const loadAnalyticsData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoadingAnalytics(true);
    try {
      let fromStr = "";
      let toStr = "";

      const now = new Date();
      if (drilldownBucket) {
        const d = new Date(drilldownBucket);
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
        fromStr = startOfDay.toISOString();
        toStr = endOfDay.toISOString();
      } else if (analyticsDatePreset === "7d") {
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        fromStr = from.toISOString();
        toStr = now.toISOString();
      } else if (analyticsDatePreset === "30d") {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        fromStr = from.toISOString();
        toStr = now.toISOString();
      } else if (analyticsDatePreset === "this_month") {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        fromStr = from.toISOString();
        toStr = now.toISOString();
      } else if (analyticsDatePreset === "custom" && customFromDate && customToDate) {
        fromStr = new Date(customFromDate).toISOString();
        toStr = new Date(customToDate).toISOString();
      }

      const params = new URLSearchParams();
      if (fromStr) params.append("from_date", fromStr);
      if (toStr) params.append("to_date", toStr);

      const [kpiRes, revRes, peakRes, topRes, funnelRes, profitRes] = await Promise.all([
        apiRequest<AnalyticsKpiSummary>(`/api/analytics/kpi-summary?${params.toString()}`),
        apiRequest<RevenueAnalytics>(`/api/analytics/revenue?granularity=${analyticsGranularity}&${params.toString()}`),
        apiRequest<PeakHoursAnalytics>(`/api/analytics/peak-hours?${params.toString()}`),
        apiRequest<TopItemsAnalytics>(`/api/analytics/top-items?sort_by=${topItemsSortBy}&limit=10&${params.toString()}`),
        apiRequest<FunnelAnalytics>(`/api/analytics/funnel?${params.toString()}`),
        apiRequest<ProfitMarginAnalytics>(`/api/analytics/profit?granularity=${analyticsGranularity}&${params.toString()}`),
      ]);

      setKpiData(kpiRes);
      setRevenueData(revRes);
      setPeakHoursData(peakRes);
      setTopItemsData(topRes);
      setFunnelData(funnelRes);
      setProfitData(profitRes);
    } catch (err) {
      console.error("Analytics load error:", err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [
    apiRequest,
    authHeaders,
    analyticsGranularity,
    analyticsDatePreset,
    customFromDate,
    customToDate,
    drilldownBucket,
    topItemsSortBy,
  ]);

  return {
    analyticsGranularity,
    setAnalyticsGranularity,
    analyticsDatePreset,
    setAnalyticsDatePreset,
    customFromDate,
    setCustomFromDate,
    customToDate,
    setCustomToDate,
    drilldownBucket,
    setDrilldownBucket,
    topItemsSortBy,
    setTopItemsSortBy,
    kpiData,
    revenueData,
    peakHoursData,
    topItemsData,
    funnelData,
    profitData,
    isLoadingAnalytics,
    loadAnalyticsData,
  };
}
