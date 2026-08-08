"""
Analytics Service — SQL aggregation queries for revenue, peak hours, top dishes, order funnel, and profit margin analysis.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import Float, Integer, String, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatusEnum, StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.stock_ledger import StockLedger
from app.schemas.analytics import (
    FunnelStage,
    KpiSummaryResponse,
    OrderFunnelResponse,
    PeakHourBucket,
    PeakHoursResponse,
    ProfitBucket,
    ProfitMarginResponse,
    RevenueBucket,
    RevenueAnalyticsResponse,
    TopItemResponse,
    TopItemsResponse,
)

# Valid non-cancelled status filters for revenue calculation
SETTLED_STATUSES = [
    OrderStatusEnum.PAID,
    OrderStatusEnum.PREPARING,
    OrderStatusEnum.COMPLETED,
]


def _calc_pct_change(current: float, prev: float) -> float:
    if prev <= 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - prev) / prev) * 100.0, 2)


async def get_kpi_summary(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> KpiSummaryResponse:
    """Calculate overall KPIs and period-over-period percentage changes."""
    duration = to_dt - from_dt
    prev_from_dt = from_dt - duration
    prev_to_dt = from_dt

    # Current period revenue & orders
    stmt_curr = select(
        func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
        func.count(Order.id).label("orders_count"),
    ).where(
        Order.restaurant_id == restaurant_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
    )
    res_curr = await db.execute(stmt_curr)
    row_curr = res_curr.first()
    curr_rev = float(row_curr.revenue) if row_curr else 0.0
    curr_orders = int(row_curr.orders_count) if row_curr else 0
    curr_aov = round(curr_rev / curr_orders, 2) if curr_orders > 0 else 0.0

    # Current period COGS from stock ledger
    stmt_cogs = select(
        func.coalesce(
            func.sum(
                func.abs(StockLedger.quantity_change)
                * func.coalesce(StockLedger.unit_cost_snapshot, 0)
            ),
            0,
        )
    ).where(
        StockLedger.restaurant_id == restaurant_id,
        StockLedger.created_at >= from_dt,
        StockLedger.created_at <= to_dt,
        StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
    )
    res_cogs = await db.execute(stmt_cogs)
    curr_cogs = float(res_cogs.scalar() or 0.0)

    # Net restock reversals
    stmt_restock = select(
        func.coalesce(
            func.sum(
                func.abs(StockLedger.quantity_change)
                * func.coalesce(StockLedger.unit_cost_snapshot, 0)
            ),
            0,
        )
    ).where(
        StockLedger.restaurant_id == restaurant_id,
        StockLedger.created_at >= from_dt,
        StockLedger.created_at <= to_dt,
        StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
    )
    res_restock = await db.execute(stmt_restock)
    restock_cogs = float(res_restock.scalar() or 0.0)

    net_cogs = max(0.0, curr_cogs - restock_cogs)
    net_profit = curr_rev - net_cogs
    curr_margin_pct = round((net_profit / curr_rev) * 100.0, 2) if curr_rev > 0 else 0.0

    # Previous period metrics
    stmt_prev = select(
        func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
        func.count(Order.id).label("orders_count"),
    ).where(
        Order.restaurant_id == restaurant_id,
        Order.created_at >= prev_from_dt,
        Order.created_at <= prev_to_dt,
        Order.status.in_(SETTLED_STATUSES),
    )
    res_prev = await db.execute(stmt_prev)
    row_prev = res_prev.first()
    prev_rev = float(row_prev.revenue) if row_prev else 0.0
    prev_orders = int(row_prev.orders_count) if row_prev else 0
    prev_aov = round(prev_rev / prev_orders, 2) if prev_orders > 0 else 0.0

    stmt_prev_cogs = select(
        func.coalesce(
            func.sum(
                func.abs(StockLedger.quantity_change)
                * func.coalesce(StockLedger.unit_cost_snapshot, 0)
            ),
            0,
        )
    ).where(
        StockLedger.restaurant_id == restaurant_id,
        StockLedger.created_at >= prev_from_dt,
        StockLedger.created_at <= prev_to_dt,
        StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
    )
    res_prev_cogs = await db.execute(stmt_prev_cogs)
    prev_cogs = float(res_prev_cogs.scalar() or 0.0)
    prev_profit = prev_rev - prev_cogs
    prev_margin_pct = round((prev_profit / prev_rev) * 100.0, 2) if prev_rev > 0 else 0.0

    return KpiSummaryResponse(
        total_revenue=round(curr_rev, 2),
        total_orders=curr_orders,
        avg_order_value=curr_aov,
        profit_margin_pct=curr_margin_pct,
        cogs=round(net_cogs, 2),
        net_profit=round(net_profit, 2),
        prev_total_revenue=round(prev_rev, 2),
        prev_total_orders=prev_orders,
        prev_avg_order_value=prev_aov,
        prev_profit_margin_pct=prev_margin_pct,
        revenue_change_pct=_calc_pct_change(curr_rev, prev_rev),
        orders_change_pct=_calc_pct_change(float(curr_orders), float(prev_orders)),
        aov_change_pct=_calc_pct_change(curr_aov, prev_aov),
        margin_change_pct=round(curr_margin_pct - prev_margin_pct, 2),
    )


async def get_revenue_analytics(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> RevenueAnalyticsResponse:
    """Bucket revenue and order counts over time with previous period comparison overlay."""
    trunc_unit = {
        "hourly": "hour",
        "daily": "day",
        "weekly": "week",
        "monthly": "month",
    }.get(granularity.lower(), "day")

    stmt = (
        select(
            func.date_trunc(trunc_unit, Order.created_at).label("bucket_time"),
            func.sum(Order.total_amount).label("revenue"),
            func.count(Order.id).label("orders_count"),
        )
        .where(
            Order.restaurant_id == restaurant_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(text("bucket_time"))
        .order_by(text("bucket_time"))
    )

    res = await db.execute(stmt)
    rows = res.all()

    buckets: list[RevenueBucket] = []
    for r in rows:
        b_str = r.bucket_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.bucket_time, "strftime") else str(r.bucket_time)
        buckets.append(
            RevenueBucket(
                bucket=b_str,
                revenue=round(float(r.revenue or 0), 2),
                orders_count=int(r.orders_count or 0),
            )
        )

    return RevenueAnalyticsResponse(
        granularity=granularity,
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        buckets=buckets,
    )


async def get_peak_hours(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> PeakHoursResponse:
    """Group order volume by hour of day (0 to 23)."""
    stmt = (
        select(
            cast(func.extract("hour", Order.created_at), Integer).label("hr"),
            func.count(Order.id).label("cnt"),
        )
        .where(
            Order.restaurant_id == restaurant_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
        )
        .group_by(text("hr"))
        .order_by(text("hr"))
    )

    res = await db.execute(stmt)
    hour_map = {row.hr: row.cnt for row in res.all()}

    buckets: list[PeakHourBucket] = []
    for h in range(24):
        cnt = hour_map.get(h, 0)
        label = f"{h:02d}:00"
        buckets.append(PeakHourBucket(hour=h, hour_label=label, orders_count=cnt))

    return PeakHoursResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        buckets=buckets,
    )


async def get_top_selling_items(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    sort_by: str,
    limit: int,
    from_dt: datetime,
    to_dt: datetime,
) -> TopItemsResponse:
    """Rank menu items by quantity sold or total revenue, including revenue share percentage."""
    stmt = (
        select(
            OrderItem.menu_item_id,
            OrderItem.item_name,
            func.sum(OrderItem.quantity).label("total_qty"),
            func.sum(OrderItem.line_total).label("total_rev"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.restaurant_id == restaurant_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(OrderItem.menu_item_id, OrderItem.item_name)
    )

    if sort_by.lower() == "revenue":
        stmt = stmt.order_by(text("total_rev DESC"))
    else:
        stmt = stmt.order_by(text("total_qty DESC"))

    stmt = stmt.limit(limit)
    res = await db.execute(stmt)
    rows = res.all()

    # Calculate overall total revenue for revenue share %
    total_rev_all = sum(float(r.total_rev or 0) for r in rows)

    items: list[TopItemResponse] = []
    for r in rows:
        rev = round(float(r.total_rev or 0), 2)
        share = round((rev / total_rev_all) * 100.0, 2) if total_rev_all > 0 else 0.0
        items.append(
            TopItemResponse(
                menu_item_id=str(r.menu_item_id) if r.menu_item_id else None,
                name=r.item_name or "Unknown Item",
                quantity_sold=int(r.total_qty or 0),
                revenue=rev,
                revenue_share_pct=share,
            )
        )

    return TopItemsResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        sort_by=sort_by,
        items=items,
    )


async def get_order_funnel(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> OrderFunnelResponse:
    """Order funnel stage counts, conversion rates, and cancellation percentage."""
    stmt = (
        select(
            Order.status,
            func.count(Order.id).label("cnt"),
        )
        .where(
            Order.restaurant_id == restaurant_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
        )
        .group_by(Order.status)
    )

    res = await db.execute(stmt)
    status_counts = {row.status: row.cnt for row in res.all()}

    total_orders = sum(status_counts.values())

    pending_cnt = status_counts.get(OrderStatusEnum.PENDING, 0) + status_counts.get(OrderStatusEnum.PENDING_VERIFICATION, 0)
    paid_cnt = status_counts.get(OrderStatusEnum.PAID, 0) + status_counts.get(OrderStatusEnum.PREPARING, 0)
    served_cnt = status_counts.get(OrderStatusEnum.COMPLETED, 0)
    cancelled_cnt = status_counts.get(OrderStatusEnum.CANCELLED, 0) + status_counts.get(OrderStatusEnum.REFUNDED, 0)

    stages = [
        FunnelStage(
            stage="PENDING",
            stage_label="Confirmation / Payment Pending",
            count=pending_cnt,
            percentage=round((pending_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
        FunnelStage(
            stage="PAID",
            stage_label="Paid / Kitchen Preparing",
            count=paid_cnt,
            percentage=round((paid_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
        FunnelStage(
            stage="SERVED",
            stage_label="Served & Completed",
            count=served_cnt,
            percentage=round((served_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
        FunnelStage(
            stage="CANCELLED",
            stage_label="Cancelled Orders",
            count=cancelled_cnt,
            percentage=round((cancelled_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
    ]

    conversion_rate = round(((paid_cnt + served_cnt) / total_orders) * 100.0, 2) if total_orders > 0 else 0.0
    cancellation_rate = round((cancelled_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0

    return OrderFunnelResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_orders=total_orders,
        stages=stages,
        conversion_rate_pct=conversion_rate,
        cancellation_rate_pct=cancellation_rate,
    )


async def get_profit_margin_analytics(
    db: AsyncSession,
    restaurant_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> ProfitMarginResponse:
    """Bucket revenue, COGS (from unit_cost_snapshot), and net profit margins."""
    trunc_unit = {
        "hourly": "hour",
        "daily": "day",
        "weekly": "week",
        "monthly": "month",
    }.get(granularity.lower(), "day")

    # Revenue query
    rev_stmt = (
        select(
            func.date_trunc(trunc_unit, Order.created_at).label("b_time"),
            func.sum(Order.total_amount).label("rev"),
        )
        .where(
            Order.restaurant_id == restaurant_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(text("b_time"))
    )
    res_rev = await db.execute(rev_stmt)
    rev_map = {
        (r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)): float(r.rev or 0)
        for r in res_rev.all()
    }

    # COGS deduction query
    cogs_stmt = (
        select(
            func.date_trunc(trunc_unit, StockLedger.created_at).label("b_time"),
            func.sum(
                func.abs(StockLedger.quantity_change)
                * func.coalesce(StockLedger.unit_cost_snapshot, 0)
            ).label("cogs_val"),
        )
        .where(
            StockLedger.restaurant_id == restaurant_id,
            StockLedger.created_at >= from_dt,
            StockLedger.created_at <= to_dt,
            StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
        )
        .group_by(text("b_time"))
    )
    res_cogs = await db.execute(cogs_stmt)
    cogs_map = {
        (r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)): float(r.cogs_val or 0)
        for r in res_cogs.all()
    }

    all_keys = sorted(list(set(rev_map.keys()) | set(cogs_map.keys())))

    buckets: list[ProfitBucket] = []
    tot_rev = 0.0
    tot_cogs = 0.0

    for k in all_keys:
        r_val = rev_map.get(k, 0.0)
        c_val = cogs_map.get(k, 0.0)
        p_val = r_val - c_val
        m_pct = round((p_val / r_val) * 100.0, 2) if r_val > 0 else 0.0

        tot_rev += r_val
        tot_cogs += c_val

        buckets.append(
            ProfitBucket(
                bucket=k,
                revenue=round(r_val, 2),
                cogs=round(c_val, 2),
                profit=round(p_val, 2),
                margin_pct=m_pct,
            )
        )

    tot_profit = tot_rev - tot_cogs
    overall_margin = round((tot_profit / tot_rev) * 100.0, 2) if tot_rev > 0 else 0.0

    return ProfitMarginResponse(
        granularity=granularity,
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_revenue=round(tot_rev, 2),
        total_cogs=round(tot_cogs, 2),
        total_profit=round(tot_profit, 2),
        overall_margin_pct=overall_margin,
        buckets=buckets,
    )
