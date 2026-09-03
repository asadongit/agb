import { components } from "@repo/api-client";


export type PaymentMode = "RAZORPAY_GATEWAY" | "PAY_AT_COUNTER" | "BOTH";

export type OrderStatus =
  | "PENDING"
  | "PENDING_VERIFICATION"
  | "PAID"
  | "PAYMENT_PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type Variant = components["schemas"]["VariantResponse"];

export type PricingMode = "WEIGHT_BASED" | "FIXED_UNIT";

export type MenuItem = components["schemas"]["MenuItemResponse"];

export type Category = components["schemas"]["CategoryResponse"] & {
  items?: MenuItem[];
};

export type OutletInfoResponse = components["schemas"]["OutletInfoResponse"];

export type Outlet = OutletInfoResponse;

export interface PublicMenuResponse {
  outlet_name: string;
  outlet_slug: string;
  payment_mode: PaymentMode;
  logo_url?: string | null;
  evening_price_active?: boolean;
  categories: Category[];
}

export interface CartItem {
  cartItemId: string; // unique ID for item + variant combo
  menuItem: MenuItem;
  selectedVariant?: Variant | null;
  quantity: number;
  unitPrice: number; // base price + variant delta
}

export type OrderItemResponse = components["schemas"]["OrderItemResponse"];

export type OrderResponse = components["schemas"]["OrderResponse"];

export interface RazorpayCheckoutResponse {
  order_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface UPICheckoutResponse {
  order_id: string;
  upi_deep_link: string;
  total_amount: string;
}

// ── Session types ───────────────────────────────────────────────────────

export type SessionStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "TERMINATED";

export type StartSessionResponse = components["schemas"]["StartSessionResponse"];

export type SessionStatusResponse = components["schemas"]["SessionStatusResponse"];

export type ExtendSessionResponse = components["schemas"]["ExtendSessionResponse"];

export interface AbandonCartItem {
  menu_item_id: string;
  variant_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  pricing_mode?: string | null;
  unit_label?: string | null;
}

export type AbandonedCart = components["schemas"]["AbandonedCartResponse"];

export type ActiveSession = components["schemas"]["ActiveSessionResponse"];

export type CustomerHistoryResponse = components["schemas"]["CustomerHistoryResponse"];

// ── Inventory types ─────────────────────────────────────────────────────

export type InventoryUnit = "kg" | "g" | "l" | "ml" | "pcs";
export type StockChangeType =
  | "INTAKE"
  | "AUTO_DEDUCTION"
  | "MANUAL_ADJUSTMENT"
  | "RESTOCK"
  | "PURCHASE_RETURN"
  | "VOID_BATCH"
  | "intake"
  | "auto_deduction"
  | "manual_adjustment"
  | "restock"
  | "purchase_return"
  | "void_batch";

export type WastageReason =
  | "SPOILED_EXPIRED"
  | "DAMAGED_TRANSIT"
  | "AUDIT_CORRECTION"
  | "THEFT_LOST"
  | "OTHER";

export type InventoryItem = components["schemas"]["InventoryItemResponse"];

export type Customer = components["schemas"]["CustomerResponse"];

export type StockIntake = components["schemas"]["StockIntakeResponse"];

export type BatchDetail = components["schemas"]["BatchDetailResponse"];

export interface PurchaseReturn {
  id: string;
  return_number: string;
  outlet_id: string;
  intake_id?: string | null;
  item_id: string;
  item_name?: string | null;
  supplier_name: string;
  batch_number?: string | null;
  quantity: number | string;
  unit_cost: number | string;
  total_refund_amount: number | string;
  reason: string;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

export type ScanLookupResponse = components["schemas"]["ScanLookupResponse"];

export type BatchExpiryAlert = components["schemas"]["BatchExpiryAlertResponse"];

export type RecipeIngredient = components["schemas"]["RecipeIngredientResponse"];

export type StockLedgerEntry = components["schemas"]["StockLedgerResponse"];

export type StockLedgerPage = components["schemas"]["StockLedgerPageResponse"];

// ── Staff Management types ─────────────────────────────────────────────

export type StaffRole =
  | "SUPERADMIN"
  | "OUTLET_ADMIN"
  | "MANAGER"
  | "FLOOR_STAFF"
  | "CASHIER"
  | "WAITER"
  | "DELIVERY_BOY"
  | "STAFF";

export type StaffMember = components["schemas"]["StaffResponse"];

export type RolePermissions = components["schemas"]["RolePermissions"];

export type StaffAuditEntry = components["schemas"]["StaffAuditLogResponse"];

export type StaffAuditLogPage = components["schemas"]["StaffAuditLogPageResponse"];

// ── Analytics types ────────────────────────────────────────────────────

export type AnalyticsKpiSummary = components["schemas"]["KpiSummaryResponse"];

export type RevenueBucket = components["schemas"]["RevenueBucket"];

export type RevenueAnalytics = components["schemas"]["RevenueAnalyticsResponse"];

export type PeakHourBucket = components["schemas"]["PeakHourBucket"];

export interface PeakHoursAnalytics {
  from_date: string;
  to_date: string;
  buckets: PeakHourBucket[];
}

export interface TopItemAnalytics {
  menu_item_id?: string | null;
  name: string;
  category_name?: string | null;
  quantity_sold: number;
  revenue: number;
  revenue_share_pct: number;
}

export interface TopItemsAnalytics {
  from_date: string;
  to_date: string;
  sort_by: "quantity" | "revenue";
  items: TopItemAnalytics[];
}

export type FunnelStage = components["schemas"]["FunnelStage"];

export interface FunnelAnalytics {
  from_date: string;
  to_date: string;
  total_orders: number;
  stages: FunnelStage[];
  conversion_rate_pct: number;
  cancellation_rate_pct: number;
}

export type ProfitBucket = components["schemas"]["ProfitBucket"];

export interface ProfitMarginAnalytics {
  granularity: string;
  from_date: string;
  to_date: string;
  total_revenue: number;
  total_cogs: number;
  total_profit: number;
  overall_margin_pct: number;
  buckets: ProfitBucket[];
}

// ── Billing & POS types ────────────────────────────────────────────────

export type ManualBillItem = components["schemas"]["BillItemResponse"];

export type ManualBill = components["schemas"]["BillResponse"];

export type DiscountApproval = components["schemas"]["DiscountApprovalResponse"];

export type StaffAddItemInput = components["schemas"]["StaffAddItemInput"];

export type StaffAddItemsResponse = components["schemas"]["StaffAddItemsResponse"];

export type Supplier = components["schemas"]["SupplierResponse"];

export type CategorySalesItem = components["schemas"]["CategorySalesItem"];
export type CategorySalesResponse = components["schemas"]["CategorySalesResponse"];

export type ItemSalesRow = components["schemas"]["ItemSalesRow"];
export type ItemSalesResponse = components["schemas"]["ItemSalesResponse"];

export type BillProfitRow = components["schemas"]["BillProfitRow"];
export type BillProfitResponse = components["schemas"]["BillProfitResponse"];

export type AovBucket = components["schemas"]["AovBucket"];
export type AovByPaymentMethod = components["schemas"]["AovByPaymentMethod"];
export type AovAnalyticsResponse = components["schemas"]["AovAnalyticsResponse"];

export type StockIntakeRow = components["schemas"]["StockIntakeRow"];
export type StockIntakeReportResponse = components["schemas"]["StockIntakeReportResponse"];

export type WastageRow = components["schemas"]["WastageRow"];
export type WastageReportResponse = components["schemas"]["WastageReportResponse"];

export type StockMovementRow = components["schemas"]["StockMovementRow"];
export type StockMovementResponse = components["schemas"]["StockMovementResponse"];

export type PurchaseReturnRow = components["schemas"]["PurchaseReturnRow"];
export type PurchaseReturnReportResponse = components["schemas"]["PurchaseReturnReportResponse"];

export type NewCustomerBucket = components["schemas"]["NewCustomerBucket"];
export type NewCustomerReportResponse = components["schemas"]["NewCustomerReportResponse"];

export type CustomerReturnRow = components["schemas"]["CustomerReturnRow"];
export type TopReturnedItem = components["schemas"]["TopReturnedItem"];
export type CustomerReturnReportResponse = components["schemas"]["CustomerReturnReportResponse"];

export type DenominationBreakdown = components["schemas"]["DenominationBreakdown"];
export type CashFlowByType = components["schemas"]["CashFlowByType"];
export type CashDenominationResponse = components["schemas"]["CashDenominationResponse"];

export type PaymentMixRow = components["schemas"]["PaymentMixRow"];
export type PaymentMixResponse = components["schemas"]["PaymentMixResponse"];

export type TaxSlabRow = components["schemas"]["TaxSlabRow"];
export type TaxSummaryResponse = components["schemas"]["TaxSummaryResponse"];

export type DiscountSummary = components["schemas"]["DiscountSummary"];
export type DiscountByType = components["schemas"]["DiscountByType"];
export type DiscountApprovalStats = components["schemas"]["DiscountApprovalStats"];
export type TopDiscountReason = components["schemas"]["TopDiscountReason"];
export type DiscountReportResponse = components["schemas"]["DiscountReportResponse"];

export type DayBookEntry = components["schemas"]["DayBookEntry"];
export type DayBookResponse = components["schemas"]["DayBookResponse"];

export type AbandonedCartStatsResponse = components["schemas"]["AbandonedCartStatsResponse"];

export type LoyaltyReportResponse = components["schemas"]["LoyaltyReportResponse"];

export type SupplierSpendRow = components["schemas"]["SupplierSpendRow"];
export type SupplierSpendResponse = components["schemas"]["SupplierSpendResponse"];

// Enums for UI
export type AnalyticsMainTab =
  | "dashboard"
  | "sales"
  | "inventory"
  | "customers"
  | "financial"
  | "day_book";

export type SalesSubTab =
  | "master_view"
  | "category"
  | "item"
  | "aov"
  | "payment_mix"
  | "discount";

export type InventorySubTab =
  | "master_view"
  | "stock_movement"
  | "intake"
  | "wastage"
  | "purchase_returns"
  | "supplier_spend";

export type CustomersSubTab =
  | "master_view"
  | "new_customers"
  | "returns"
  | "loyalty"
  | "abandoned_carts";

export type FinancialSubTab =
  | "master_view"
  | "profit_margin"
  | "bill_profit"
  | "tax_summary"
  | "cash_denominations";


export type DatePreset = "today" | "yesterday" | "last_7" | "last_30" | "this_month" | "last_month" | "custom";

export type ProfitMarginResponse = components["schemas"]["ProfitMarginResponse"];
