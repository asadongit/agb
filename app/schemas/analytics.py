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
    # New fields
    new_customers: int = 0
    return_count: int = 0
    total_return_amount: float = 0.0
    total_discount_given: float = 0.0


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
    category_name: str | None = None
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


class CreditDebitCustomerRow(StrictSchema):
    customer_id: str
    customer_name: str
    customer_phone: str
    credit_balance: float
    total_credit_given: float
    total_debit_recorded: float
    last_transaction_date: str | None = None

class CreditDebitSummary(StrictSchema):
    total_outstanding_credit: float
    total_outstanding_debit: float
    customers_with_credit: int
    customers_with_debit: int
    total_transactions: int

class CreditDebitReportResponse(BaseResponse):
    summary: CreditDebitSummary
    customers: list[CreditDebitCustomerRow]
    from_date: str
    to_date: str



class CategorySalesItem(StrictSchema):
    category_id: str | None
    category_name: str
    items_sold: int
    quantity_sold: float
    revenue: float
    revenue_share_pct: float
    avg_item_price: float


class CategorySalesResponse(BaseResponse):
    from_date: str
    to_date: str
    total_revenue: float
    total_categories: int
    items: list[CategorySalesItem]


class ItemSalesRow(StrictSchema):
    menu_item_id: str | None
    item_name: str
    category_name: str | None
    quantity_sold: float
    revenue: float
    revenue_share_pct: float
    cost_per_unit: float | None
    estimated_profit: float | None
    margin_pct: float | None


class ItemSalesResponse(BaseResponse):
    from_date: str
    to_date: str
    sort_by: str
    category_filter: str | None = None
    total_items: int
    items: list[ItemSalesRow]


class BillProfitRow(StrictSchema):
    order_id: str
    basket_number: str
    customer_name: str | None
    created_at: str
    payment_method: str | None
    subtotal: float
    discount_value: float | None
    total_amount: float
    estimated_cogs: float
    estimated_profit: float
    margin_pct: float
    items_count: int


class BillProfitResponse(BaseResponse):
    from_date: str
    to_date: str
    total_bills: int
    total_revenue: float
    total_cogs: float
    total_profit: float
    overall_margin_pct: float
    bills: list[BillProfitRow]


class AovBucket(StrictSchema):
    bucket: str
    avg_order_value: float
    orders_count: int


class AovByPaymentMethod(StrictSchema):
    payment_method: str
    avg_order_value: float
    orders_count: int


class AovAnalyticsResponse(BaseResponse):
    from_date: str
    to_date: str
    overall_aov: float
    trend: list[AovBucket]
    by_payment_method: list[AovByPaymentMethod]


class StockIntakeRow(StrictSchema):
    intake_id: str
    item_name: str
    item_id: str
    supplier_name: str | None
    batch_number: str | None
    quantity: float
    unit_cost: float
    total_cost: float
    intake_date: str
    expiry_date: str | None


class StockIntakeReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_intakes: int
    total_quantity: float
    total_cost: float
    items: list[StockIntakeRow]


class WastageRow(StrictSchema):
    item_name: str
    item_id: str
    change_type: str
    quantity_wasted: float
    unit_cost: float | None
    wastage_cost: float
    created_at: str
    created_by_name: str | None


class WastageReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_wastage_entries: int
    total_quantity_wasted: float
    total_wastage_cost: float
    wastage_pct_of_intake: float
    items: list[WastageRow]


class StockMovementRow(StrictSchema):
    item_id: str
    item_name: str
    unit: str
    opening_stock: float
    intake_qty: float
    sales_deduction_qty: float
    manual_adjustment_qty: float
    restock_qty: float
    purchase_return_qty: float
    void_batch_qty: float
    closing_stock: float


class StockMovementResponse(BaseResponse):
    from_date: str
    to_date: str
    total_items: int
    items: list[StockMovementRow]


class PurchaseReturnRow(StrictSchema):
    return_id: str
    return_number: str
    item_name: str
    supplier_name: str
    batch_number: str | None
    quantity: float
    unit_cost: float
    total_refund_amount: float
    reason: str
    created_at: str


class PurchaseReturnReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_returns: int
    total_refund_amount: float
    items: list[PurchaseReturnRow]


class NewCustomerBucket(StrictSchema):
    bucket: str
    new_count: int
    cumulative_total: int


class NewCustomerDetail(StrictSchema):
    customer_id: str
    name: str | None
    phone: str | None
    email: str | None
    created_at: str
    total_orders: int
    total_spent: float


class NewCustomerReportResponse(BaseResponse):
    from_date: str
    to_date: str
    granularity: str
    total_new_customers: int
    total_customers_all_time: int
    trend: list[NewCustomerBucket]
    recent_customers: list[NewCustomerDetail] = []


class CustomerReturnRow(StrictSchema):
    return_id: str
    return_number: str
    order_id: str | None
    customer_name: str | None
    customer_phone: str | None
    items_returned: int
    total_refund_amount: float
    refund_payment_method: str
    created_at: str


class TopReturnedItem(StrictSchema):
    item_name: str
    return_count: int
    total_quantity_returned: float
    total_refund_amount: float


class CustomerReturnReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_returns: int
    total_refund_amount: float
    return_rate_pct: float
    top_returned_items: list[TopReturnedItem]
    returns: list[CustomerReturnRow]


class DenominationBreakdown(StrictSchema):
    denomination: str
    notes_in: int
    notes_out: int
    net_notes: int
    net_value: float


class CashFlowByType(StrictSchema):
    transaction_type: str
    total_transactions: int
    denominations: list[DenominationBreakdown]


class CashDenominationResponse(BaseResponse):
    from_date: str
    to_date: str
    total_transactions: int
    net_cash_in_drawer: float
    by_transaction_type: list[CashFlowByType]
    overall_denominations: list[DenominationBreakdown]


class PaymentMixRow(StrictSchema):
    payment_method: str
    orders_count: int
    total_revenue: float
    revenue_share_pct: float
    avg_order_value: float


class PaymentMixResponse(BaseResponse):
    from_date: str
    to_date: str
    total_orders: int
    total_revenue: float
    methods: list[PaymentMixRow]


class TaxSlabRow(StrictSchema):
    tax_category: str
    tax_rate: float
    taxable_amount: float
    tax_collected: float
    items_count: int


class TaxSummaryResponse(BaseResponse):
    from_date: str
    to_date: str
    total_taxable_amount: float
    total_tax_collected: float
    slabs: list[TaxSlabRow]


class DiscountSummary(StrictSchema):
    total_orders_with_discount: int
    total_discount_amount: float
    avg_discount_per_order: float
    discount_pct_of_revenue: float


class DiscountByType(StrictSchema):
    discount_type: str
    count: int
    total_amount: float


class DiscountApprovalStats(StrictSchema):
    total_requests: int
    approved: int
    rejected: int
    pending: int
    approval_rate_pct: float


class TopDiscountReason(StrictSchema):
    reason: str
    count: int
    total_amount: float


class DiscountReportResponse(BaseResponse):
    from_date: str
    to_date: str
    summary: DiscountSummary
    by_type: list[DiscountByType]
    approval_stats: DiscountApprovalStats
    top_reasons: list[TopDiscountReason]
    total_complimentary_items: int
    total_complimentary_value: float


class DayBookEntry(StrictSchema):
    timestamp: str
    entry_type: str
    reference_number: str
    description: str
    debit: float
    credit: float
    running_balance: float


class DayBookResponse(BaseResponse):
    date: str
    opening_cash: float
    total_sales: float
    total_returns: float
    total_cash_in: float
    total_cash_out: float
    total_stock_intake_cost: float
    closing_balance: float
    entries: list[DayBookEntry]


class AbandonedCartStatsResponse(BaseResponse):
    from_date: str
    to_date: str
    total_abandoned: int
    total_converted: int
    conversion_rate_pct: float
    total_abandoned_value: float
    total_converted_value: float
    avg_cart_value: float


class LoyaltyReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_points_earned: int
    total_points_redeemed: int
    net_outstanding_points: int
    total_customers_with_points: int
    avg_points_per_customer: float
    redemption_rate_pct: float


class SupplierSpendRow(StrictSchema):
    supplier_id: str | None
    supplier_name: str
    total_intakes: int
    total_quantity: float
    total_spend: float
    avg_unit_cost: float
    share_pct: float


class SupplierSpendResponse(BaseResponse):
    from_date: str
    to_date: str
    total_spend: float
    total_suppliers: int
    suppliers: list[SupplierSpendRow]
