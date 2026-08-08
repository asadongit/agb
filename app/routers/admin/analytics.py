"""
Analytics FastAPI Router — Revenue, Peak Hours, Top Items, Order Funnel, Profit Margin, and Exports.
Gated server-side to Owner/Admin and Manager roles only.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.dependencies import (
    AuthenticatedUser,
    DBSession,
    RequireAdmin,
    require_permission,
)
from app.models.enums import RoleEnum
from app.schemas.analytics import (
    KpiSummaryResponse,
    OrderFunnelResponse,
    PeakHoursResponse,
    ProfitMarginResponse,
    RevenueAnalyticsResponse,
    TopItemsResponse,
)
from app.services.analytics_service import (
    get_kpi_summary,
    get_order_funnel,
    get_peak_hours,
    get_profit_margin_analytics,
    get_revenue_analytics,
    get_top_selling_items,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime, datetime]:
    """Parse date strings or default to past 30 days."""
    now = datetime.utcnow()
    to_dt = now
    from_dt = now - timedelta(days=30)

    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        except ValueError:
            pass

    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
        except ValueError:
            pass

    return from_dt, to_dt


@router.get("/kpi-summary", response_model=KpiSummaryResponse)
async def get_kpi_summary_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Fetch KPI summary strip metrics with period-over-period percentage comparisons."""
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_kpi_summary(db, target_restaurant_id, from_dt, to_dt)


@router.get("/revenue", response_model=RevenueAnalyticsResponse)
async def get_revenue_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    granularity: str = Query("daily", pattern="^(hourly|daily|weekly|monthly)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Time-bucketed revenue and order counts."""
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_revenue_analytics(db, target_restaurant_id, granularity, from_dt, to_dt)


@router.get("/peak-hours", response_model=PeakHoursResponse)
async def get_peak_hours_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Order volume distribution by hour-of-day (0-23)."""
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_peak_hours(db, target_restaurant_id, from_dt, to_dt)


@router.get("/top-items", response_model=TopItemsResponse)
async def get_top_items_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    sort_by: str = Query("quantity", pattern="^(quantity|revenue)$"),
    limit: int = Query(10, ge=1, le=50),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Top selling menu items ranked by quantity or revenue share."""
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_top_selling_items(db, target_restaurant_id, sort_by, limit, from_dt, to_dt)


@router.get("/funnel", response_model=OrderFunnelResponse)
async def get_funnel_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Order lifecycle conversion funnel and cancellation metrics."""
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_order_funnel(db, target_restaurant_id, from_dt, to_dt)


@router.get("/profit", response_model=ProfitMarginResponse)
async def get_profit_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    granularity: str = Query("daily", pattern="^(hourly|daily|weekly|monthly)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Profit margin analysis (Revenue - COGS) using stock ledger unit cost snapshots."""
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_profit_margin_analytics(db, target_restaurant_id, granularity, from_dt, to_dt)


@router.get("/export")
async def export_analytics_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    report: str = Query("revenue", pattern="^(revenue|top_items|funnel|profit)$"),
    format: str = Query("csv", pattern="^(csv)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Export analytics report data as CSV file."""
    target_restaurant_id = current_user.restaurant_id
    if not target_restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    output = io.StringIO()
    writer = csv.writer(output)

    if report == "revenue":
        data = await get_revenue_analytics(db, target_restaurant_id, "daily", from_dt, to_dt)
        writer.writerow(["Timestamp Bucket", "Revenue (INR)", "Orders Count"])
        for b in data.buckets:
            writer.writerow([b.bucket, f"{b.revenue:.2f}", b.orders_count])
    elif report == "top_items":
        data = await get_top_selling_items(db, target_restaurant_id, "quantity", 50, from_dt, to_dt)
        writer.writerow(["Item Name", "Quantity Sold", "Revenue (INR)", "Revenue Share %"])
        for item in data.items:
            writer.writerow([item.name, item.quantity_sold, f"{item.revenue:.2f}", f"{item.revenue_share_pct:.2f}%"])
    elif report == "profit":
        data = await get_profit_margin_analytics(db, target_restaurant_id, "daily", from_dt, to_dt)
        writer.writerow(["Timestamp Bucket", "Revenue (INR)", "COGS (INR)", "Net Profit (INR)", "Margin %"])
        for b in data.buckets:
            writer.writerow([b.bucket, f"{b.revenue:.2f}", f"{b.cogs:.2f}", f"{b.profit:.2f}", f"{b.margin_pct:.2f}%"])
    else:
        data = await get_order_funnel(db, target_restaurant_id, from_dt, to_dt)
        writer.writerow(["Stage", "Label", "Order Count", "Percentage %"])
        for s in data.stages:
            writer.writerow([s.stage, s.stage_label, s.count, f"{s.percentage:.2f}%"])

    csv_content = output.getvalue()
    filename = f"analytics_{report}_{from_dt.strftime('%Y%m%d')}_{to_dt.strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
