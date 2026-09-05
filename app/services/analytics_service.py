"""
Analytics Service — SQL aggregation queries for revenue, peak hours, top dishes, order funnel, and profit margin analysis.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import Float, Integer, String, cast, func, select, text, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatusEnum, StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.stock_ledger import StockLedger
from app.models.category import Category
from app.models.customer import Customer
from app.models.customer_return import CustomerReturn
from app.models.supplier import Supplier
from app.models.stock_intake import StockIntake
from app.models.purchase_return import PurchaseReturn
from app.models.cash_drawer_ledger import CashDrawerLedger
from app.models.bill_discount_approval import BillDiscountApproval
from app.models.abandoned_cart import AbandonedCart
from app.models.customer_ledger import CustomerLedger
from app.models.user import User

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
    CategorySalesItem,
    CategorySalesResponse,
    ItemSalesRow,
    ItemSalesResponse,
    BillProfitRow,
    BillProfitResponse,
    AovBucket,
    AovByPaymentMethod,
    AovAnalyticsResponse,
    StockIntakeRow,
    StockIntakeReportResponse,
    WastageRow,
    WastageReportResponse,
    StockMovementRow,
    StockMovementResponse,
    PurchaseReturnRow,
    PurchaseReturnReportResponse,
    NewCustomerBucket,
    NewCustomerReportResponse, NewCustomerDetail,
    CustomerReturnRow,
    TopReturnedItem,
    CustomerReturnReportResponse,
    DenominationBreakdown,
    CashFlowByType,
    CashDenominationResponse,
    PaymentMixRow,
    PaymentMixResponse,
    TaxSlabRow,
    TaxSummaryResponse,
    DiscountSummary,
    DiscountByType,
    DiscountApprovalStats,
    TopDiscountReason,
    DiscountReportResponse,
    DayBookEntry,
    DayBookResponse,
    AbandonedCartStatsResponse,
    LoyaltyReportResponse,
    SupplierSpendRow,
    SupplierSpendResponse,
)

# Valid non-cancelled status filters for revenue calculation
SETTLED_STATUSES = [
    OrderStatusEnum.PAID,
    OrderStatusEnum.PAYMENT_PENDING,
    OrderStatusEnum.COMPLETED,
]


def _calc_pct_change(current: float, prev: float) -> float:
    if prev <= 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - prev) / prev) * 100.0, 2)


def _get_time_bucket_expr(column, granularity: str, dialect_name: str = "sqlite"):
    """Return SQL expression for time-bucketing compatible with PostgreSQL and SQLite."""
    granularity = granularity.lower()
    if dialect_name == "postgresql":
        trunc_unit = {
            "hourly": "hour",
            "daily": "day",
            "weekly": "week",
            "monthly": "month",
        }.get(granularity, "day")
        return func.date_trunc(trunc_unit, column)
    else:
        fmt = {
            "hourly": "%Y-%m-%d %H:00",
            "daily": "%Y-%m-%d",
            "weekly": "%Y-%W",
            "monthly": "%Y-%m",
        }.get(granularity, "%Y-%m-%d")
        return func.strftime(fmt, column)


async def get_kpi_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
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
        Order.outlet_id == outlet_id,
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
        StockLedger.outlet_id == outlet_id,
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
        StockLedger.outlet_id == outlet_id,
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
        Order.outlet_id == outlet_id,
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
        StockLedger.outlet_id == outlet_id,
        StockLedger.created_at >= prev_from_dt,
        StockLedger.created_at <= prev_to_dt,
        StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
    )
    res_prev_cogs = await db.execute(stmt_prev_cogs)
    prev_cogs = float(res_prev_cogs.scalar() or 0.0)
    prev_profit = prev_rev - prev_cogs
    prev_margin_pct = round((prev_profit / prev_rev) * 100.0, 2) if prev_rev > 0 else 0.0

    # New customers
    stmt_new_cust = select(func.count(Customer.id)).where(
        Customer.outlet_id == outlet_id,
        Customer.created_at >= from_dt,
        Customer.created_at <= to_dt,
    )
    res_new_cust = await db.execute(stmt_new_cust)
    new_customers = res_new_cust.scalar() or 0

    # Returns
    stmt_returns = select(
        func.count(CustomerReturn.id).label("count"),
        func.coalesce(func.sum(CustomerReturn.total_refund_amount), 0).label("amount"),
    ).where(
        CustomerReturn.outlet_id == outlet_id,
        CustomerReturn.created_at >= from_dt,
        CustomerReturn.created_at <= to_dt,
    )
    res_returns = await db.execute(stmt_returns)
    row_returns = res_returns.first()
    return_count = row_returns.count if row_returns else 0
    total_return_amount = float(row_returns.amount) if row_returns else 0.0

    # Total discount
    stmt_discount = select(
        func.coalesce(func.sum(Order.discount_value), 0)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.discount_status == "APPROVED"
    )
    res_discount = await db.execute(stmt_discount)
    total_discount_given = float(res_discount.scalar() or 0.0)

    return KpiSummaryResponse(
        new_customers=new_customers,
        return_count=return_count,
        total_return_amount=round(total_return_amount, 2),
        total_discount_given=round(total_discount_given, 2),
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
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> RevenueAnalyticsResponse:
    """Bucket revenue and order counts over time with previous period comparison overlay."""
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    bucket_expr = _get_time_bucket_expr(Order.created_at, granularity, dialect).label("bucket_time")

    stmt = (
        select(
            bucket_expr,
            func.sum(Order.total_amount).label("revenue"),
            func.count(Order.id).label("orders_count"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(bucket_expr)
        .order_by(bucket_expr)
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
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> PeakHoursResponse:
    """Group order volume by hour of day (0 to 23)."""
    hr_expr = cast(func.extract("hour", Order.created_at), Integer).label("hr")
    stmt = (
        select(
            hr_expr,
            func.count(Order.id).label("cnt"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
        )
        .group_by(hr_expr)
        .order_by(hr_expr)
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
    outlet_id: uuid.UUID,
    sort_by: str,
    limit: int,
    from_dt: datetime,
    to_dt: datetime,
) -> TopItemsResponse:
    """Rank menu items by quantity sold or total revenue, including revenue share percentage."""
    total_qty_col = func.sum(OrderItem.quantity).label("total_qty")
    total_rev_col = func.sum(OrderItem.line_total).label("total_rev")

    stmt = (
        select(
            OrderItem.menu_item_id,
            OrderItem.item_name,
            Category.name.label("category_name"),
            total_qty_col,
            total_rev_col,
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .outerjoin(Category, MenuItem.category_id == Category.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(OrderItem.menu_item_id, OrderItem.item_name, Category.name)
    )

    if sort_by.lower() == "revenue":
        stmt = stmt.order_by(total_rev_col.desc())
    else:
        stmt = stmt.order_by(total_qty_col.desc())

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
                category_name=r.category_name,
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
    outlet_id: uuid.UUID,
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
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
        )
        .group_by(Order.status)
    )

    res = await db.execute(stmt)
    status_counts = {row.status: row.cnt for row in res.all()}

    total_orders = sum(status_counts.values())

    pending_cnt = status_counts.get(OrderStatusEnum.PENDING, 0) + status_counts.get(OrderStatusEnum.PENDING_VERIFICATION, 0)
    paid_cnt = status_counts.get(OrderStatusEnum.PAID, 0) + status_counts.get(OrderStatusEnum.PAYMENT_PENDING, 0)
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
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> ProfitMarginResponse:
    """Bucket revenue, COGS (from unit_cost_snapshot), and net profit margins."""
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    rev_b_expr = _get_time_bucket_expr(Order.created_at, granularity, dialect).label("b_time")
    cogs_b_expr = _get_time_bucket_expr(StockLedger.created_at, granularity, dialect).label("b_time")

    # Revenue query
    rev_stmt = (
        select(
            rev_b_expr,
            func.sum(Order.total_amount).label("rev"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(rev_b_expr)
    )
    res_rev = await db.execute(rev_stmt)
    rev_map = {
        (r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)): float(r.rev or 0)
        for r in res_rev.all()
    }

    # COGS deduction query
    cogs_stmt = (
        select(
            cogs_b_expr,
            func.sum(
                func.abs(StockLedger.quantity_change)
                * func.coalesce(StockLedger.unit_cost_snapshot, 0)
            ).label("cogs_val"),
        )
        .where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.created_at >= from_dt,
            StockLedger.created_at <= to_dt,
            StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
        )
        .group_by(cogs_b_expr)
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


async def get_category_sales(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> CategorySalesResponse:
    stmt = (
        select(
            Category.id.label("category_id"),
            Category.name.label("category_name"),
            func.count(func.distinct(OrderItem.menu_item_id)).label("items_sold"),
            func.sum(OrderItem.quantity).label("quantity_sold"),
            func.sum(OrderItem.line_total).label("revenue"),
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .join(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Category, MenuItem.category_id == Category.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(Category.id, Category.name)
        .order_by(func.sum(OrderItem.line_total).desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    total_rev = sum(float(r.revenue or 0) for r in rows)
    
    items = []
    for r in rows:
        rev = float(r.revenue or 0)
        qty = float(r.quantity_sold or 0)
        items.append(
            CategorySalesItem(
                category_id=str(r.category_id) if r.category_id else None,
                category_name=r.category_name or "Unknown",
                items_sold=int(r.items_sold or 0),
                quantity_sold=qty,
                revenue=round(rev, 2),
                revenue_share_pct=round((rev / total_rev) * 100.0, 2) if total_rev > 0 else 0.0,
                avg_item_price=round(rev / qty, 2) if qty > 0 else 0.0
            )
        )
    
    return CategorySalesResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_revenue=round(total_rev, 2),
        total_categories=len(items),
        items=items
    )


async def get_item_sales(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    sort_by: str,
    limit: int,
    category_id: str | None = None,
) -> ItemSalesResponse:
    stmt = (
        select(
            OrderItem.menu_item_id,
            OrderItem.item_name,
            Category.name.label("category_name"),
            func.sum(OrderItem.quantity).label("quantity_sold"),
            func.sum(OrderItem.line_total).label("revenue"),
            InventoryItem.cost_per_unit,
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .outerjoin(Category, MenuItem.category_id == Category.id)
        .outerjoin(InventoryItem, MenuItem.inventory_item_id == InventoryItem.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(OrderItem.menu_item_id, OrderItem.item_name, Category.name, InventoryItem.cost_per_unit)
    )

    if category_id:
        stmt = stmt.where(MenuItem.category_id == uuid.UUID(category_id))

    if sort_by.lower() == "revenue":
        stmt = stmt.order_by(func.sum(OrderItem.line_total).desc())
    else:
        stmt = stmt.order_by(func.sum(OrderItem.quantity).desc())

    stmt = stmt.limit(limit)
    res = await db.execute(stmt)
    rows = res.all()

    # Need total revenue across all items to calculate share properly, but we'll approximate with limited rows or a subquery
    total_rev = sum(float(r.revenue or 0) for r in rows)
    
    items = []
    for r in rows:
        rev = float(r.revenue or 0)
        qty = float(r.quantity_sold or 0)
        cost = float(r.cost_per_unit) if r.cost_per_unit is not None else None
        
        est_cogs = qty * cost if cost is not None else 0.0
        est_profit = rev - est_cogs if cost is not None else None
        margin = round((est_profit / rev) * 100.0, 2) if est_profit is not None and rev > 0 else None

        items.append(
            ItemSalesRow(
                menu_item_id=str(r.menu_item_id) if r.menu_item_id else None,
                item_name=r.item_name or "Unknown Item",
                category_name=r.category_name,
                quantity_sold=qty,
                revenue=round(rev, 2),
                revenue_share_pct=round((rev / total_rev) * 100.0, 2) if total_rev > 0 else 0.0,
                cost_per_unit=round(cost, 2) if cost is not None else None,
                estimated_profit=round(est_profit, 2) if est_profit is not None else None,
                margin_pct=margin
            )
        )

    return ItemSalesResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        sort_by=sort_by,
        category_filter=category_id,
        total_items=len(items),
        items=items
    )


async def get_bill_profit(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    limit: int = 50,
    offset: int = 0
) -> BillProfitResponse:
    stmt = (
        select(
            Order.id,
            Order.basket_number,
            Order.customer_name,
            Order.created_at,
            Order.payment_method,
            Order.subtotal_amount,
            Order.discount_value,
            Order.total_amount,
            func.count(OrderItem.id).label("items_count"),
            func.sum(OrderItem.quantity * func.coalesce(InventoryItem.cost_per_unit, 0)).label("estimated_cogs")
        )
        .select_from(Order)
        .outerjoin(OrderItem, Order.id == OrderItem.order_id)
        .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .outerjoin(InventoryItem, MenuItem.inventory_item_id == InventoryItem.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(Order.id)
        .order_by(Order.created_at.desc())
    )
    
    # We need total stats across all bills too
    stmt_totals = select(
        func.count(Order.id),
        func.coalesce(func.sum(Order.total_amount), 0)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
    )
    res_totals = await db.execute(stmt_totals)
    tot_row = res_totals.first()
    tot_bills = tot_row[0] if tot_row else 0
    tot_rev = float(tot_row[1]) if tot_row else 0.0

    # Also need global COGS
    stmt_global_cogs = select(
        func.sum(OrderItem.quantity * func.coalesce(InventoryItem.cost_per_unit, 0))
    ).select_from(Order).outerjoin(OrderItem, Order.id == OrderItem.order_id).outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id).outerjoin(InventoryItem, MenuItem.inventory_item_id == InventoryItem.id).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
    )
    res_global_cogs = await db.execute(stmt_global_cogs)
    tot_cogs = float(res_global_cogs.scalar() or 0.0)

    # Now get paginated rows
    stmt = stmt.limit(limit).offset(offset)
    res = await db.execute(stmt)
    rows = res.all()

    bills = []
    for r in rows:
        rev = float(r.total_amount or 0)
        cogs = float(r.estimated_cogs or 0)
        profit = rev - cogs
        pm = r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method) if r.payment_method else None
        bills.append(
            BillProfitRow(
                order_id=str(r.id),
                basket_number=r.basket_number or "",
                customer_name=r.customer_name,
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                payment_method=pm,
                subtotal=float(r.subtotal_amount or 0),
                discount_value=float(r.discount_value or 0),
                total_amount=rev,
                estimated_cogs=round(cogs, 2),
                estimated_profit=round(profit, 2),
                margin_pct=round((profit / rev) * 100.0, 2) if rev > 0 else 0.0,
                items_count=int(r.items_count or 0)
            )
        )

    tot_profit = tot_rev - tot_cogs
    overall_margin_pct = round((tot_profit / tot_rev) * 100.0, 2) if tot_rev > 0 else 0.0

    return BillProfitResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_bills=tot_bills,
        total_revenue=round(tot_rev, 2),
        total_cogs=round(tot_cogs, 2),
        total_profit=round(tot_profit, 2),
        overall_margin_pct=overall_margin_pct,
        bills=bills
    )


async def get_aov_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> AovAnalyticsResponse:
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    b_expr = _get_time_bucket_expr(Order.created_at, granularity, dialect).label("b_time")

    # Trend
    stmt_trend = (
        select(
            b_expr,
            func.avg(Order.total_amount).label("aov"),
            func.count(Order.id).label("cnt")
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(b_expr)
        .order_by(b_expr)
    )
    res_trend = await db.execute(stmt_trend)
    trend = []
    tot_rev, tot_ord = 0.0, 0
    for r in res_trend.all():
        b_str = r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)
        trend.append(
            AovBucket(
                bucket=b_str,
                avg_order_value=round(float(r.aov or 0), 2),
                orders_count=int(r.cnt or 0)
            )
        )
        tot_rev += float(r.aov or 0) * int(r.cnt or 0)
        tot_ord += int(r.cnt or 0)
        
    overall_aov = round(tot_rev / tot_ord, 2) if tot_ord > 0 else 0.0

    # By Payment Method
    stmt_pm = (
        select(
            Order.payment_method,
            func.avg(Order.total_amount).label("aov"),
            func.count(Order.id).label("cnt")
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by(Order.payment_method)
    )
    res_pm = await db.execute(stmt_pm)
    by_pm = []
    for r in res_pm.all():
        pm = r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method) if r.payment_method else "UNKNOWN"
        by_pm.append(
            AovByPaymentMethod(
                payment_method=pm,
                avg_order_value=round(float(r.aov or 0), 2),
                orders_count=int(r.cnt or 0)
            )
        )

    return AovAnalyticsResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        overall_aov=overall_aov,
        trend=trend,
        by_payment_method=by_pm
    )


async def get_stock_intake_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    item_id: str | None = None,
    supplier_id: str | None = None
) -> StockIntakeReportResponse:
    stmt = (
        select(
            StockIntake.id,
            InventoryItem.name.label("item_name"),
            StockIntake.item_id,
            Supplier.name.label("supplier_name"),
            StockIntake.batch_number,
            StockIntake.quantity,
            StockIntake.unit_cost,
            StockIntake.intake_date,
            StockIntake.expiry_date
        )
        .select_from(StockIntake)
        .join(InventoryItem, StockIntake.item_id == InventoryItem.id)
        .outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.intake_date >= from_dt.date(),
            StockIntake.intake_date <= to_dt.date(),
        )
        .order_by(StockIntake.intake_date.desc())
    )

    if item_id:
        stmt = stmt.where(StockIntake.item_id == uuid.UUID(item_id))
    if supplier_id:
        stmt = stmt.where(StockIntake.supplier_id == uuid.UUID(supplier_id))

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    tot_qty = 0.0
    tot_cost = 0.0
    for r in rows:
        qty = float(r.quantity or 0)
        uc = float(r.unit_cost or 0)
        tc = qty * uc
        tot_qty += qty
        tot_cost += tc
        items.append(
            StockIntakeRow(
                intake_id=str(r.id),
                item_name=r.item_name or "Unknown",
                item_id=str(r.item_id),
                supplier_name=r.supplier_name,
                batch_number=r.batch_number,
                quantity=qty,
                unit_cost=uc,
                total_cost=round(tc, 2),
                intake_date=r.intake_date.isoformat() if hasattr(r.intake_date, "isoformat") else str(r.intake_date),
                expiry_date=r.expiry_date.isoformat() if hasattr(r.expiry_date, "isoformat") else str(r.expiry_date) if r.expiry_date else None
            )
        )

    return StockIntakeReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_intakes=len(items),
        total_quantity=round(tot_qty, 2),
        total_cost=round(tot_cost, 2),
        items=items
    )


async def get_wastage_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> WastageReportResponse:
    stmt = (
        select(
            InventoryItem.name.label("item_name"),
            InventoryItem.id.label("item_id"),
            StockLedger.change_type,
            func.abs(StockLedger.quantity_change).label("quantity_wasted"),
            StockLedger.unit_cost_snapshot,
            StockLedger.created_at,
            User.name.label("created_by_name")
        )
        .select_from(StockLedger)
        .join(InventoryItem, StockLedger.item_id == InventoryItem.id)
        .outerjoin(User, StockLedger.created_by == User.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.created_at >= from_dt,
            StockLedger.created_at <= to_dt,
            ( (StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT) & (StockLedger.quantity_change < 0) ) | 
            (StockLedger.change_type == StockChangeTypeEnum.VOID_BATCH)
        )
        .order_by(StockLedger.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    items = []
    tot_qty = 0.0
    tot_cost = 0.0
    for r in rows:
        qty = float(r.quantity_wasted or 0)
        uc = float(r.unit_cost_snapshot or 0)
        wc = qty * uc
        tot_qty += qty
        tot_cost += wc
        items.append(
            WastageRow(
                item_name=r.item_name or "Unknown",
                item_id=str(r.item_id),
                change_type=r.change_type.value if hasattr(r.change_type, "value") else str(r.change_type),
                quantity_wasted=qty,
                unit_cost=uc,
                wastage_cost=round(wc, 2),
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                created_by_name=r.created_by_name
            )
        )

    # Get total intake cost for pct calc
    stmt_intake = select(func.coalesce(func.sum(StockIntake.quantity * StockIntake.unit_cost), 0)).where(
        StockIntake.outlet_id == outlet_id,
        StockIntake.intake_date >= from_dt.date(),
        StockIntake.intake_date <= to_dt.date(),
    )
    res_intake = await db.execute(stmt_intake)
    tot_intake_cost = float(res_intake.scalar() or 0.0)
    wastage_pct = round((tot_cost / tot_intake_cost) * 100.0, 2) if tot_intake_cost > 0 else 0.0

    return WastageReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_wastage_entries=len(items),
        total_quantity_wasted=round(tot_qty, 2),
        total_wastage_cost=round(tot_cost, 2),
        wastage_pct_of_intake=wastage_pct,
        items=items
    )


async def get_stock_movement(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> StockMovementResponse:
    stmt = (
        select(
            InventoryItem.id.label("item_id"),
            InventoryItem.name.label("item_name"),
            InventoryItem.unit,
            InventoryItem.current_stock.label("closing_stock"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.INTAKE, StockLedger.quantity_change),
                        else_=0
                    ), 0
                )
            ).label("intake_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION, func.abs(StockLedger.quantity_change)),
                        else_=0
                    ), 0
                )
            ).label("sales_deduction_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT, StockLedger.quantity_change),
                        else_=0
                    ), 0
                )
            ).label("manual_adjustment_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.RESTOCK, StockLedger.quantity_change),
                        else_=0
                    ), 0
                )
            ).label("restock_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.PURCHASE_RETURN, func.abs(StockLedger.quantity_change)),
                        else_=0
                    ), 0
                )
            ).label("purchase_return_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.VOID_BATCH, func.abs(StockLedger.quantity_change)),
                        else_=0
                    ), 0
                )
            ).label("void_batch_qty")
        )
        .select_from(InventoryItem)
        .outerjoin(
            StockLedger, 
            (InventoryItem.id == StockLedger.item_id) & 
            (StockLedger.outlet_id == outlet_id) & 
            (StockLedger.created_at >= from_dt) & 
            (StockLedger.created_at <= to_dt)
        )
        .where(
            InventoryItem.outlet_id == outlet_id,
            InventoryItem.is_active == True
        )
        .group_by(InventoryItem.id, InventoryItem.name, InventoryItem.unit, InventoryItem.current_stock)
        .order_by(InventoryItem.name)
    )
    res = await db.execute(stmt)
    
    items = []
    for r in res.all():
        cls = float(r.closing_stock or 0)
        inv = float(r.intake_qty or 0)
        sal = float(r.sales_deduction_qty or 0)
        man = float(r.manual_adjustment_qty or 0)
        res_qty = float(r.restock_qty or 0)
        pre = float(r.purchase_return_qty or 0)
        vbc = float(r.void_batch_qty or 0)

        net_change = inv - sal + man + res_qty - pre - vbc
        opn = cls - net_change

        items.append(
            StockMovementRow(
                item_id=str(r.item_id),
                item_name=r.item_name or "Unknown",
                unit=r.unit or "pcs",
                opening_stock=round(opn, 2),
                intake_qty=round(inv, 2),
                sales_deduction_qty=round(sal, 2),
                manual_adjustment_qty=round(man, 2),
                restock_qty=round(res_qty, 2),
                purchase_return_qty=round(pre, 2),
                void_batch_qty=round(vbc, 2),
                closing_stock=round(cls, 2)
            )
        )

    return StockMovementResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_items=len(items),
        items=items
    )


async def get_purchase_returns_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> PurchaseReturnReportResponse:
    stmt = (
        select(
            PurchaseReturn.id,
            PurchaseReturn.return_number,
            InventoryItem.name.label("item_name"),
            Supplier.name.label("supplier_name"),
            PurchaseReturn.batch_number,
            PurchaseReturn.quantity,
            PurchaseReturn.unit_cost,
            PurchaseReturn.total_refund_amount,
            PurchaseReturn.reason,
            PurchaseReturn.created_at
        )
        .select_from(PurchaseReturn)
        .join(InventoryItem, PurchaseReturn.item_id == InventoryItem.id)
        .outerjoin(StockIntake, PurchaseReturn.intake_id == StockIntake.id).outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            PurchaseReturn.outlet_id == outlet_id,
            PurchaseReturn.created_at >= from_dt,
            PurchaseReturn.created_at <= to_dt,
        )
        .order_by(PurchaseReturn.created_at.desc())
    )
    res = await db.execute(stmt)
    
    items = []
    tot_ref = 0.0
    for r in res.all():
        amt = float(r.total_refund_amount or 0)
        tot_ref += amt
        items.append(
            PurchaseReturnRow(
                return_id=str(r.id),
                return_number=r.return_number or "",
                item_name=r.item_name or "Unknown",
                supplier_name=r.supplier_name or "Unknown",
                batch_number=r.batch_number,
                quantity=float(r.quantity or 0),
                unit_cost=float(r.unit_cost or 0),
                total_refund_amount=round(amt, 2),
                reason=r.reason or "",
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at)
            )
        )

    return PurchaseReturnReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_returns=len(items),
        total_refund_amount=round(tot_ref, 2),
        items=items
    )


async def get_new_customers(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> NewCustomerReportResponse:
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    b_expr = _get_time_bucket_expr(Customer.created_at, granularity, dialect).label("b_time")

    stmt = (
        select(
            b_expr,
            func.count(Customer.id).label("new_count")
        )
        .where(
            Customer.outlet_id == outlet_id,
            Customer.created_at >= from_dt,
            Customer.created_at <= to_dt,
        )
        .group_by(b_expr)
        .order_by(b_expr)
    )
    res = await db.execute(stmt)
    
    stmt_all = select(func.count(Customer.id)).where(Customer.outlet_id == outlet_id)
    res_all = await db.execute(stmt_all)
    tot_all = res_all.scalar() or 0

    stmt_before = select(func.count(Customer.id)).where(
        Customer.outlet_id == outlet_id, Customer.created_at < from_dt
    )
    res_before = await db.execute(stmt_before)
    cum_tot = res_before.scalar() or 0

    trend = []
    tot_new = 0
    for r in res.all():
        nc = int(r.new_count or 0)
        cum_tot += nc
        tot_new += nc
        b_str = r.b_time.strftime("%Y-%m-%d") if hasattr(r.b_time, "strftime") else str(r.b_time)
        trend.append(
            NewCustomerBucket(
                bucket=b_str,
                new_count=nc,
                cumulative_total=cum_tot
            )
        )

    recent_cust_stmt = (
        select(
            Customer.id,
            Customer.name,
            Customer.phone,
            Customer.created_at,
            func.count(Order.id).label("total_orders"),
            func.sum(Order.total_amount).label("total_spent"),
        )
        .outerjoin(Order, (Order.customer_id == Customer.id) & (Order.status != OrderStatusEnum.CANCELLED))
        .where(
            Customer.outlet_id == outlet_id,
            Customer.created_at >= from_dt,
            Customer.created_at <= to_dt,
        )
        .group_by(Customer.id, Customer.name, Customer.phone, Customer.created_at)
        .order_by(Customer.created_at.desc())
        .limit(50)
    )
    
    recent_res = await db.execute(recent_cust_stmt)
    
    recent_customers = []
    for r in recent_res.all():
        recent_customers.append(
            NewCustomerDetail(
                customer_id=str(r.id),
                name=r.name,
                phone=r.phone,
                email=None,
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                total_orders=int(r.total_orders or 0),
                total_spent=float(r.total_spent or 0.0),
            )
        )

    return NewCustomerReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        granularity=granularity,
        total_new_customers=tot_new,
        total_customers_all_time=tot_all,
        trend=trend,
        recent_customers=recent_customers
    )


async def get_customer_return_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> CustomerReturnReportResponse:
    stmt = (
        select(
            CustomerReturn.id,
            CustomerReturn.return_number,
            CustomerReturn.order_id,
            Order.customer_name,
            Order.customer_phone,
            CustomerReturn.returned_items,
            CustomerReturn.total_refund_amount,
            CustomerReturn.refund_payment_method,
            CustomerReturn.created_at
        )
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt,
            CustomerReturn.created_at <= to_dt,
        )
        .order_by(CustomerReturn.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    returns = []
    tot_ref = 0.0
    item_stats = {}
    
    for r in rows:
        amt = float(r.total_refund_amount or 0)
        tot_ref += amt
        ritems = r.returned_items if isinstance(r.returned_items, list) else []
        
        returns.append(
            CustomerReturnRow(
                return_id=str(r.id),
                return_number=r.return_number or "",
                order_id=str(r.order_id) if r.order_id else None,
                customer_name=r.customer_name,
                customer_phone=r.customer_phone,
                items_returned=len(ritems),
                total_refund_amount=round(amt, 2),
                refund_payment_method=r.refund_payment_method.value if hasattr(r.refund_payment_method, "value") else str(r.refund_payment_method),
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at)
            )
        )
        
        for item in ritems:
            iname = item.get("item_name", "Unknown")
            iqty = float(item.get("quantity", 0))
            iuprice = float(item.get("unit_price", 0))
            iamt = iqty * iuprice
            
            if iname not in item_stats:
                item_stats[iname] = {"count": 0, "qty": 0.0, "amt": 0.0}
            item_stats[iname]["count"] += 1
            item_stats[iname]["qty"] += iqty
            item_stats[iname]["amt"] += iamt

    top_items = []
    for k, v in sorted(item_stats.items(), key=lambda x: x[1]["amt"], reverse=True)[:10]:
        top_items.append(
            TopReturnedItem(
                item_name=k,
                return_count=v["count"],
                total_quantity_returned=round(v["qty"], 2),
                total_refund_amount=round(v["amt"], 2)
            )
        )

    stmt_ords = select(func.count(Order.id)).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES)
    )
    res_ords = await db.execute(stmt_ords)
    tot_ords = res_ords.scalar() or 0
    rr_pct = round((len(returns) / tot_ords) * 100.0, 2) if tot_ords > 0 else 0.0

    return CustomerReturnReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_returns=len(returns),
        total_refund_amount=round(tot_ref, 2),
        return_rate_pct=rr_pct,
        top_returned_items=top_items,
        returns=returns
    )


async def get_cash_denomination_flow(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> CashDenominationResponse:
    stmt = select(
        CashDrawerLedger.transaction_type,
        CashDrawerLedger.denominations
    ).where(
        CashDrawerLedger.outlet_id == outlet_id,
        CashDrawerLedger.created_at >= from_dt,
        CashDrawerLedger.created_at <= to_dt,
    )
    res = await db.execute(stmt)
    
    types_map = {}
    overall_map = {}
    net_in_drawer = 0.0
    tot_tx = 0

    for r in res.all():
        ttype = r.transaction_type.value if hasattr(r.transaction_type, "value") else str(r.transaction_type)
        denoms = r.denominations if isinstance(r.denominations, dict) else {}
        
        if ttype not in types_map:
            types_map[ttype] = {"tx": 0, "denoms": {}}
        
        types_map[ttype]["tx"] += 1
        tot_tx += 1
        
        for d, count in denoms.items():
            if not count: continue
            
            d_val = float(d)
            val = d_val * count
            
            if d not in overall_map:
                overall_map[d] = {"in": 0, "out": 0}
            if d not in types_map[ttype]["denoms"]:
                types_map[ttype]["denoms"][d] = {"in": 0, "out": 0}
                
            if count > 0:
                overall_map[d]["in"] += count
                types_map[ttype]["denoms"][d]["in"] += count
            else:
                overall_map[d]["out"] += abs(count)
                types_map[ttype]["denoms"][d]["out"] += abs(count)
                
            net_in_drawer += val

    overall_denoms = []
    for d in sorted(overall_map.keys(), key=lambda x: float(x), reverse=True):
        inn = overall_map[d]["in"]
        out = overall_map[d]["out"]
        overall_denoms.append(
            DenominationBreakdown(
                denomination=d,
                notes_in=inn,
                notes_out=out,
                net_notes=inn - out,
                net_value=(inn - out) * float(d)
            )
        )
        
    by_type = []
    for ttype, dinfo in types_map.items():
        tdenoms = []
        for d in sorted(dinfo["denoms"].keys(), key=lambda x: float(x), reverse=True):
            inn = dinfo["denoms"][d]["in"]
            out = dinfo["denoms"][d]["out"]
            tdenoms.append(
                DenominationBreakdown(
                    denomination=d,
                    notes_in=inn,
                    notes_out=out,
                    net_notes=inn - out,
                    net_value=(inn - out) * float(d)
                )
            )
        by_type.append(
            CashFlowByType(
                transaction_type=ttype,
                total_transactions=dinfo["tx"],
                denominations=tdenoms
            )
        )

    return CashDenominationResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_transactions=tot_tx,
        net_cash_in_drawer=round(net_in_drawer, 2),
        by_transaction_type=by_type,
        overall_denominations=overall_denoms
    )


async def get_payment_mix(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> PaymentMixResponse:
    stmt = (
        select(
            func.coalesce(Order.payment_method, "UNKNOWN").label("pm"),
            func.count(Order.id).label("cnt"),
            func.sum(Order.total_amount).label("rev")
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by("pm")
        .order_by(func.sum(Order.total_amount).desc())
    )
    res = await db.execute(stmt)
    rows = res.all()
    
    tot_rev = sum(float(r.rev or 0) for r in rows)
    tot_ord = sum(int(r.cnt or 0) for r in rows)
    
    methods = []
    for r in rows:
        pm = r.pm.value if hasattr(r.pm, "value") else str(r.pm)
        rev = float(r.rev or 0)
        cnt = int(r.cnt or 0)
        methods.append(
            PaymentMixRow(
                payment_method=pm,
                orders_count=cnt,
                total_revenue=round(rev, 2),
                revenue_share_pct=round((rev / tot_rev) * 100.0, 2) if tot_rev > 0 else 0.0,
                avg_order_value=round(rev / cnt, 2) if cnt > 0 else 0.0
            )
        )

    return PaymentMixResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_orders=tot_ord,
        total_revenue=round(tot_rev, 2),
        methods=methods
    )


async def get_tax_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> TaxSummaryResponse:
    stmt = (
        select(
            func.coalesce(OrderItem.tax_category, "GST 0%").label("cat"),
            func.coalesce(OrderItem.tax_rate, 0.0).label("rate"),
            func.sum(OrderItem.line_total).label("taxable"),
            func.count(func.distinct(OrderItem.id)).label("cnt")
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
        )
        .group_by("cat", "rate")
        .order_by("rate")
    )
    res = await db.execute(stmt)
    rows = res.all()
    
    slabs = []
    tot_taxable = 0.0
    tot_tax = 0.0
    
    for r in rows:
        taxable = float(r.taxable or 0)
        rate = float(r.rate or 0)
        collected = taxable * (rate / 100.0)
        
        tot_taxable += taxable
        tot_tax += collected
        
        slabs.append(
            TaxSlabRow(
                tax_category=r.cat,
                tax_rate=rate,
                taxable_amount=round(taxable, 2),
                tax_collected=round(collected, 2),
                items_count=int(r.cnt or 0)
            )
        )
        
    return TaxSummaryResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_taxable_amount=round(tot_taxable, 2),
        total_tax_collected=round(tot_tax, 2),
        slabs=slabs
    )


async def get_discount_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> DiscountReportResponse:
    stmt_sum = select(
        func.count(Order.id),
        func.sum(Order.discount_value),
        func.sum(Order.total_amount)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
    )
    res_sum = await db.execute(stmt_sum)
    srow = res_sum.first()
    tot_ords = srow[0] if srow else 0
    tot_rev_all = float(srow[2] or 0)
    
    stmt_dsc = select(
        func.count(Order.id),
        func.sum(Order.discount_value)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.discount_value > 0,
        Order.discount_status == "APPROVED"
    )
    res_dsc = await db.execute(stmt_dsc)
    drow = res_dsc.first()
    dsc_ords = drow[0] if drow else 0
    dsc_amt = float(drow[1] or 0)
    
    summary = DiscountSummary(
        total_orders_with_discount=dsc_ords,
        total_discount_amount=round(dsc_amt, 2),
        avg_discount_per_order=round(dsc_amt / dsc_ords, 2) if dsc_ords > 0 else 0.0,
        discount_pct_of_revenue=round((dsc_amt / tot_rev_all) * 100.0, 2) if tot_rev_all > 0 else 0.0
    )
    
    stmt_type = select(
        func.coalesce(Order.discount_type, "UNKNOWN").label("type"),
        func.count(Order.id).label("cnt"),
        func.sum(Order.discount_value).label("amt")
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.discount_value > 0,
        Order.discount_status == "APPROVED"
    ).group_by("type")
    res_type = await db.execute(stmt_type)
    by_type = [
        DiscountByType(
            discount_type=r.type.value if hasattr(r.type, "value") else str(r.type),
            count=int(r.cnt or 0),
            total_amount=round(float(r.amt or 0), 2)
        ) for r in res_type.all()
    ]
    
    stmt_appr = select(
        BillDiscountApproval.status,
        func.count(BillDiscountApproval.id)
    ).join(Order, BillDiscountApproval.order_id == Order.id).where(
        Order.outlet_id == outlet_id,
        BillDiscountApproval.created_at >= from_dt,
        BillDiscountApproval.created_at <= to_dt
    ).group_by(BillDiscountApproval.status)
    res_appr = await db.execute(stmt_appr)
    
    astats = {"PENDING": 0, "APPROVED": 0, "REJECTED": 0}
    for r in res_appr.all():
        s = r[0].value if hasattr(r[0], "value") else str(r[0])
        astats[s] = int(r[1])
        
    tot_req = sum(astats.values())
    appr_stats = DiscountApprovalStats(
        total_requests=tot_req,
        approved=astats.get("APPROVED", 0),
        rejected=astats.get("REJECTED", 0),
        pending=astats.get("PENDING", 0),
        approval_rate_pct=round((astats.get("APPROVED", 0) / tot_req) * 100.0, 2) if tot_req > 0 else 0.0
    )
    
    stmt_rsn = select(
        BillDiscountApproval.reason_note,
        func.count(BillDiscountApproval.id).label("cnt"),
        func.sum(BillDiscountApproval.discount_value).label("amt")
    ).join(Order, BillDiscountApproval.order_id == Order.id).where(
        Order.outlet_id == outlet_id,
        BillDiscountApproval.created_at >= from_dt,
        BillDiscountApproval.created_at <= to_dt,
        BillDiscountApproval.status == "APPROVED"
    ).group_by(BillDiscountApproval.reason_note).order_by(func.count(BillDiscountApproval.id).desc()).limit(10)
    res_rsn = await db.execute(stmt_rsn)
    top_rsns = [
        TopDiscountReason(
            reason=r.reason_note or "Unknown",
            count=int(r.cnt or 0),
            total_amount=round(float(r.amt or 0), 2)
        ) for r in res_rsn.all()
    ]
    
    stmt_comp = select(
        func.count(OrderItem.id),
        func.sum(OrderItem.line_total)
    ).select_from(OrderItem).join(Order, OrderItem.order_id == Order.id).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        OrderItem.is_complimentary == True
    )
    res_comp = await db.execute(stmt_comp)
    crow = res_comp.first()
    
    return DiscountReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        summary=summary,
        by_type=by_type,
        approval_stats=appr_stats,
        top_reasons=top_rsns,
        total_complimentary_items=int(crow[0] if crow else 0),
        total_complimentary_value=round(float(crow[1] or 0), 2)
    )


async def get_credit_debit_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> dict:
    """Analytics for customer credit and debit."""
    # Summary query
    summary_stmt = (
        select(
            func.coalesce(func.sum(case((Customer.credit_balance > 0, Customer.credit_balance), else_=0)), 0).label("total_outstanding_credit"),
            func.coalesce(func.sum(case((Customer.credit_balance < 0, Customer.credit_balance), else_=0)), 0).label("total_outstanding_debit"),
            func.count(case((Customer.credit_balance > 0, 1))).label("customers_with_credit"),
            func.count(case((Customer.credit_balance < 0, 1))).label("customers_with_debit"),
        )
        .where(Customer.outlet_id == outlet_id)
    )
    summary_res = await db.execute(summary_stmt)
    s_row = summary_res.first()

    # Transactions in period
    tx_stmt = (
        select(func.count(CustomerLedger.id))
        .where(
            CustomerLedger.outlet_id == outlet_id,
            CustomerLedger.created_at >= from_dt,
            CustomerLedger.created_at <= to_dt
        )
    )
    tx_res = await db.execute(tx_stmt)
    total_tx = tx_res.scalar() or 0

    # Customer-wise details
    # We want to list customers who have a non-zero balance OR had transactions in the period
    cust_stmt = (
        select(
            Customer.id,
            Customer.name,
            Customer.phone,
            Customer.credit_balance,
            func.coalesce(func.sum(case((CustomerLedger.entry_type.in_(("CREDIT_ADDED", "DEBIT_APPLIED")), CustomerLedger.amount), else_=0)), 0).label("total_credit_given"),
            func.coalesce(func.sum(case((CustomerLedger.entry_type.in_(("DEBIT_ADDED", "CREDIT_APPLIED")), CustomerLedger.amount), else_=0)), 0).label("total_debit_recorded"),
            func.max(CustomerLedger.created_at).label("last_tx")
        )
        .outerjoin(CustomerLedger, (Customer.id == CustomerLedger.customer_id) & (CustomerLedger.created_at >= from_dt) & (CustomerLedger.created_at <= to_dt))
        .where(
            (Customer.outlet_id == outlet_id) &
            ((Customer.credit_balance != 0) | (CustomerLedger.id.isnot(None)))
        )
        .group_by(Customer.id)
        .order_by(Customer.credit_balance.asc()) # Largest debits first
    )
    cust_res = await db.execute(cust_stmt)

    customers = []
    for row in cust_res.all():
        customers.append({
            "customer_id": str(row.id),
            "customer_name": row.name,
            "customer_phone": row.phone,
            "credit_balance": float(row.credit_balance),
            "total_credit_given": float(row.total_credit_given),
            "total_debit_recorded": float(row.total_debit_recorded),
            "last_transaction_date": row.last_tx.isoformat() if row.last_tx else None
        })

    return {
        "summary": {
            "total_outstanding_credit": float(s_row.total_outstanding_credit or 0),
            "total_outstanding_debit": abs(float(s_row.total_outstanding_debit or 0)),
            "customers_with_credit": s_row.customers_with_credit or 0,
            "customers_with_debit": s_row.customers_with_debit or 0,
            "total_transactions": total_tx
        },
        "customers": customers,
        "from_date": from_dt.isoformat(),
        "to_date": to_dt.isoformat()
    }


async def get_day_book(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    date_str: str,
) -> DayBookResponse:
    target_dt = datetime.strptime(date_str, "%Y-%m-%d")
    end_dt = target_dt + timedelta(days=1)
    
    stmt_open = select(
        CashDrawerLedger.transaction_type, CashDrawerLedger.denominations
    ).where(
        CashDrawerLedger.outlet_id == outlet_id,
        CashDrawerLedger.created_at < target_dt
    )
    res_open = await db.execute(stmt_open)
    opening_cash = 0.0
    for r in res_open.all():
        denoms = r.denominations or {}
        try:
            amt = sum(int(k) * int(v) for k, v in denoms.items() if str(k).isdigit())
        except (ValueError, TypeError):
            amt = 0.0
        opening_cash += amt
    
    entries = []
    
    stmt_ord = select(
        Order.created_at, Order.basket_number, Order.total_amount, Order.payment_method
    ).where(
        Order.outlet_id == outlet_id, Order.created_at >= target_dt, Order.created_at < end_dt,
        Order.status.in_(SETTLED_STATUSES)
    )
    res_ord = await db.execute(stmt_ord)
    tot_sales = 0.0
    for r in res_ord.all():
        amt = float(r.total_amount or 0)
        pm = r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method)
        tot_sales += amt
        entries.append({
            "ts": r.created_at,
            "type": "SALE",
            "ref": r.basket_number or "",
            "desc": f"Bill via {pm}",
            "dr": 0.0,
            "cr": amt
        })
        
    stmt_ret = select(
        CustomerReturn.created_at, CustomerReturn.return_number, CustomerReturn.total_refund_amount
    ).where(
        CustomerReturn.outlet_id == outlet_id, CustomerReturn.created_at >= target_dt, CustomerReturn.created_at < end_dt
    )
    res_ret = await db.execute(stmt_ret)
    tot_ret = 0.0
    for r in res_ret.all():
        amt = float(r.total_refund_amount or 0)
        tot_ret += amt
        entries.append({
            "ts": r.created_at,
            "type": "CUSTOMER_RETURN",
            "ref": r.return_number or "",
            "desc": "Customer Refund",
            "dr": amt,
            "cr": 0.0
        })
        
    stmt_cdl = select(
        CashDrawerLedger.created_at, CashDrawerLedger.transaction_type, CashDrawerLedger.denominations, CashDrawerLedger.notes
    ).where(
        CashDrawerLedger.outlet_id == outlet_id, CashDrawerLedger.created_at >= target_dt, CashDrawerLedger.created_at < end_dt,
        CashDrawerLedger.transaction_type.in_(["MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"])
    )
    res_cdl = await db.execute(stmt_cdl)
    tot_in, tot_out = 0.0, 0.0
    for r in res_cdl.all():
        denoms = r.denominations or {}
        try:
            amt = sum(int(k) * int(v) for k, v in denoms.items() if str(k).isdigit())
        except (ValueError, TypeError):
            amt = 0.0
        
        amt = abs(float(amt))
        ttype = r.transaction_type.value if hasattr(r.transaction_type, "value") else str(r.transaction_type)
        is_dep = ttype == "MANUAL_DEPOSIT"
        if is_dep:
            tot_in += amt
        else:
            tot_out += amt
        entries.append({
            "ts": r.created_at,
            "type": "CASH_DEPOSIT" if is_dep else "CASH_WITHDRAWAL",
            "ref": "-",
            "desc": r.notes or ttype,
            "dr": 0.0 if is_dep else amt,
            "cr": amt if is_dep else 0.0
        })
        
    stmt_si = select(
        StockIntake.intake_date, InventoryItem.name, StockIntake.quantity, StockIntake.unit_cost
    ).select_from(StockIntake).join(InventoryItem, StockIntake.item_id == InventoryItem.id).where(
        StockIntake.outlet_id == outlet_id, StockIntake.intake_date >= target_dt.date(), StockIntake.intake_date <= end_dt.date()
    )
    res_si = await db.execute(stmt_si)
    tot_si = 0.0
    for r in res_si.all():
        amt = float((r.quantity or 0) * (r.unit_cost or 0))
        tot_si += amt
        
        entry_time = target_dt
        if hasattr(r.intake_date, "hour"):
            entry_time = r.intake_date
        else:
            entry_time = datetime.combine(r.intake_date, datetime.min.time())
            
        entries.append({
            "ts": entry_time,
            "type": "STOCK_INTAKE",
            "ref": "-",
            "desc": f"Purchase: {r.name}",
            "dr": amt,
            "cr": 0.0
        })
        
    entries.sort(key=lambda x: x["ts"])
    
    day_entries = []
    bal = opening_cash
    for e in entries:
        bal = bal + e["cr"] - e["dr"]
        day_entries.append(
            DayBookEntry(
                timestamp=e["ts"].isoformat() if hasattr(e["ts"], "isoformat") else str(e["ts"]),
                entry_type=e["type"],
                reference_number=e["ref"],
                description=e["desc"],
                debit=round(e["dr"], 2),
                credit=round(e["cr"], 2),
                running_balance=round(bal, 2)
            )
        )
        
    return DayBookResponse(
        date=date_str,
        opening_cash=round(opening_cash, 2),
        total_sales=round(tot_sales, 2),
        total_returns=round(tot_ret, 2),
        total_cash_in=round(tot_in, 2),
        total_cash_out=round(tot_out, 2),
        total_stock_intake_cost=round(tot_si, 2),
        closing_balance=round(bal, 2),
        entries=day_entries
    )


async def get_abandoned_cart_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> AbandonedCartStatsResponse:
    stmt = select(
        func.count(AbandonedCart.id),
        func.sum(case((AbandonedCart.status == "CONVERTED", 1), else_=0)),
        func.sum(case((AbandonedCart.status == "ABANDONED", 1), else_=0)),
        func.sum(AbandonedCart.total_estimate),
        func.sum(case((AbandonedCart.status == "CONVERTED", AbandonedCart.total_estimate), else_=0))
    ).where(
        AbandonedCart.outlet_id == outlet_id,
        AbandonedCart.created_at >= from_dt,
        AbandonedCart.created_at <= to_dt,
    )
    res = await db.execute(stmt)
    row = res.first()
    
    tot = int(row[0] or 0) if row else 0
    conv = int(row[1] or 0) if row else 0
    aban = int(row[2] or 0) if row else 0
    tot_val = float(row[3] or 0)
    conv_val = float(row[4] or 0)
    
    return AbandonedCartStatsResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_abandoned=aban,
        total_converted=conv,
        conversion_rate_pct=round((conv / tot) * 100.0, 2) if tot > 0 else 0.0,
        total_abandoned_value=round(tot_val - conv_val, 2),
        total_converted_value=round(conv_val, 2),
        avg_cart_value=round(tot_val / tot, 2) if tot > 0 else 0.0
    )


async def get_loyalty_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> LoyaltyReportResponse:
    stmt_ord = select(
        func.sum(Order.loyalty_points_earned),
        func.sum(Order.loyalty_points_redeemed)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
    )
    res_ord = await db.execute(stmt_ord)
    orow = res_ord.first()
    earned = int(orow[0] or 0) if orow else 0
    redeemed = int(orow[1] or 0) if orow else 0
    
    stmt_cust = select(
        func.sum(Customer.loyalty_points),
        func.count(case((Customer.loyalty_points > 0, 1)))
    ).where(
        Customer.outlet_id == outlet_id,
    )
    res_cust = await db.execute(stmt_cust)
    crow = res_cust.first()
    outs = int(crow[0] or 0) if crow else 0
    withp = int(crow[1] or 0) if crow else 0
    
    return LoyaltyReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_points_earned=earned,
        total_points_redeemed=redeemed,
        net_outstanding_points=outs,
        total_customers_with_points=withp,
        avg_points_per_customer=round(outs / withp, 2) if withp > 0 else 0.0,
        redemption_rate_pct=round((redeemed / earned) * 100.0, 2) if earned > 0 else 0.0
    )


async def get_supplier_spend(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> SupplierSpendResponse:
    stmt = (
        select(
            Supplier.id.label("sid"),
            func.coalesce(Supplier.name, "Unknown").label("sname"),
            func.count(StockIntake.id).label("cnt"),
            func.sum(StockIntake.quantity).label("qty"),
            func.sum(StockIntake.quantity * StockIntake.unit_cost).label("spend"),
            func.avg(StockIntake.unit_cost).label("avg_uc")
        )
        .select_from(StockIntake)
        .outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.intake_date >= from_dt.date(),
            StockIntake.intake_date <= to_dt.date(),
        )
        .group_by(Supplier.id, Supplier.name)
        .order_by(func.sum(StockIntake.quantity * StockIntake.unit_cost).desc())
    )
    res = await db.execute(stmt)
    rows = res.all()
    
    tot_spend = sum(float(r.spend or 0) for r in rows)
    suppliers = []
    
    for r in rows:
        sp = float(r.spend or 0)
        suppliers.append(
            SupplierSpendRow(
                supplier_id=str(r.sid) if r.sid else None,
                supplier_name=r.sname,
                total_intakes=int(r.cnt or 0),
                total_quantity=float(r.qty or 0),
                total_spend=round(sp, 2),
                avg_unit_cost=round(float(r.avg_uc or 0), 2),
                share_pct=round((sp / tot_spend) * 100.0, 2) if tot_spend > 0 else 0.0
            )
        )
        
    return SupplierSpendResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_spend=round(tot_spend, 2),
        total_suppliers=len(suppliers),
        suppliers=suppliers
    )
