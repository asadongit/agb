export type PaymentMode = "RAZORPAY_GATEWAY" | "PAY_AT_COUNTER" | "BOTH";
export type OrderStatus =
  | "PENDING"
  | "PENDING_VERIFICATION"
  | "PAID"
  | "PREPARING"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export interface Variant {
  id: string;
  name: string;
  price_delta: string;
  is_available: boolean;
}

export type PricingMode = "WEIGHT_BASED" | "FIXED_UNIT";

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  is_available: boolean;
  is_on_offer?: boolean;
  offer_price?: string | null;
  offer_label?: string | null;
  pricing_mode?: PricingMode;
  unit_label?: string;
  variants: Variant[];
}

export interface Category {
  id: string;
  name: string;
  display_order: number;
  items: MenuItem[];
}

export interface PublicMenuResponse {
  restaurant_name: string;
  restaurant_slug: string;
  payment_mode: PaymentMode;
  logo_url?: string | null;
  categories: Category[];
}

export interface CartItem {
  cartItemId: string; // unique ID for item + variant combo
  menuItem: MenuItem;
  selectedVariant?: Variant | null;
  quantity: number;
  unitPrice: number; // base price + variant delta
}

export interface OrderItemResponse {
  id: string;
  menu_item_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price: string;
}

export interface OrderResponse {
  id: string;
  restaurant_id: string;
  table_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  total_amount: string;
  status: OrderStatus;
  payment_reference?: string | null;
  source?: string;
  is_auto_verified?: boolean;
  created_at: string;
  updated_at: string;
  items: OrderItemResponse[];
}

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

export interface StartSessionResponse {
  session_id: string;
  customer_name: string;
  table_number: string;
  is_returning: boolean;
  active_orders: OrderResponse[];
  expires_at: string;
  session_duration_minutes: number;
}

export interface SessionStatusResponse {
  session_id: string;
  customer_name: string;
  table_number: string;
  is_active: boolean;
  status: SessionStatus;
  expires_at: string;
  session_duration_minutes: number;
  orders: OrderResponse[];
}

export interface ExtendSessionResponse {
  session_id: string;
  expires_at: string;
  session_duration_minutes: number;
}

export interface AbandonCartItem {
  menu_item_id: string;
  variant_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  pricing_mode?: string | null;
  unit_label?: string | null;
}

export interface AbandonedCart {
  id: string;
  restaurant_id: string;
  session_id: string;
  table_number: string;
  customer_name: string;
  customer_phone?: string | null;
  items: AbandonCartItem[];
  total_estimate: number;
  status: "ABANDONED" | "CONVERTED";
  converted_order_id?: string | null;
  created_at: string;
}

export interface ActiveSession {
  id: string;
  table_number: string;
  customer_name: string;
  customer_phone?: string | null;
  status: SessionStatus;
  expires_at: string;
  created_at: string;
  order_count: number;
}

export interface CustomerHistoryResponse {
  customer_name: string;
  customer_phone: string;
  past_orders: OrderResponse[];
}

// ── Inventory types ─────────────────────────────────────────────────────

export type InventoryUnit = "kg" | "g" | "l" | "ml" | "pcs";
export type StockChangeType = "intake" | "auto_deduction" | "manual_adjustment" | "restock";

export interface InventoryItem {
  id: string;
  restaurant_id: string;
  name: string;
  unit: InventoryUnit;
  category: string;
  current_stock: string;
  reorder_threshold: string;
  cost_per_unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockIntake {
  id: string;
  restaurant_id: string;
  item_id: string;
  quantity: string;
  remaining_quantity?: string;
  unit_cost: string;
  supplier_name?: string | null;
  intake_date: string;
  expiry_date?: string | null;
  added_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface BatchExpiryAlert {
  intake_id: string;
  item_id: string;
  item_name: string;
  unit: InventoryUnit;
  remaining_quantity: string;
  expiry_date: string;
  days_until_expiry: number;
  status: "EXPIRED" | "EXPIRING_SOON";
}

export interface RecipeIngredient {
  id?: string;
  menu_item_id?: string;
  inventory_item_id: string;
  inventory_item_name?: string | null;
  quantity_required: string;
  unit: InventoryUnit;
}

export interface StockLedgerEntry {
  id: string;
  restaurant_id: string;
  item_id: string;
  item_name?: string | null;
  unit?: InventoryUnit | null;
  change_type: StockChangeType;
  quantity_change: string;
  resulting_stock: string;
  reference_order_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface StockLedgerPage {
  items: StockLedgerEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── Staff Management types ─────────────────────────────────────────────

export type StaffRole =
  | "SUPERADMIN"
  | "RESTAURANT_ADMIN"
  | "MANAGER"
  | "FLOOR_STAFF"
  | "CASHIER"
  | "WAITER"
  | "DELIVERY_BOY"
  | "STAFF";

export interface StaffMember {
  id: string;
  restaurant_id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: StaffRole;
  status: "active" | "inactive";
  has_pin: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermissions {
  can_manage_staff: boolean;
  can_manage_billing: boolean;
  can_edit_menu: boolean;
  can_manage_inventory: boolean;
  can_cancel_orders: boolean;
  can_process_payments: boolean;
  can_manage_orders: boolean;
  can_view_analytics: boolean;
  allowed_sidebar_tabs: string[];
}

export interface StaffAuditEntry {
  id: string;
  staff_id?: string | null;
  staff_name?: string | null;
  restaurant_id: string;
  action_type: string;
  reference_type?: string | null;
  reference_id?: string | null;
  details?: string | null;
  created_at: string;
}

export interface StaffAuditLogPage {
  items: StaffAuditEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── Analytics types ────────────────────────────────────────────────────

export interface AnalyticsKpiSummary {
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  profit_margin_pct: number;
  cogs: number;
  net_profit: number;
  prev_total_revenue: number;
  prev_total_orders: number;
  prev_avg_order_value: number;
  prev_profit_margin_pct: number;
  revenue_change_pct: number;
  orders_change_pct: number;
  aov_change_pct: number;
  margin_change_pct: number;
}

export interface RevenueBucket {
  bucket: string;
  revenue: number;
  orders_count: number;
  prev_period_revenue?: number | null;
}

export interface RevenueAnalytics {
  granularity: "hourly" | "daily" | "weekly" | "monthly";
  from_date: string;
  to_date: string;
  buckets: RevenueBucket[];
}

export interface PeakHourBucket {
  hour: number;
  hour_label: string;
  orders_count: number;
}

export interface PeakHoursAnalytics {
  from_date: string;
  to_date: string;
  buckets: PeakHourBucket[];
}

export interface TopItemAnalytics {
  menu_item_id?: string | null;
  name: string;
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

export interface FunnelStage {
  stage: string;
  stage_label: string;
  count: number;
  percentage: number;
}

export interface FunnelAnalytics {
  from_date: string;
  to_date: string;
  total_orders: number;
  stages: FunnelStage[];
  conversion_rate_pct: number;
  cancellation_rate_pct: number;
}

export interface ProfitBucket {
  bucket: string;
  revenue: number;
  cogs: number;
  profit: number;
  margin_pct: number;
}

export interface ProfitMarginAnalytics {
  granularity: "hourly" | "daily" | "weekly" | "monthly";
  from_date: string;
  to_date: string;
  total_revenue: number;
  total_cogs: number;
  total_profit: number;
  overall_margin_pct: number;
  buckets: ProfitBucket[];
}

// ── Billing & POS types ────────────────────────────────────────────────

export interface ManualBillItem {
  id: string;
  menu_item_id?: string | null;
  variant_id?: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  is_complimentary: boolean;
  line_total: number;
}

export interface ManualBill {
  id: string;
  restaurant_id: string;
  table_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  status: string;
  source: string;
  subtotal_amount: number;
  total_amount: number;
  discount_type?: "PERCENT" | "FLAT" | "COMPLIMENTARY" | null;
  discount_value?: number | null;
  discount_reason?: string | null;
  discount_status?: "NONE" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | null;
  payment_method?: "CASH" | "UPI" | "RAZORPAY" | null;
  created_by_staff_id?: string | null;
  created_at: string;
  finalized_at?: string | null;
  paid_at?: string | null;
  items: ManualBillItem[];
}

export interface DiscountApproval {
  id: string;
  order_id: string;
  requested_by_id: string;
  requested_by_name?: string | null;
  approved_by_id?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  discount_type: string;
  discount_value: number;
  reason_note: string;
  created_at: string;
  order_table_number: string;
  order_total_amount: number;
}
