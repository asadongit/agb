"""
Analytics schemas — requests and responses for Revenue, Peak Hours, Top Items, Order Funnel, and Profit Margin.
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import BaseResponse, StrictSchema


class KpiSummaryResponse(BaseResponse):
    total_revenue: float
    total_orders: int
    avg_order_value: float
    profit_margin_pct: float
    cogs: float
    net_profit: float
    # Period-over-Period comparisons
    prev_total_revenue: float
    prev_total_orders: int
    prev_avg_order_value: float
    prev_profit_margin_pct: float
    revenue_change_pct: float
    orders_change_pct: float
    aov_change_pct: float
    margin_change_pct: float


class RevenueBucket(StrictSchema):
    bucket: str
    revenue: float
    orders_count: int
    prev_period_revenue: float | None = None


class RevenueAnalyticsResponse(BaseResponse):
    granularity: str
    from_date: str
    to_date: str
    buckets: list[RevenueBucket]


class PeakHourBucket(StrictSchema):
    hour: int
    hour_label: str
    orders_count: int


class PeakHoursResponse(BaseResponse):
    from_date: str
    to_date: str
    buckets: list[PeakHourBucket]


class TopItemResponse(StrictSchema):
    menu_item_id: str | None
    name: str
    quantity_sold: int
    revenue: float
    revenue_share_pct: float


class TopItemsResponse(BaseResponse):
    from_date: str
    to_date: str
    sort_by: str
    items: list[TopItemResponse]


class FunnelStage(StrictSchema):
    stage: str
    stage_label: str
    count: int
    percentage: float


class OrderFunnelResponse(BaseResponse):
    from_date: str
    to_date: str
    total_orders: int
    stages: list[FunnelStage]
    conversion_rate_pct: float
    cancellation_rate_pct: float


class ProfitBucket(StrictSchema):
    bucket: str
    revenue: float
    cogs: float
    profit: float
    margin_pct: float


class ProfitMarginResponse(BaseResponse):
    granularity: str
    from_date: str
    to_date: str
    total_revenue: float
    total_cogs: float
    total_profit: float
    overall_margin_pct: float
    buckets: list[ProfitBucket]
