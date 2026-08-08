"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Calendar,
  ClipboardList,
  CheckCircle2,
  ShoppingBag as OrdersIcon,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  FilterX,
  Flame,
  Gift,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Menu as MenuIcon,
  Minus,
  Moon,
  Pencil,
  Percent,
  PieChart,
  Plus,
  Printer,
  QrCode,
  Radio,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Sun,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { getApiBaseUrl, parseUTCDate } from "@/lib/api";
import { generateAnalyticsPdfReport, generateReceiptPDF } from "@/lib/pdfGenerator";
import type {
  AbandonedCart,
  ActiveSession,
  AnalyticsKpiSummary,
  DiscountApproval,
  FunnelAnalytics,
  InventoryItem,
  InventoryUnit,
  ManualBill,
  BatchExpiryAlert,
  ManualBillItem,
  OrderStatus,
  PaymentMode,
  PeakHoursAnalytics,
  ProfitMarginAnalytics,
  RecipeIngredient,
  RevenueAnalytics,
  RolePermissions,
  StockChangeType,
  StockIntake,
  StockLedgerEntry,
  StockLedgerPage,
  StaffAuditEntry,
  StaffMember,
  StaffRole,
  TopItemsAnalytics,
} from "@/types";

type AdminOrderItem = {
  id: string;
  menu_item_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price: string;
};

type AdminOrder = {
  id: string;
  restaurant_id: string;
  table_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  total_amount: string;
  status: OrderStatus;
  payment_reference?: string | null;
  payment_method?: string | null;
  source?: string;
  is_auto_verified?: boolean;
  created_at: string;
  updated_at: string;
  items: AdminOrderItem[];
};

type AdminCategory = {
  id: string;
  name: string;
  display_order: number;
};

type AdminMenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  is_available: boolean;
  is_on_offer?: boolean;
  offer_price?: string | null;
  offer_label?: string | null;
  pricing_mode?: "WEIGHT_BASED" | "FIXED_UNIT";
  unit_label?: string;
  created_at: string;
  updated_at: string;
};

type AdminVariant = {
  id: string;
  menu_item_id: string;
  name: string;
  price_delta: string;
  is_available: boolean;
};

type RestaurantProfile = {
  id: string;
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  razorpay_account_id?: string | null;
  direct_upi_id?: string | null;
  raw_upi_payload?: string | null;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  fssai_no?: string | null;
  session_duration_minutes?: number | null;
  verification_amount_cutoff?: string | number | null;
  created_at: string;
  updated_at: string;
};

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
};

type CategoryFormState = {
  name: string;
  display_order: string;
};

type MenuItemFormState = {
  category_id: string;
  name: string;
  description: string;
  price: string;
  image_url: string;
  is_available: boolean;
  pricing_mode: "WEIGHT_BASED" | "FIXED_UNIT";
  unit_label: string;
};

type VariantFormState = {
  name: string;
  price_delta: string;
  is_available: boolean;
};

type RestaurantFormState = {
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  razorpay_account_id: string;
  direct_upi_id: string;
  raw_upi_payload: string;
  logo_url: string;
  address: string;
  phone: string;
  gstin: string;
  fssai_no: string;
  session_duration_minutes: number;
  verification_amount_cutoff: string;
  flagged_item_ids: string[];
};

type RegisterFormState = {
  email: string;
  password: string;
  restaurant_id: string;
  role: "STAFF" | "RESTAURANT_ADMIN";
};

const ACCESS_TOKEN_KEY = "owner_admin_access_token";
const REFRESH_TOKEN_KEY = "owner_admin_refresh_token";

const lanes: OrderStatus[] = [
  "PENDING_VERIFICATION",
  "PAID",
  "COMPLETED",
  "CANCELLED",
];

const LANE_NAMES: Record<OrderStatus, string> = {
  PENDING: "Awaiting Payment",
  PENDING_VERIFICATION: "Confirmation Pending",
  PAID: "Payment Pending / Paid",
  PAYMENT_PENDING: "Payment Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatRupees(value: string | number): string {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isNaN(numeric) ? `₹${value}` : money.format(numeric);
}

function formatDateTime(value: string): string {
  const parsed = parseUTCDate(value);
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : "Request failed. Please try again.";
    throw new Error(detail);
  }

  return payload as T;
}

export default function AdminDashboardPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Read stored token safely on mount to prevent SSR hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      const storedToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
      if (storedToken) {
        setAccessToken(storedToken);
      }
    }
  }, []);

  // Navigation tab: "orders" | "menu" | "staff" | "inventory" | "settings" | "qrcodes"
  const [activeTab, setActiveTab] = useState<"orders" | "menu" | "staff" | "inventory" | "settings" | "qrcodes">("orders");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [adminTheme, setAdminTheme] = useState<"light" | "dark">("light");

  // Inventory State
  const [inventorySubTab, setInventorySubTab] = useState<"overview" | "intake" | "master" | "recipes" | "ledger">("overview");
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<InventoryItem[]>([]);
  const [nearExpiryAlerts, setNearExpiryAlerts] = useState<BatchExpiryAlert[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);

  // Ingredient Master Form
  const [inventoryForm, setInventoryForm] = useState({
    name: "",
    unit: "pcs" as InventoryUnit,
    category: "General",
    current_stock: "0",
    reorder_threshold: "0",
    cost_per_unit: "0",
  });
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [isSavingInventoryItem, setIsSavingInventoryItem] = useState(false);

  // Stock Intake Form
  const [intakeForm, setIntakeForm] = useState({
    item_id: "",
    quantity: "1",
    unit_cost: "0",
    supplier_name: "",
    expiry_date: "",
    notes: "",
  });
  const [isSavingIntake, setIsSavingIntake] = useState(false);

  // Recipe Builder State
  const [selectedRecipeMenuItemId, setSelectedRecipeMenuItemId] = useState<string>("");
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Stock Ledger State
  const [ledgerPageData, setLedgerPageData] = useState<StockLedgerPage | null>(null);
  const [ledgerFilterItemId, setLedgerFilterItemId] = useState<string>("ALL");
  const [ledgerFilterChangeType, setLedgerFilterChangeType] = useState<string>("ALL");
  const [ledgerCurrentPage, setLedgerCurrentPage] = useState<number>(1);

  // Staff Management State
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [activeStaff, setActiveStaff] = useState<StaffMember | null>(null);
  const [staffPermissions, setStaffPermissions] = useState<RolePermissions | null>(null);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  // Staff Form (Create / Edit)
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffFormState, setStaffFormState] = useState({
    name: "",
    email: "",
    phone: "",
    role: "STAFF" as StaffRole,
    password: "",
    pin: "",
  });
  const [isSavingStaff, setIsSavingStaff] = useState(false);

  // PIN Setup Modal
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinTargetStaff, setPinTargetStaff] = useState<StaffMember | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [isSavingPin, setIsSavingPin] = useState(false);

  // PIN Quick-Switch Modal (Lock-screen staff picker)
  const [pinSwitchModalOpen, setPinSwitchModalOpen] = useState(false);
  const [pinSwitchStaffId, setPinSwitchStaffId] = useState("");
  const [pinSwitchInput, setPinSwitchInput] = useState("");
  const [isSwitchingPin, setIsSwitchingPin] = useState(false);

  // Staff Audit Log State
  const [staffAuditLogs, setStaffAuditLogs] = useState<StaffAuditEntry[]>([]);

  // Sales & Analytics State
  const [analyticsGranularity, setAnalyticsGranularity] = useState<"hourly" | "daily" | "weekly" | "monthly">("daily");
  const [analyticsDatePreset, setAnalyticsDatePreset] = useState<"7d" | "30d" | "this_month" | "custom">("30d");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [drilldownBucket, setDrilldownBucket] = useState<string | null>(null);
  const [topItemsSortBy, setTopItemsSortBy] = useState<"quantity" | "revenue">("revenue");
  const [topItemsViewMode, setTopItemsViewMode] = useState<"list" | "chart">("list");
  const [kpiData, setKpiData] = useState<AnalyticsKpiSummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueAnalytics | null>(null);
  const [peakHoursData, setPeakHoursData] = useState<PeakHoursAnalytics | null>(null);
  const [topItemsData, setTopItemsData] = useState<TopItemsAnalytics | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelAnalytics | null>(null);
  const [profitData, setProfitData] = useState<ProfitMarginAnalytics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [hoveredRevenuePoint, setHoveredRevenuePoint] = useState<{ bucket: string; revenue: number; orders: number } | null>(null);

  // Billing & POS State
  const [billsList, setBillsList] = useState<ManualBill[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<DiscountApproval[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [billingStatusFilter, setBillingStatusFilter] = useState<string>("ALL");
  const [billingSearchQuery, setBillingSearchQuery] = useState<string>("");

  // Create Bill Modal / Drawer State
  const [createBillModalOpen, setCreateBillModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState("WALK-IN");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [draftCartItems, setDraftCartItems] = useState<
    Array<{
      menu_item_id?: string;
      variant_id?: string;
      item_name: string;
      unit_price: number;
      quantity: number;
      is_complimentary: boolean;
    }>
  >([]);

  // Apply Discount Modal State
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountTargetBill, setDiscountTargetBill] = useState<ManualBill | null>(null);
  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT" | "COMPLIMENTARY">("PERCENT");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");

  // Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTargetBill, setPaymentTargetBill] = useState<ManualBill | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"CASH" | "UPI">("CASH");
  const [cashTendered, setCashTendered] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = (localStorage.getItem("app_theme") as "light" | "dark") || "light";
      setAdminTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
      if (stored === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  const toggleAdminTheme = () => {
    const next = adminTheme === "light" ? "dark" : "light";
    setAdminTheme(next);
    localStorage.setItem("app_theme", next);
    document.documentElement.setAttribute("data-theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const [qrTableNumber, setQrTableNumber] = useState<string>("1");
  const [batchStart, setBatchStart] = useState<number>(1);
  const [batchEnd, setBatchEnd] = useState<number>(10);

  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([]);
  const [variantsByItem, setVariantsByItem] = useState<Record<string, AdminVariant[]>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Forms
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    name: "",
    display_order: "0",
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const [menuItemForm, setMenuItemForm] = useState<MenuItemFormState>({
    category_id: "",
    name: "",
    description: "",
    price: "",
    image_url: "",
    is_available: true,
    pricing_mode: "FIXED_UNIT",
    unit_label: "piece",
  });
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [isSavingMenuItem, setIsSavingMenuItem] = useState(false);
  const [isUploadingMenuItemImage, setIsUploadingMenuItemImage] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [busyMenuItemId, setBusyMenuItemId] = useState<string | null>(null);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [itemSearchQuery, setItemSearchQuery] = useState<string>("");
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState<boolean>(false);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory =
        selectedCategoryFilter === "ALL" || item.category_id === selectedCategoryFilter;
      const matchesSearch =
        !itemSearchQuery.trim() ||
        item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(itemSearchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, selectedCategoryFilter, itemSearchQuery]);

  const [selectedVariantItemId, setSelectedVariantItemId] = useState<string>("");
  const [variantForm, setVariantForm] = useState<VariantFormState>({
    name: "",
    price_delta: "0",
    is_available: true,
  });
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [isSavingVariant, setIsSavingVariant] = useState(false);
  const [isVariantModalOpen, setIsVariantModalOpen] = useState<boolean>(false);

  // Offer Modal State
  const [selectedOfferItemId, setSelectedOfferItemId] = useState<string | null>(null);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState<boolean>(false);
  const [offerForm, setOfferForm] = useState<{
    is_on_offer: boolean;
    offer_price: string;
    offer_label: string;
  }>({
    is_on_offer: false,
    offer_price: "",
    offer_label: "",
  });
  const [isSavingOffer, setIsSavingOffer] = useState<boolean>(false);

  const [restaurantForm, setRestaurantForm] = useState<RestaurantFormState>({
    name: "",
    slug: "",
    payment_mode: "PAY_AT_COUNTER",
    razorpay_account_id: "",
    direct_upi_id: "",
    raw_upi_payload: "",
    logo_url: "",
    address: "",
    phone: "",
    gstin: "",
    fssai_no: "",
    session_duration_minutes: 30,
    verification_amount_cutoff: "",
    flagged_item_ids: [],
  });
  const [isSavingRestaurant, setIsSavingRestaurant] = useState(false);

  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    email: "",
    password: "",
    restaurant_id: "",
    role: "STAFF",
  });

  // Basket Sessions & Abandoned Carts State
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [abandonedCartCount, setAbandonedCartCount] = useState(0);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isLoadingCarts, setIsLoadingCarts] = useState(false);
  const [showAbandonedCartsPanel, setShowAbandonedCartsPanel] = useState(false);

  // WebSocket State
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const wsPingRef = useRef<NodeJS.Timeout | null>(null);
  const wsReconnectRef = useRef<NodeJS.Timeout | null>(null);

  const authHeaders = useMemo(() => {
    if (!accessToken) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        setAccessToken(null);
        return null;
      }

      const data = (await response.json()) as LoginResponse;
      setAccessToken(data.access_token);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      return data.access_token;
    } catch {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      setAccessToken(null);
      return null;
    }
  }, []);

  const apiRequest = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (!authHeaders) throw new Error("Please sign in first.");

      const apiBase = getApiBaseUrl();
      let response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          ...authHeaders,
          ...(options?.headers || {}),
        },
      });

      if (response.status === 401) {
        const newAccessToken = await tryRefreshToken();
        if (newAccessToken) {
          response = await fetch(`${apiBase}${path}`, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAccessToken}`,
              ...(options?.headers || {}),
            },
          });
        }
      }

      return parseApiResponse<T>(response);
    },
    [authHeaders, tryRefreshToken]
  );

  const loadVariants = useCallback(
    async (itemId: string) => {
      try {
        const data = await apiRequest<AdminVariant[]>(
          `/api/admin/menu-items/${itemId}/variants`
        );
        setVariantsByItem((current) => ({
          ...current,
          [itemId]: data,
        }));
      } catch (variantError) {
        const message =
          variantError instanceof Error
            ? variantError.message
            : "Unable to fetch item variants.";
        setError(message);
      }
    },
    [apiRequest]
  );

  const loadInventoryData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoadingInventory(true);
    try {
      const [items, alerts, expiryAlerts] = await Promise.all([
        apiRequest<InventoryItem[]>("/api/admin/inventory/items"),
        apiRequest<InventoryItem[]>("/api/admin/inventory/alerts"),
        apiRequest<BatchExpiryAlert[]>("/api/admin/inventory/near-expiry-alerts?threshold_days=7"),
      ]);
      setInventoryItems(items);
      setLowStockAlerts(alerts);
      setNearExpiryAlerts(expiryAlerts);
      if (items.length > 0 && !intakeForm.item_id) {
        setIntakeForm((prev) => ({ ...prev, item_id: items[0].id }));
      }
    } catch (err) {
      console.error("Inventory fetch error:", err);
    } finally {
      setIsLoadingInventory(false);
    }
  }, [apiRequest, authHeaders, intakeForm.item_id]);

  const loadLedgerData = useCallback(
    async (page = 1, itemId = "ALL", changeType = "ALL") => {
      if (!authHeaders) return;
      try {
        let query = `/api/admin/inventory/ledger?page=${page}&page_size=20`;
        if (itemId !== "ALL") query += `&item_id=${itemId}`;
        if (changeType !== "ALL") query += `&change_type=${changeType}`;
        const pageRes = await apiRequest<StockLedgerPage>(query);
        setLedgerPageData(pageRes);
      } catch (err) {
        console.error("Ledger fetch error:", err);
      }
    },
    [apiRequest, authHeaders]
  );

  const loadRecipeForMenuItem = useCallback(
    async (menuItemId: string) => {
      if (!authHeaders || !menuItemId) return;
      setIsLoadingRecipe(true);
      try {
        const recipeList = await apiRequest<RecipeIngredient[]>(
          `/api/admin/inventory/recipes/${menuItemId}`
        );
        setRecipeIngredients(recipeList);
      } catch (err) {
        console.error("Recipe fetch error:", err);
        setRecipeIngredients([]);
      } finally {
        setIsLoadingRecipe(false);
      }
    },
    [apiRequest, authHeaders]
  );

  const loadStaffMembers = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoadingStaff(true);
    try {
      const data = await apiRequest<StaffMember[]>("/api/staff");
      setStaffList(data);
      if (data.length > 0 && !pinSwitchStaffId) {
        setPinSwitchStaffId(data[0].id);
      }
    } catch (err) {
      console.error("Staff fetch error:", err);
    } finally {
      setIsLoadingStaff(false);
    }
  }, [apiRequest, authHeaders, pinSwitchStaffId]);

  const loadStaffPermissions = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const perms = await apiRequest<RolePermissions>("/api/staff/permissions");
      setStaffPermissions(perms);
    } catch (err) {
      console.error("Permissions fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

  const loadStaffAuditLogs = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const logRes = await apiRequest<{ items: StaffAuditEntry[] }>("/api/staff/audit-log");
      setStaffAuditLogs(logRes.items || []);
    } catch (err) {
      console.error("Staff audit log fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

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

  const loadBillingData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoadingBilling(true);
    try {
      const [billsRes, approvalsRes, countRes] = await Promise.all([
        apiRequest<ManualBill[]>("/api/billing/bills"),
        apiRequest<DiscountApproval[]>("/api/billing/pending-approvals"),
        apiRequest<{ count: number }>("/api/billing/pending-approvals-count"),
      ]);
      setBillsList(billsRes || []);
      setPendingApprovals(approvalsRes || []);
      setPendingApprovalsCount(countRes?.count || 0);
    } catch (err) {
      console.error("Billing fetch error:", err);
    } finally {
      setIsLoadingBilling(false);
    }
  }, [apiRequest, authHeaders]);

  const handleCreateBill = async () => {
    if (!draftCartItems.length) {
      setError("Please add at least one menu item to the bill.");
      return;
    }
    try {
      await apiRequest<ManualBill>("/api/billing/bills", {
        method: "POST",
        body: JSON.stringify({
          table_number: selectedTable || "WALK-IN",
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          items: draftCartItems.map((item) => ({
            menu_item_id: item.menu_item_id || null,
            variant_id: item.variant_id || null,
            quantity: item.quantity,
            is_complimentary: item.is_complimentary,
          })),
        }),
      });
      setCreateBillModalOpen(false);
      setDraftCartItems([]);
      setCustomerName("");
      setCustomerPhone("");
      setNotice("Manual bill created successfully!");
      void loadBillingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create manual bill.");
    }
  };

  const handleApplyDiscount = async () => {
    if (!discountTargetBill) return;
    if (!discountReason || discountReason.trim().length < 2) {
      setError("Please provide a reason note for the discount.");
      return;
    }
    try {
      const res = await apiRequest<ManualBill>(`/api/billing/bills/${discountTargetBill.id}/apply-discount`, {
        method: "POST",
        body: JSON.stringify({
          discount_type: discountType,
          discount_value: discountValue,
          reason_note: discountReason,
        }),
      });
      setDiscountModalOpen(false);
      setDiscountTargetBill(null);
      setDiscountReason("");
      if (res.discount_status === "PENDING_APPROVAL") {
        setNotice("Discount requested! Flagged for Manager Approval.");
      } else {
        setNotice("Discount applied and approved!");
      }
      void loadBillingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply discount.");
    }
  };

  const handleResolveApproval = async (approvalId: string, approve: boolean) => {
    try {
      await apiRequest(`/api/billing/approvals/${approvalId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      });
      setNotice(`Discount approval ${approve ? "APPROVED" : "REJECTED"}.`);
      void loadBillingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve approval.");
    }
  };

  const handleMarkPaid = async () => {
    if (!paymentTargetBill) return;
    try {
      await apiRequest<ManualBill>(`/api/billing/bills/${paymentTargetBill.id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          payment_method: selectedPaymentMethod,
        }),
      });
      setPaymentModalOpen(false);
      setPaymentTargetBill(null);
      setCashTendered("");
      setNotice(`Bill #${paymentTargetBill.id.slice(0, 8).toUpperCase()} marked as PAID via ${selectedPaymentMethod}! Stock auto-deducted.`);
      void loadBillingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark bill paid.");
    }
  };

  const loadDashboard = useCallback(async () => {
    if (!authHeaders) return;

    setIsLoading(true);
    setError(null);

    try {
      const [restData, ordersData, catData, itemsData] = await Promise.all([
        apiRequest<RestaurantProfile>("/api/admin/restaurants/me"),
        apiRequest<AdminOrder[]>("/api/admin/orders"),
        apiRequest<AdminCategory[]>("/api/admin/categories"),
        apiRequest<AdminMenuItem[]>("/api/admin/menu-items"),
      ]);

      setRestaurant(restData);
      setOrders(ordersData);
      setCategories(catData);
      setMenuItems(itemsData);

      setRestaurantForm({
        name: restData.name,
        slug: restData.slug,
        payment_mode: restData.payment_mode,
        razorpay_account_id: restData.razorpay_account_id || "",
        direct_upi_id: restData.direct_upi_id || "",
        raw_upi_payload: restData.raw_upi_payload || "",
        logo_url: (restData as any).logo_url || "",
        address: (restData as any).address || "",
        phone: (restData as any).phone || "",
        gstin: (restData as any).gstin || "",
        fssai_no: (restData as any).fssai_no || "",
        session_duration_minutes: (restData as any).session_duration_minutes ?? 30,
        verification_amount_cutoff: (restData as any).verification_amount_cutoff != null ? String((restData as any).verification_amount_cutoff) : "",
        flagged_item_ids: (restData as any).flagged_item_ids || [],
      });

      if (catData.length && !menuItemForm.category_id) {
        setMenuItemForm((prev) => ({
          ...prev,
          category_id: catData[0].id,
        }));
      }

      if (itemsData.length) {
        if (!selectedVariantItemId) {
          setSelectedVariantItemId(itemsData[0].id);
        }
        // Fetch variants for All Products
        const variantPromises = itemsData.map((item) =>
          apiRequest<AdminVariant[]>(`/api/admin/menu-items/${item.id}/variants`).catch(() => [])
        );
        const variantsResults = await Promise.all(variantPromises);
        const variantMap: Record<string, AdminVariant[]> = {};
        itemsData.forEach((item, index) => {
          variantMap[item.id] = variantsResults[index] || [];
        });
        setVariantsByItem(variantMap);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load dashboard right now.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, authHeaders, menuItemForm.category_id, selectedVariantItemId]);

  useEffect(() => {
    if (!accessToken) return;
    const timer = window.setTimeout(() => {
      void loadDashboard();
      void loadInventoryData();
      void loadStaffMembers();
      void loadStaffPermissions();
      void loadStaffAuditLogs();
      void loadAnalyticsData();
      void loadBillingData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessToken, loadDashboard, loadInventoryData, loadStaffMembers, loadStaffPermissions, loadStaffAuditLogs, loadAnalyticsData, loadBillingData]);

  useEffect(() => {
    if (!selectedVariantItemId) return;
    const timer = window.setTimeout(() => {
      void loadVariants(selectedVariantItemId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedVariantItemId, loadVariants]);

  // Clear page-contextual error & notice notifications on tab navigation
  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [activeTab]);

  // ── Basket Sessions & Abandoned Carts ──────────────────────────────────
  const fetchAbandonedCartCount = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<{ count: number }>("/api/admin/sessions/abandoned-carts/count");
      setAbandonedCartCount(data.count);
    } catch { /* ignore */ }
  }, [accessToken]);

  const fetchAbandonedCarts = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingCarts(true);
    try {
      const data = await apiRequest<AbandonedCart[]>("/api/admin/sessions/abandoned-carts");
      setAbandonedCarts(data);
    } catch { /* ignore */ }
    setIsLoadingCarts(false);
  }, [accessToken]);

  const fetchActiveSessions = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<ActiveSession[]>("/api/admin/sessions");
      setActiveSessions(data);
    } catch { /* ignore */ }
  }, [accessToken]);

  const terminateSession = useCallback(async (sessionId: string, reason?: string) => {
    if (!accessToken) return;
    try {
      await apiRequest(`/api/admin/sessions/${sessionId}/terminate`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || null }),
      });
      setNotice("Session terminated.");
      void fetchActiveSessions();
      void fetchAbandonedCartCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to terminate session");
    }
  }, [accessToken, fetchActiveSessions, fetchAbandonedCartCount]);

  const convertAbandonedCart = useCallback(async (cartId: string) => {
    if (!accessToken) return;
    try {
      await apiRequest(`/api/admin/sessions/abandoned-carts/${cartId}/convert`, {
        method: "POST",
      });
      setNotice("Abandoned cart converted to a manual bill.");
      void fetchAbandonedCarts();
      void fetchAbandonedCartCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert cart");
    }
  }, [accessToken, fetchAbandonedCarts, fetchAbandonedCartCount]);

  // Auto-fetch abandoned cart count on mount + refresh every 60s
  useEffect(() => {
    if (!accessToken || !restaurant) return;
    void fetchAbandonedCartCount();
    const interval = setInterval(() => {
      void fetchAbandonedCartCount();
    }, 60_000);
    return () => clearInterval(interval);
  }, [accessToken, restaurant, fetchAbandonedCartCount]);

  // Fetch full lists when panel opens
  useEffect(() => {
    if (showAbandonedCartsPanel) {
      void fetchAbandonedCarts();
      void fetchActiveSessions();
    }
  }, [showAbandonedCartsPanel, fetchAbandonedCarts, fetchActiveSessions]);

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
        `${wsBaseUrl}/ws/kitchen/${restaurant.id}?ticket=${ticket}`
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
          if (
            message.event === "NEW_ORDER_PAID" ||
            message.event === "VERIFICATION_NEEDED" ||
            message.event === "SESSION_CHANGED"
          ) {
            void loadDashboard();
          } else if (message.event === "ORDER_STATUS_CHANGED" && message.data) {
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
  }, [accessToken, restaurant, loadDashboard]);

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

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticating(true);
    setError(null);
    setNotice(null);

    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseApiResponse<LoginResponse>(response);

      if (data.role === "SUPERADMIN") {
        setError("Superadmin accounts cannot access the Outlet dashboard. Please use the Superadmin Console at /superadmin.");
        return;
      }

      setAccessToken(data.access_token);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      setNotice("Signed in successfully.");
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in right now.";
      setError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const onLogout = async () => {
    try {
      if (accessToken) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch {
      // Ignore
    }

    setAccessToken(null);
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    setRestaurant(null);
    setOrders([]);
    setCategories([]);
    setMenuItems([]);
    setNotice("Signed out.");
  };

  const onRegisterStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsRegistering(true);
    setError(null);
    setNotice(null);

    try {
      await apiRequest<{ message: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: registerForm.email.trim(),
          password: registerForm.password,
          role: "STAFF",
        }),
      });

      setNotice(`Staff account created for '${registerForm.email}'. They can now sign in at /admin.`);
      setRegisterForm({ email: "", password: "", restaurant_id: "", role: "STAFF" });
    } catch (registerError) {
      const message =
        registerError instanceof Error
          ? registerError.message
          : "Unable to register staff member.";
      setError(message);
    } finally {
      setIsRegistering(false);
    }
  };

  const onSubmitInventoryItem = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingInventoryItem(true);
    setError(null);

    try {
      const payload = {
        name: inventoryForm.name.trim(),
        unit: inventoryForm.unit,
        category: inventoryForm.category.trim() || "General",
        current_stock: parseFloat(inventoryForm.current_stock) || 0,
        reorder_threshold: parseFloat(inventoryForm.reorder_threshold) || 0,
        cost_per_unit: parseFloat(inventoryForm.cost_per_unit) || 0,
      };

      if (editingInventoryId) {
        const updated = await apiRequest<InventoryItem>(
          `/api/admin/inventory/items/${editingInventoryId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );
        setNotice(`Ingredient "${updated.name}" updated.`);
      } else {
        const created = await apiRequest<InventoryItem>(
          "/api/admin/inventory/items",
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        setNotice(`Ingredient "${created.name}" created.`);
      }

      setInventoryForm({
        name: "",
        unit: "pcs",
        category: "General",
        current_stock: "0",
        reorder_threshold: "0",
        cost_per_unit: "0",
      });
      setEditingInventoryId(null);
      void loadInventoryData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save inventory item.");
    } finally {
      setIsSavingInventoryItem(false);
    }
  };

  const onSubmitStockIntake = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!intakeForm.item_id) {
      setError("Please select an ingredient for stock intake.");
      return;
    }
    setIsSavingIntake(true);
    setError(null);

    try {
      const payload = {
        item_id: intakeForm.item_id,
        quantity: parseFloat(intakeForm.quantity) || 1,
        unit_cost: parseFloat(intakeForm.unit_cost) || 0,
        supplier_name: intakeForm.supplier_name.trim() || null,
        expiry_date: intakeForm.expiry_date ? new Date(intakeForm.expiry_date).toISOString() : null,
        notes: intakeForm.notes.trim() || null,
      };

      await apiRequest<StockIntake>("/api/admin/inventory/intake", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setNotice("Stock intake recorded successfully!");
      setIntakeForm((prev) => ({
        ...prev,
        quantity: "1",
        unit_cost: "0",
        supplier_name: "",
        expiry_date: "",
        notes: "",
      }));
      void loadInventoryData();
      void loadLedgerData(1, ledgerFilterItemId, ledgerFilterChangeType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record stock intake.");
    } finally {
      setIsSavingIntake(false);
    }
  };

  const onDeleteInventoryItem = async (id: string, name: string) => {
    if (!window.confirm(`Remove ingredient "${name}" from inventory?`)) return;
    setError(null);
    try {
      await apiRequest<void>(`/api/admin/inventory/items/${id}`, {
        method: "DELETE",
      });
      setNotice(`Ingredient "${name}" removed.`);
      void loadInventoryData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ingredient.");
    }
  };

  const onSubmitRecipe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedRecipeMenuItemId) {
      setError("Please select a dish to attach recipe ingredients.");
      return;
    }
    setIsSavingRecipe(true);
    setError(null);

    try {
      const payload = {
        menu_item_id: selectedRecipeMenuItemId,
        ingredients: recipeIngredients.map((ing) => ({
          inventory_item_id: ing.inventory_item_id,
          quantity_required: parseFloat(ing.quantity_required) || 0,
          unit: ing.unit,
        })),
      };

      await apiRequest<RecipeIngredient[]>("/api/admin/inventory/recipes", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setNotice("Dish recipe mapping saved!");
      void loadRecipeForMenuItem(selectedRecipeMenuItemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipe mapping.");
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const onSubmitStaffMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingStaff(true);
    setError(null);

    try {
      if (editingStaffId) {
        const payload = {
          name: staffFormState.name.trim(),
          email: staffFormState.email.trim(),
          phone: staffFormState.phone.trim() || null,
          role: staffFormState.role,
        };
        const updated = await apiRequest<StaffMember>(`/api/staff/${editingStaffId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice(`Staff member "${updated.name}" updated.`);
      } else {
        const payload = {
          name: staffFormState.name.trim(),
          email: staffFormState.email.trim(),
          phone: staffFormState.phone.trim() || null,
          role: staffFormState.role,
          password: staffFormState.password,
          pin: staffFormState.pin.trim() || null,
        };
        const created = await apiRequest<StaffMember>("/api/staff", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice(`Staff member "${created.name}" created.`);
      }

      setStaffModalOpen(false);
      setEditingStaffId(null);
      setStaffFormState({ name: "", email: "", phone: "", role: "WAITER", password: "", pin: "" });
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save staff member.");
    } finally {
      setIsSavingStaff(false);
    }
  };

  const onDeactivateStaffMember = async (id: string, name: string) => {
    if (!window.confirm(`Deactivate staff member "${name}"?`)) return;
    setError(null);
    try {
      await apiRequest<void>(`/api/staff/${id}`, { method: "DELETE" });
      setNotice(`Staff member "${name}" deactivated.`);
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate staff.");
    }
  };

  const onSubmitSetStaffPin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pinTargetStaff) return;
    setIsSavingPin(true);
    setError(null);

    try {
      await apiRequest<void>(`/api/staff/${pinTargetStaff.id}/set-pin`, {
        method: "POST",
        body: JSON.stringify({ pin: pinInput }),
      });
      setNotice(`PIN updated for "${pinTargetStaff.name}".`);
      setPinModalOpen(false);
      setPinTargetStaff(null);
      setPinInput("");
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set PIN.");
    } finally {
      setIsSavingPin(false);
    }
  };

  const onSubmitPinQuickSwitch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pinSwitchStaffId) {
      setError("Please select a staff member.");
      return;
    }
    setIsSwitchingPin(true);
    setError(null);

    try {
      const res = await apiRequest<{ staff_context_token: string; active_staff: StaffMember }>(
        "/api/staff/pin-switch",
        {
          method: "POST",
          body: JSON.stringify({ staff_id: pinSwitchStaffId, pin: pinSwitchInput }),
        }
      );

      setActiveStaff(res.active_staff);
      setNotice(`Switched active staff to ${res.active_staff.name} (${res.active_staff.role})`);
      setPinSwitchModalOpen(false);
      setPinSwitchInput("");
      void loadStaffPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid staff PIN.");
    } finally {
      setIsSwitchingPin(false);
    }
  };

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

  const onConfirmPayment = async (orderId: string) => {
    setError(null);
    try {
      const updated = await apiRequest<AdminOrder>(
        `/api/admin/orders/${orderId}/confirm-payment`,
        { method: "POST" }
      );
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? updated : o))
      );
      setNotice(`Payment verified for Order #${orderId.slice(0, 8)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment confirmation failed.");
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

  const onRefundOrder = async (orderId: string) => {
    setError(null);
    try {
      const updated = await apiRequest<AdminOrder>(
        `/api/admin/orders/${orderId}/refund`,
        { method: "POST" }
      );
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? updated : o))
      );
      setNotice(`Order #${orderId.slice(0, 8)} refunded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed.");
    }
  };

  // Category Actions
  const onSubmitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingCategory(true);
    setError(null);

    try {
      const payload = {
        name: categoryForm.name.trim(),
        display_order: Number(categoryForm.display_order) || 0,
      };

      if (editingCategoryId) {
        const updated = await apiRequest<AdminCategory>(
          `/api/admin/categories/${editingCategoryId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setCategories((current) =>
          current.map((cat) => (cat.id === editingCategoryId ? updated : cat))
        );
        setNotice(`Category "${updated.name}" updated.`);
      } else {
        const created = await apiRequest<AdminCategory>(
          "/api/admin/categories",
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        setCategories((current) => [...current, created]);
        setNotice(`Category "${created.name}" created.`);
      }

      setCategoryForm({ name: "", display_order: "0" });
      setEditingCategoryId(null);
    } catch (catError) {
      setError(
        catError instanceof Error ? catError.message : "Unable to save category."
      );
    } finally {
      setIsSavingCategory(false);
    }
  };

  const onDeleteCategory = async (id: string) => {
    if (!window.confirm("Delete this category? Items inside may be affected.")) return;
    setError(null);

    try {
      await apiRequest<void>(`/api/admin/categories/${id}`, {
        method: "DELETE",
      });
      setCategories((current) => current.filter((cat) => cat.id !== id));
      setNotice("Category removed.");
    } catch (catError) {
      setError(
        catError instanceof Error ? catError.message : "Unable to delete category."
      );
    }
  };

  // Menu Item Actions
  const onSubmitMenuItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingMenuItem(true);
    setError(null);

    try {
      const payload = {
        category_id: menuItemForm.category_id,
        name: menuItemForm.name.trim(),
        description: menuItemForm.description.trim() || null,
        price: menuItemForm.price,
        image_url: menuItemForm.image_url.trim() || null,
        is_available: menuItemForm.is_available,
        pricing_mode: menuItemForm.pricing_mode,
        unit_label: menuItemForm.unit_label.trim() || "piece",
      };

      if (editingMenuItemId) {
        const updated = await apiRequest<AdminMenuItem>(
          `/api/admin/menu-items/${editingMenuItemId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setMenuItems((current) =>
          current.map((item) => (item.id === editingMenuItemId ? updated : item))
        );
        setNotice(`Product "${updated.name}" updated.`);
      } else {
        const created = await apiRequest<AdminMenuItem>(
          "/api/admin/menu-items",
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        setMenuItems((current) => [created, ...current]);
        setSelectedVariantItemId(created.id);
        setNotice(`Product "${created.name}" created.`);
      }

      setMenuItemForm({
        category_id: categories.length ? categories[0].id : "",
        name: "",
        description: "",
        price: "",
        image_url: "",
        is_available: true,
        pricing_mode: "FIXED_UNIT",
        unit_label: "piece",
      });
      setEditingMenuItemId(null);
    } catch (itemError) {
      setError(
        itemError instanceof Error ? itemError.message : "Unable to save product."
      );
    } finally {
      setIsSavingMenuItem(false);
    }
  };

  const onToggleMenuItemAvailable = async (item: AdminMenuItem) => {
    setBusyMenuItemId(item.id);
    setError(null);

    try {
      const updated = await apiRequest<AdminMenuItem>(
        `/api/admin/menu-items/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_available: !item.is_available }),
        }
      );
      setMenuItems((current) =>
        current.map((curr) => (curr.id === item.id ? updated : curr))
      );
      setNotice(
        `${updated.name} is now ${updated.is_available ? "available" : "86'd"}.`
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Unable to update item."
      );
    } finally {
      setBusyMenuItemId(null);
    }
  };

  const onDeleteMenuItem = async (id: string) => {
    if (!window.confirm("Delete this menu item?")) return;
    setError(null);

    try {
      await apiRequest<void>(`/api/admin/menu-items/${id}`, {
        method: "DELETE",
      });
      setMenuItems((current) => current.filter((item) => item.id !== id));
      setNotice("Menu item deleted.");
    } catch (itemError) {
      setError(
        itemError instanceof Error ? itemError.message : "Unable to delete item."
      );
    }
  };

  // Variant Actions
  const onSubmitVariant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedVariantItemId) {
      setError("Choose a menu item before adding variants.");
      return;
    }

    setIsSavingVariant(true);
    setError(null);

    try {
      const payload = {
        name: variantForm.name.trim(),
        price_delta: variantForm.price_delta,
        is_available: variantForm.is_available,
      };

      if (editingVariantId) {
        const updated = await apiRequest<AdminVariant>(
          `/api/admin/menu-items/${selectedVariantItemId}/variants/${editingVariantId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setVariantsByItem((current) => ({
          ...current,
          [selectedVariantItemId]: (current[selectedVariantItemId] || []).map(
            (v) => (v.id === editingVariantId ? updated : v)
          ),
        }));
        setNotice(`Variant "${updated.name}" updated.`);
      } else {
        const created = await apiRequest<AdminVariant>(
          `/api/admin/menu-items/${selectedVariantItemId}/variants`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        setVariantsByItem((current) => ({
          ...current,
          [selectedVariantItemId]: [
            ...(current[selectedVariantItemId] || []),
            created,
          ],
        }));
        setNotice(`Variant "${created.name}" created.`);
      }

      setVariantForm({ name: "", price_delta: "0", is_available: true });
      setEditingVariantId(null);
    } catch (variantError) {
      setError(
        variantError instanceof Error
          ? variantError.message
          : "Unable to save variant."
      );
    } finally {
      setIsSavingVariant(false);
    }
  };

  const onDeleteVariant = async (variantId: string) => {
    if (!selectedVariantItemId) return;
    if (!window.confirm("Delete this variant?")) return;
    setError(null);

    try {
      await apiRequest<void>(
        `/api/admin/menu-items/${selectedVariantItemId}/variants/${variantId}`,
        { method: "DELETE" }
      );
      setVariantsByItem((current) => ({
        ...current,
        [selectedVariantItemId]: (current[selectedVariantItemId] || []).filter(
          (v) => v.id !== variantId
        ),
      }));
      setNotice("Variant deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete variant.");
    }
  };

  const onToggleVariantAvailable = async (variant: AdminVariant) => {
    if (!selectedVariantItemId) return;
    try {
      const updated = await apiRequest<AdminVariant>(
        `/api/admin/menu-items/${selectedVariantItemId}/variants/${variant.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_available: !variant.is_available }),
        }
      );
      setVariantsByItem((current) => ({
        ...current,
        [selectedVariantItemId]: (current[selectedVariantItemId] || []).map((v) =>
          v.id === variant.id ? updated : v
        ),
      }));
      setNotice(
        `Variant "${updated.name}" is now ${updated.is_available ? "available" : "disabled"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update variant.");
    }
  };

  // Offer Actions
  const openOfferModal = (item: AdminMenuItem) => {
    setSelectedOfferItemId(item.id);
    setOfferForm({
      is_on_offer: item.is_on_offer || false,
      offer_price: item.offer_price || "",
      offer_label: item.offer_label || "",
    });
    setIsOfferModalOpen(true);
  };

  const onSubmitOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOfferItemId) return;

    setIsSavingOffer(true);
    setError(null);

    try {
      const payload = {
        is_on_offer: offerForm.is_on_offer,
        offer_price: offerForm.is_on_offer && offerForm.offer_price.trim() ? offerForm.offer_price.trim() : null,
        offer_label: offerForm.is_on_offer && offerForm.offer_label.trim() ? offerForm.offer_label.trim() : null,
      };

      const updated = await apiRequest<AdminMenuItem>(
        `/api/admin/menu-items/${selectedOfferItemId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      setMenuItems((current) =>
        current.map((item) => (item.id === selectedOfferItemId ? updated : item))
      );
      setNotice(
        `Offer status updated for "${updated.name}" (${updated.is_on_offer ? "Offer Active" : "Offer Disabled"}).`
      );
      setIsOfferModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save offer settings.");
    } finally {
      setIsSavingOffer(false);
    }
  };

  // Restaurant Profile Settings
  const onSubmitRestaurantSettings = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setIsSavingRestaurant(true);
    setError(null);

    try {
      const payload = {
        name: restaurantForm.name.trim(),
        slug: restaurantForm.slug.trim(),
        payment_mode: restaurantForm.payment_mode,
        razorpay_account_id: restaurantForm.razorpay_account_id.trim() || null,
        direct_upi_id: restaurantForm.direct_upi_id.trim() || null,
        raw_upi_payload: restaurantForm.raw_upi_payload.trim() || null,
        logo_url: restaurantForm.logo_url.trim() || null,
        address: restaurantForm.address.trim() || null,
        phone: restaurantForm.phone.trim() || null,
        gstin: restaurantForm.gstin.trim() || null,
        fssai_no: restaurantForm.fssai_no.trim() || null,
        session_duration_minutes: restaurantForm.session_duration_minutes,
        verification_amount_cutoff: restaurantForm.verification_amount_cutoff.trim() ? parseFloat(restaurantForm.verification_amount_cutoff) : null,
        flagged_item_ids: restaurantForm.flagged_item_ids,
      };

      const updated = await apiRequest<RestaurantProfile>(
        "/api/admin/restaurants/me",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      setRestaurant(updated);
      setNotice("Outlet configuration updated.");
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Unable to update outlet settings."
      );
    } finally {
      setIsSavingRestaurant(false);
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

  // Wait until mounted on client before rendering to prevent SSR hydration mismatch
  if (!isMounted) return null;

  // ── Pre-auth: Sign In ──────────────────────────────────────────────
  if (!accessToken) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] px-4 py-14 sm:px-6 flex items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
              <Store className="h-6 w-6" />
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Outlet Operations Login</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Manage live basket orders, Products, and outlet settings
            </p>
          </div>

          <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-[0_10px_35px_rgba(18,38,58,0.1)]">
            <form className="space-y-4" onSubmit={onLogin}>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm"
                  placeholder="admin@outlet.com"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm"
                  placeholder="Minimum 8 characters"
                />
              </label>
              <button
                type="submit"
                disabled={isAuthenticating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isAuthenticating ? "Signing in..." : "Sign in to Outlet"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {error && (
              <p className="mt-4 rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-800">
                {error}
              </p>
            )}
            {notice && (
              <p className="mt-4 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
                {notice}
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ── Post-auth: Modern Sidebar Dashboard Layout ──────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-[var(--accent-brand)]" />
          <span className="font-display font-bold text-base truncate max-w-[180px]">
            {restaurant?.name || "Dashboard"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Left Sidebar Navigation (Desktop Fixed / Mobile Drawer) */}
      <aside
        className={`${isMobileMenuOpen ? "block" : "hidden"
          } md:flex flex-col w-full md:w-64 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] sticky top-0 md:h-screen z-30 shrink-0`}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex items-start gap-3">
            {restaurant?.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt={restaurant.name}
                className="h-10 w-10 shrink-0 rounded-xl object-cover border border-[var(--border-subtle)]"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)] font-bold">
                <Store className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2
                className="font-display font-bold text-sm text-[var(--text-primary)] leading-snug break-words"
                title={restaurant?.name || "My Outlet"}
              >
                {restaurant?.name || "My Outlet"}
              </h2>
              {restaurant?.slug && (
                <p
                  className="font-mono text-[11px] text-[var(--accent-brand)] truncate mt-0.5"
                  title={`/${restaurant.slug}`}
                >
                  /{restaurant.slug}
                </p>
              )}
            </div>
          </div>

          {/* Active Staff Indicator & PIN Quick-Switch Button */}
          <div className="flex items-center justify-between rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] p-2 text-xs">
            <div className="flex items-center gap-2 truncate">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-bold">
                {activeStaff ? activeStaff.name[0].toUpperCase() : "A"}
              </div>
              <div className="truncate">
                <p className="font-bold truncate text-[var(--text-primary)]">
                  {activeStaff ? activeStaff.name : "Admin Session"}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] font-mono uppercase">
                  {activeStaff ? activeStaff.role : "OWNER / ADMIN"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadStaffMembers();
                setPinSwitchModalOpen(true);
              }}
              className="p-1.5 rounded-lg bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition shrink-0"
              title="Quick-Switch Staff PIN"
            >
              <KeyRound className="h-4 w-4" />
            </button>
          </div>

          {/* WebSocket Status Pill & Theme Toggle */}
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${wsStatus === "connected"
                ? "bg-emerald-100 text-emerald-800"
                : wsStatus === "connecting"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-rose-100 text-rose-800"
                }`}
            >
              {wsStatus === "connected" ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : wsStatus === "connecting" ? (
                <Radio className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              {wsStatus === "connected" ? "Live Feed" : wsStatus === "connecting" ? "Connecting" : "Offline"}
            </span>

            <button
              type="button"
              onClick={toggleAdminTheme}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
              title={`Switch to ${adminTheme === "light" ? "dark" : "light"} mode`}
            >
              {adminTheme === "light" ? (
                <Moon className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span>{adminTheme === "light" ? "Dark" : "Light"}</span>
            </button>
          </div>
        </div>

        {/* Sidebar Nav Links */}
        <nav className="p-3 space-y-1.5 flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab("orders");
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "orders"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <div className="flex items-center gap-3">
              <OrdersIcon className="h-4 w-4" />
              <span>Live Orders</span>
            </div>
            {kpis.pendingVerification > 0 && (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
                {kpis.pendingVerification}
              </span>
            )}
          </button>

          {(!staffPermissions || staffPermissions.can_manage_billing) && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("billing" as any);
                setIsMobileMenuOpen(false);
                void loadBillingData();
              }}
              className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                activeTab === ("billing" as any)
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Receipt className="h-4 w-4" />
                <span>Billing &amp; POS</span>
              </div>
              {pendingApprovalsCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab("menu");
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "menu"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Product Catalog</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("staff");
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "staff"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <Users className="h-4 w-4" />
            <span>Staff &amp; Team</span>
          </button>

          {(!staffPermissions || staffPermissions.can_view_analytics) && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("analytics" as any);
                setIsMobileMenuOpen(false);
                void loadAnalyticsData();
              }}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                activeTab === ("analytics" as any)
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>Sales &amp; Analytics</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab("inventory");
              setIsMobileMenuOpen(false);
              void loadInventoryData();
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "inventory"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <div className="flex items-center gap-3">
              <Boxes className="h-4 w-4" />
              <span>Inventory</span>
            </div>
            {lowStockAlerts.length > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-2xs">
                {lowStockAlerts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("qrcodes");
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "qrcodes"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <QrCode className="h-4 w-4" />
            <span>QR Code Generator</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("settings");
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "settings"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <Settings2 className="h-4 w-4" />
            <span>Outlet Settings</span>
          </button>

          {/* Abandoned Carts Badge */}
          <button
            type="button"
            onClick={() => setShowAbandonedCartsPanel(true)}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-4 w-4" />
              <span>Baskets & Carts</span>
            </div>
            {abandonedCartCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                {abandonedCartCount}
              </span>
            )}
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
          {restaurant?.slug && (
            <Link
              href={`/menu?slug=${restaurant.slug}`}
              target="_blank"
              className="flex items-center justify-between rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                View Public Menu
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            </Link>
          )}

          <button
            type="button"
            onClick={() => void onLogout()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-3.5 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-500/40 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Baskets & Abandoned Carts Panel (Slide-out Overlay) ── */}
      {showAbandonedCartsPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAbandonedCartsPanel(false)} />
          <div className="relative ml-auto w-full max-w-lg bg-[var(--bg-surface)] shadow-2xl border-l border-[var(--border-subtle)] flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-[var(--accent-brand)]" />
                <h2 className="font-display text-lg font-bold">Baskets & Carts</h2>
              </div>
              <button onClick={() => setShowAbandonedCartsPanel(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Active Sessions */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-emerald-500" />
                  Active Basket Sessions ({activeSessions.length})
                </h3>
                {activeSessions.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] italic">No active sessions right now.</p>
                ) : (
                  <div className="space-y-2">
                    {activeSessions.map((s) => {
                      const expiresIn = Math.max(0, Math.floor((parseUTCDate(s.expires_at).getTime() - Date.now()) / 60000));
                      return (
                        <div key={s.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="font-semibold text-sm">{s.customer_name}</span>
                              <span className="text-xs text-[var(--text-muted)]">• Basket {s.table_number}</span>
                            </div>
                            <span className="text-xs text-[var(--text-muted)]">{s.order_count} order{s.order_count !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--text-muted)]">
                              Expires in {expiresIn} min
                            </span>
                            <button
                              onClick={() => {
                                if (confirm(`Terminate session for ${s.customer_name}?`)) {
                                  void terminateSession(s.id);
                                }
                              }}
                              className="text-xs font-semibold text-rose-500 hover:text-rose-400 transition"
                            >
                              Terminate
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Abandoned Carts */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
                  <ShoppingBag className="h-3.5 w-3.5 text-amber-500" />
                  Abandoned Carts ({abandonedCarts.filter(c => c.status === "ABANDONED").length})
                </h3>
                {isLoadingCarts ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </div>
                ) : abandonedCarts.filter(c => c.status === "ABANDONED").length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] italic">No abandoned carts.</p>
                ) : (
                  <div className="space-y-2">
                    {abandonedCarts.filter(c => c.status === "ABANDONED").map((cart) => (
                      <div key={cart.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-sm">{cart.customer_name}</span>
                            <span className="text-xs text-[var(--text-muted)] ml-2">Basket {cart.table_number}</span>
                          </div>
                          <span className="text-xs text-[var(--text-muted)]">
                            {new Date(cart.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {(cart.items || []).length} item{(cart.items || []).length !== 1 ? "s" : ""} • ₹{cart.total_estimate.toFixed(2)}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                          {(cart.items || []).slice(0, 3).map((item, i) => (
                            <div key={i}>{item.name} × {item.quantity}</div>
                          ))}
                          {(cart.items || []).length > 3 && (
                            <div className="italic">+{(cart.items || []).length - 3} more...</div>
                          )}
                        </div>
                        <button
                          onClick={() => void convertAbandonedCart(cart.id)}
                          className="w-full rounded-lg bg-[var(--accent-brand)] px-3 py-1.5 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] transition"
                        >
                          Convert to Bill
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Previously Converted */}
              {abandonedCarts.filter(c => c.status === "CONVERTED").length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    Recently Converted ({abandonedCarts.filter(c => c.status === "CONVERTED").length})
                  </h3>
                  <div className="space-y-2">
                    {abandonedCarts.filter(c => c.status === "CONVERTED").map((cart) => (
                      <div key={cart.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 opacity-60">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{cart.customer_name}</span>
                          <span className="text-xs text-emerald-500 font-semibold">✓ Converted</span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          Basket {cart.table_number} • ₹{cart.total_estimate.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6">
        {/* Pending Discount Approvals Alert Banner */}
        {pendingApprovalsCount > 0 && (!staffPermissions || staffPermissions.can_manage_billing) && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2 shadow-xs">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>
                <strong>{pendingApprovalsCount}</strong> pending discount approval request{pendingApprovalsCount > 1 ? "s" : ""} requiring manager review.
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setActiveTab("billing" as any);
                void loadBillingData();
              }}
              className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-600 transition"
            >
              Review Approvals
            </button>
          </div>
        )}

        {/* Global Notices */}
        {notice && (
          <div className="rounded-xl border border-[var(--accent-brand)]/40 bg-[var(--bg-surface-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] flex items-center justify-between gap-2 shadow-xs">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-brand)] shrink-0" />
              <span>{notice}</span>
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              title="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-[var(--bg-surface-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] flex items-center justify-between gap-2 shadow-xs">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
              <span>{error}</span>
            </span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              title="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── TAB 1: LIVE ORDERS & basket board ──────────────────────── */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            {/* Header & KPI Summary */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">Live Service Board</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Shift-level basket order management and payment verification
                </p>
              </div>
            </div>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                    Open tickets
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.openOrders}</p>
              </article>
              <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                    Verification needed
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.pendingVerification}</p>
              </article>
              <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400" />
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                    Paid / Being verified
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.paidOrPreparing}</p>
              </article>
              <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" />
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                    Fulfillment rate
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.completionRate}%</p>
              </article>
            </section>

            {/* Kanban Live Order Board */}
            <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h2 className="font-display text-lg font-bold">Basket Columns</h2>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Total Orders: {orders.length}
                </p>
              </div>

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                {lanes.map((status) => {
                  const laneOrders = orders.filter((order) => {
                    if (status === "PAID") {
                      return order.status === "PAID" || order.status === "PAYMENT_PENDING";
                    }
                    return order.status === status;
                  });
                  return (
                    <section
                      key={status}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          {LANE_NAMES[status]}
                        </p>
                        <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                          {laneOrders.length}
                        </span>
                      </div>

                      {laneOrders.length === 0 ? (
                        <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                          No {LANE_NAMES[status].toLowerCase()} orders
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {laneOrders.map((order) => (
                            <article
                              key={order.id}
                              className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 shadow-2xs space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {order.is_auto_verified && (
                                    <span
                                      className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0 inline-block"
                                      title="Auto-verified by rule (skipped manual check)"
                                    />
                                  )}
                                  <p className="font-bold text-sm text-[var(--text-primary)]">
                                    Basket #{order.table_number}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const itemsMap: Record<string, { name: string }> = {};
                                      menuItems.forEach((m) => {
                                        itemsMap[m.id] = { name: m.name };
                                      });
                                      generateReceiptPDF(order, restaurant?.name || "ApnaGreen Basket", itemsMap);
                                    }}
                                    className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                                    title="Download Official Bill PDF"
                                  >
                                    <FileText className="h-3 w-3 text-emerald-500" />
                                    <span>PDF Bill</span>
                                  </button>
                                </div>
                                <p className="font-mono text-xs font-bold text-[var(--accent-brand)]">
                                  {formatRupees(order.total_amount)}
                                </p>
                              </div>

                              <p className="font-mono text-[11px] text-[var(--text-muted)]">
                                ID: {order.id.slice(0, 8)} · {formatDateTime(order.created_at)}
                              </p>

                              {order.customer_name && (
                                <p className="text-xs text-[var(--text-secondary)] font-medium">
                                  Customer: {order.customer_name}
                                </p>
                              )}

                              {order.items.length > 0 && (
                                <div className="border-t border-[var(--border-subtle)] pt-2 space-y-1">
                                  {order.items.map((item) => {
                                    const itemName = menuItems.find((m) => m.id === item.menu_item_id)?.name || "Product";
                                    return (
                                      <div key={item.id} className="flex justify-between text-xs text-[var(--text-secondary)]">
                                        <span>{item.quantity}× {itemName}</span>
                                        <span className="font-semibold">{formatRupees(item.unit_price)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Actions */}
                              <div className="border-t border-[var(--border-subtle)] pt-2 flex flex-wrap gap-1.5">
                                {order.status === "PENDING_VERIFICATION" && (
                                  order.payment_method === "RAZORPAY_GATEWAY" || Boolean(order.payment_reference) ? (
                                    <button
                                      type="button"
                                      onClick={() => void onUpdateOrderStatus(order.id, "COMPLETED")}
                                      className="w-full rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                                    >
                                      Verify &amp; Complete (Paid Online)
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void onUpdateOrderStatus(order.id, "PAYMENT_PENDING")}
                                      className="w-full rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                                    >
                                      Accept &amp; Verify (Payment Pending)
                                    </button>
                                  )
                                )}
                                {order.status === "PAID" && (
                                  <button
                                    type="button"
                                    onClick={() => void onUpdateOrderStatus(order.id, "COMPLETED")}
                                    className="w-full rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                                  >
                                    Verify &amp; Complete (Paid Online)
                                  </button>
                                )}
                                {order.status === "PAYMENT_PENDING" && (
                                  <button
                                    type="button"
                                    onClick={() => void onUpdateOrderStatus(order.id, "COMPLETED")}
                                    className="w-full rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                                  >
                                    Mark Paid &amp; Complete Basket
                                  </button>
                                )}
                                {order.status !== "COMPLETED" && order.status !== "CANCELLED" && order.status !== "REFUNDED" && (
                                  <button
                                    type="button"
                                    onClick={() => void onCancelOrder(order.id)}
                                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-500/40 transition"
                                  >
                                    Cancel Order
                                  </button>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ── TAB 2: Product Catalog Management ────────────────────────── */}
        {activeTab === "menu" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Product Catalog Management</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Create categories, manage Products, toggle availability, and set item variants
              </p>
            </div>

            {/* Layout: Main Highlight Menu Item Creator (Left) + Compact Category Area (Right) */}
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              {/* 1. MAIN HIGHLIGHT: MENU ITEM CREATOR FORM */}
              <article className="rounded-3xl border-2 border-[var(--accent-brand)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4 shadow-md">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold">
                        {editingMenuItemId ? "Edit Product" : "Create New Product"}
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)]">Add dishes directly to customer mobile catalog</p>
                    </div>
                  </div>
                  {editingMenuItemId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMenuItemId(null);
                        setMenuItemForm({
                          category_id: categories.length ? categories[0].id : "",
                          name: "",
                          description: "",
                          price: "",
                          image_url: "",
                          is_available: true,
                          pricing_mode: "FIXED_UNIT",
                          unit_label: "piece",
                        });
                      }}
                      className="text-xs text-[var(--text-muted)] hover:text-rose-600 font-semibold"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <form onSubmit={onSubmitMenuItem} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Category *</span>
                      <select
                        value={menuItemForm.category_id}
                        onChange={(e) =>
                          setMenuItemForm((prev) => ({ ...prev, category_id: e.target.value }))
                        }
                        required
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-semibold"
                      >
                        <option value="">Select Category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1 sm:col-span-2">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Product Name *</span>
                      <input
                        type="text"
                        value={menuItemForm.name}
                        onChange={(e) =>
                          setMenuItemForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                        required
                        placeholder="e.g. Alphonso Mango, Fresh Spinach, Cold Press Juice..."
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-semibold"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Price (₹) *</span>
                      <input
                        type="text"
                        value={menuItemForm.price}
                        onChange={(e) =>
                          setMenuItemForm((prev) => ({ ...prev, price: e.target.value }))
                        }
                        required
                        placeholder="80"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-mono font-bold text-[var(--accent-brand)]"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Pricing Mode</span>
                      <select
                        value={menuItemForm.pricing_mode}
                        onChange={(e) =>
                          setMenuItemForm((prev) => ({
                            ...prev,
                            pricing_mode: e.target.value as "WEIGHT_BASED" | "FIXED_UNIT",
                            unit_label: e.target.value === "WEIGHT_BASED" ? "kg" : "piece",
                          }))
                        }
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-semibold"
                      >
                        <option value="FIXED_UNIT">Fixed Unit (per piece/pack)</option>
                        <option value="WEIGHT_BASED">Weight Based (per kg/g)</option>
                      </select>
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Unit Label</span>
                      <input
                        type="text"
                        value={menuItemForm.unit_label}
                        onChange={(e) =>
                          setMenuItemForm((prev) => ({ ...prev, unit_label: e.target.value }))
                        }
                        placeholder={menuItemForm.pricing_mode === "WEIGHT_BASED" ? "kg" : "piece"}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-semibold"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block space-y-1 sm:col-span-3">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Description</span>
                      <input
                        type="text"
                        value={menuItemForm.description}
                        onChange={(e) =>
                          setMenuItemForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="Origin, variety, pack size, net weight..."
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm"
                      />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Product Image / Photo</span>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={menuItemForm.image_url}
                        onChange={(e) =>
                          setMenuItemForm((prev) => ({ ...prev, image_url: e.target.value }))
                        }
                        placeholder="Upload product image or paste URL..."
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm"
                      />
                      <label className={`shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-xs transition ${isUploadingMenuItemImage ? "bg-amber-600 opacity-80 pointer-events-none" : "bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)]"}`}>
                        {isUploadingMenuItemImage ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            <span>Upload Photo</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingMenuItemImage}
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsUploadingMenuItemImage(true);
                            const formData = new FormData();
                            formData.append("file", file);
                            try {
                              const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) || accessToken;
                              const apiBase = getApiBaseUrl();
                              const res = await fetch(`${apiBase}/api/upload/image`, {
                                method: "POST",
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                                body: formData,
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setMenuItemForm((prev) => ({ ...prev, image_url: data.url }));
                                setNotice("Photo uploaded successfully! Save item to publish.");
                              } else {
                                const errData = await res.json().catch(() => ({}));
                                setError(errData.detail || "Upload failed. Please try again.");
                              }
                            } catch (err) {
                              console.error("Upload error:", err);
                              setError("Upload failed. Please check network connection.");
                            } finally {
                              setIsUploadingMenuItemImage(false);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingMenuItem}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-3 text-sm font-bold text-[var(--text-on-accent)] shadow-md hover:bg-[var(--accent-brand-hover)] transition"
                  >
                    <Plus className="h-4 w-4" />
                    {isSavingMenuItem ? "Saving Product..." : editingMenuItemId ? "Update Product" : "+ Create & Publish Product"}
                  </button>
                </form>
              </article>

              {/* 2. COMPACT CATEGORY AREA */}
              <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 space-y-3 shadow-xs self-start">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-[var(--accent-brand)]" />
                    <h2 className="font-display text-sm font-bold">Categories ({categories.length})</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCategoryFormOpen(!isCategoryFormOpen)}
                    className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:border-[var(--accent-brand)] text-[var(--accent-brand)]"
                    title={isCategoryFormOpen ? "Close Form" : "Add Category"}
                  >
                    {isCategoryFormOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Collapsible Compact Category Add Form */}
                {isCategoryFormOpen && (
                  <form onSubmit={onSubmitCategory} className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3 space-y-2.5 animate-in fade-in duration-200">
                    <p className="text-xs font-bold text-[var(--accent-brand)]">
                      {editingCategoryId ? "Edit Category" : "New Category"}
                    </p>
                    <input
                      type="text"
                      value={categoryForm.name}
                      onChange={(e) =>
                        setCategoryForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      required
                      placeholder="Category Name"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={categoryForm.display_order}
                        onChange={(e) =>
                          setCategoryForm((prev) => ({ ...prev, display_order: e.target.value }))
                        }
                        placeholder="Order"
                        className="w-20 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono"
                      />
                      <button
                        type="submit"
                        disabled={isSavingCategory}
                        className="flex-1 rounded-xl bg-[var(--accent-brand)] px-3 py-1.5 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
                      >
                        {isSavingCategory ? "Saving..." : editingCategoryId ? "Update" : "Save"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Compact Category List */}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {categories.length === 0 ? (
                    <p className="text-center py-4 text-xs text-[var(--text-muted)]">No categories created yet.</p>
                  ) : (
                    categories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs hover:border-[var(--accent-brand)] transition"
                      >
                        <span className="font-semibold text-xs text-[var(--text-primary)] truncate max-w-[140px]">
                          {cat.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCategoryFormOpen(true);
                              setEditingCategoryId(cat.id);
                              setCategoryForm({ name: cat.name, display_order: String(cat.display_order) });
                            }}
                            className="p-1 rounded-md text-[var(--accent-brand)] hover:bg-[var(--bg-surface)]"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteCategory(cat.id)}
                            className="p-1 rounded-md text-rose-500 hover:bg-rose-100"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>

            {/* 3. Products LIST WITH CATEGORY FILTER PILLS & ALL VIEW */}
            <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
                <div>
                  <h2 className="font-display text-xl font-bold">
                    All Products ({filteredMenuItems.length} of {menuItems.length})
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">Instant 86&apos;d availability toggles and quick edits</p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    placeholder="Search dishes..."
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] pl-9 pr-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              {/* Category Filter Pills (ALL + Each Category) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter("ALL")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition shrink-0 ${selectedCategoryFilter === "ALL"
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                  All Items ({menuItems.length})
                </button>

                {categories.map((cat) => {
                  const count = menuItems.filter((i) => i.category_id === cat.id).length;
                  const isSelected = selectedCategoryFilter === cat.id;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryFilter(cat.id)}
                      className={`rounded-full px-4 py-1.5 text-xs font-bold transition shrink-0 ${isSelected
                        ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                        : "bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Products Grid */}
              {filteredMenuItems.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="text-sm font-semibold text-[var(--text-muted)]">No Products found.</p>
                  <p className="text-xs text-[var(--text-muted)]">Try selecting another category filter or add a new menu item above.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {filteredMenuItems.map((item) => {
                    const categoryName = categories.find((c) => c.id === item.category_id)?.name || "Unassigned";

                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3 flex flex-col justify-between hover:border-[var(--accent-brand)] transition"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-base text-[var(--text-primary)] leading-tight">{item.name}</h3>
                            <span className="font-mono text-sm font-bold text-[var(--accent-brand)] shrink-0">
                              {formatRupees(item.price)}
                            </span>
                          </div>
                          <span className="inline-block rounded-md bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)]">
                            {categoryName}
                          </span>
                          {item.description && (
                            <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{item.description}</p>
                          )}

                          {/* Active Offer Badge */}
                          {item.is_on_offer && item.offer_price && (
                            <div className="flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              <Flame className="h-3 w-3 text-amber-500" />
                              <span>Offer: ₹{item.offer_price} ({item.offer_label || 'Active'})</span>
                            </div>
                          )}

                          {/* Variants / Size Customizations Pill Badges */}
                          {variantsByItem[item.id] && variantsByItem[item.id].length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {variantsByItem[item.id].map((v) => (
                                <span
                                  key={v.id}
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold border ${v.is_available
                                      ? "border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]"
                                      : "border-gray-200 bg-gray-100 text-gray-400 line-through"
                                    }`}
                                >
                                  <span>{v.name}</span>
                                  <span className="font-bold">
                                    {parseFloat(v.price_delta) >= 0
                                      ? `+₹${parseFloat(v.price_delta).toFixed(0)}`
                                      : `-₹${Math.abs(parseFloat(v.price_delta)).toFixed(0)}`}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between border-t border-[var(--border-subtle)] pt-3 gap-2">
                          <button
                            type="button"
                            onClick={() => void onToggleMenuItemAvailable(item)}
                            disabled={busyMenuItemId === item.id}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition shrink-0 ${item.is_available
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                              }`}
                          >
                            {item.is_available ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                            {item.is_available ? "Available" : "86'd"}
                          </button>

                          <div className="flex items-center gap-1 flex-wrap shrink-0">
                            <button
                              type="button"
                              onClick={() => openOfferModal(item)}
                              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${item.is_on_offer
                                  ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-amber-500/40 hover:text-amber-500"
                                }`}
                              title="Manage Item Special Offer / Discount"
                            >
                              <Flame className="h-3.5 w-3.5" />
                              <span>{item.is_on_offer ? "Offer On" : "Set Offer"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVariantItemId(item.id);
                                setVariantForm({ name: "", price_delta: "0", is_available: true });
                                setEditingVariantId(null);
                                setIsVariantModalOpen(true);
                                void loadVariants(item.id);
                              }}
                              className="flex items-center gap-1 rounded-lg border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 px-2 py-1 text-[11px] font-bold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition"
                              title="Manage Sizes & Customizations"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              <span>Sizes ({(variantsByItem[item.id] || []).length})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMenuItemId(item.id);
                                setMenuItemForm({
                                  category_id: item.category_id,
                                  name: item.name,
                                  description: item.description || "",
                                  price: item.price,
                                  image_url: item.image_url || "",
                                  is_available: item.is_available,
                                  pricing_mode: item.pricing_mode || "FIXED_UNIT",
                                  unit_label: item.unit_label || "piece",
                                });
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--accent-brand)]"
                              title="Edit Item"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                            onClick={() => void onDeleteMenuItem(item.id)}
                              className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600"
                              title="Delete Item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          </div>
        )}

        {/* ── TAB: STAFF & TEAM MANAGEMENT ───────────────────────────── */}
        {activeTab === "staff" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">Staff &amp; Team Management</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Outlet roles, permissions, staff accounts, PIN setup, and action audit trail
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    void loadStaffMembers();
                    setPinSwitchModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 px-3.5 py-2 text-xs font-bold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>PIN Quick-Switch</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingStaffId(null);
                    setStaffFormState({ name: "", email: "", phone: "", role: "WAITER", password: "", pin: "" });
                    setStaffModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>+ Add Staff Member</span>
                </button>
              </div>
            </div>

            {/* Staff Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Staff</p>
                <p className="text-2xl font-black text-[var(--text-primary)]">{staffList.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Active Staff</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {staffList.filter((s) => s.status === "active").length}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 p-4 space-y-1 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent-brand)]">PIN Provisioned</p>
                <p className="text-2xl font-black text-[var(--accent-brand)]">
                  {staffList.filter((s) => s.has_pin).length}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Audit Log Entries</p>
                <p className="text-2xl font-black text-[var(--text-primary)]">{staffAuditLogs.length}</p>
              </div>
            </div>

            {/* Staff Master Table */}
            <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h2 className="font-display text-lg font-bold">Outlet Team Roster</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void loadStaffMembers()}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
                  title="Refresh Roster"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingStaff ? "animate-spin text-[var(--accent-brand)]" : ""}`} />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-3.5">Staff Member</th>
                      <th className="p-3.5">Contact</th>
                      <th className="p-3.5">Assigned Role</th>
                      <th className="p-3.5 text-center">PIN Status</th>
                      <th className="p-3.5 text-center">Account Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                    {staffList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                          No staff members found for this outlet. Click <strong>+ Add Staff Member</strong> to provision accounts.
                        </td>
                      </tr>
                    ) : (
                      staffList.map((member) => (
                        <tr key={member.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                          <td className="p-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-bold text-sm">
                                {member.name[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-[var(--text-primary)]">{member.name}</p>
                                <p className="text-[11px] text-[var(--text-muted)]">ID: {member.id.slice(0, 8)}</p>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 space-y-0.5">
                            <p className="font-mono text-[11px] text-[var(--text-primary)]">{member.email}</p>
                            {member.phone && <p className="font-mono text-[10px] text-[var(--text-muted)]">{member.phone}</p>}
                          </td>

                          <td className="p-3.5">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.role === "RESTAURANT_ADMIN" || member.role === "SUPERADMIN"
                              ? "bg-purple-100 text-purple-800"
                              : member.role === "MANAGER"
                                ? "bg-indigo-100 text-indigo-800"
                                : member.role === "FLOOR_STAFF"
                                  ? "bg-amber-100 text-amber-800"
                                  : member.role === "CASHIER"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-sky-100 text-sky-800"
                              }`}>
                              {member.role.replace("_", " ")}
                            </span>
                          </td>

                          <td className="p-3.5 text-center">
                            {member.has_pin ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" />
                                PIN Set
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
                                No PIN
                              </span>
                            )}
                          </td>

                          <td className="p-3.5 text-center">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              }`}>
                              {member.status}
                            </span>
                          </td>

                          <td className="p-3.5 text-right space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPinTargetStaff(member);
                                setPinInput("");
                                setPinModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)]"
                              title="Set 4-Digit PIN"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStaffId(member.id);
                                setStaffFormState({
                                  name: member.name,
                                  email: member.email,
                                  phone: member.phone || "",
                                  role: member.role,
                                  password: "",
                                  pin: "",
                                });
                                setStaffModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)]"
                              title="Edit Details"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeactivateStaffMember(member.id, member.name)}
                              className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600"
                              title="Deactivate Account"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            {/* Staff Audit Trail */}
            <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h2 className="font-display text-lg font-bold">Staff Action Audit Trail</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void loadStaffAuditLogs()}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-3.5">Timestamp</th>
                      <th className="p-3.5">Staff Member</th>
                      <th className="p-3.5">Action Type</th>
                      <th className="p-3.5">Reference</th>
                      <th className="p-3.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                    {staffAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                          No staff action audit records logged yet.
                        </td>
                      </tr>
                    ) : (
                      staffAuditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                          <td className="p-3.5 text-[var(--text-secondary)] font-mono text-[11px]">
                            {new Date(log.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="p-3.5 font-bold text-[var(--text-primary)]">{log.staff_name || "System / Admin"}</td>
                          <td className="p-3.5">
                            <span className="inline-block rounded-full bg-[var(--accent-brand)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-brand)] uppercase">
                              {log.action_type.replace("_", " ")}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-[11px] text-[var(--text-muted)]">
                            {log.reference_type ? `${log.reference_type} #${log.reference_id?.slice(0, 8)}` : "—"}
                          </td>
                          <td className="p-3.5 text-[var(--text-secondary)]">{log.details || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        )}

        {/* ── TAB: SALES & EXECUTIVE ANALYTICS ─────────────────────────── */}
        {activeTab === ("analytics" as any) && (
          <div className="space-y-6">
            {/* Header & Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
                  <TrendingUp className="h-6 w-6 text-[var(--accent-brand)]" />
                  Sales &amp; Executive Analytics
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Outlet revenue trends, COGS margin tracking, peak service hours, and order funnel conversion
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Date Range Presets */}
                <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] p-1 text-xs font-bold">
                  {(["7d", "30d", "this_month", "custom"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setDrilldownBucket(null);
                        setAnalyticsDatePreset(p);
                      }}
                      className={`rounded-lg px-2.5 py-1 transition ${analyticsDatePreset === p
                        ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                      {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : p === "this_month" ? "This Month" : "Custom"}
                    </button>
                  ))}
                </div>

                {/* Granularity Selector */}
                <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] p-1 text-xs font-bold">
                  {(["hourly", "daily", "weekly", "monthly"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setAnalyticsGranularity(g)}
                      className={`rounded-lg px-2 py-1 transition uppercase ${analyticsGranularity === g
                        ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                      {g[0].toUpperCase() + g.slice(1, 3)}
                    </button>
                  ))}
                </div>

                {/* Export Buttons */}
                <div className="flex items-center gap-1.5">
                  <a
                    href={`${getApiBaseUrl()}/api/analytics/export?report=revenue&format=csv`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold hover:border-[var(--accent-brand)] transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV Export
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      if (!kpiData || !topItemsData || !funnelData || !restaurant) return;
                      generateAnalyticsPdfReport(
                        restaurant.name,
                        analyticsDatePreset === "7d" ? "Past 7 Days" : analyticsDatePreset === "30d" ? "Past 30 Days" : "Selected Date Range",
                        kpiData,
                        topItemsData.items,
                        funnelData.stages
                      );
                    }}
                    disabled={!kpiData}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF Report
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Date Picker Bar */}
            {analyticsDatePreset === "custom" && (
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs">
                <Calendar className="h-4 w-4 text-[var(--accent-brand)]" />
                <span className="font-bold">Custom Range:</span>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1"
                />
                <span>to</span>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1"
                />
                <button
                  type="button"
                  onClick={() => void loadAnalyticsData()}
                  className="rounded-lg bg-[var(--accent-brand)] px-3 py-1 text-xs font-bold text-white"
                >
                  Apply Filter
                </button>
              </div>
            )}

            {/* Active Drill-down Filter Pill */}
            {drilldownBucket && (
              <div className="flex items-center justify-between rounded-2xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[var(--accent-brand)]" />
                  <span>
                    Filtered to single time bucket: <strong>{drilldownBucket}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDrilldownBucket(null);
                    void loadAnalyticsData();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-brand)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-brand-hover)]"
                >
                  <FilterX className="h-3.5 w-3.5" />
                  Clear Drill-down Filter
                </button>
              </div>
            )}

            {/* Skeleton Loading State */}
            {isLoadingAnalytics && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]" />
                ))}
              </div>
            )}

            {/* 1. TOP KPI SUMMARY STRIP */}
            {!isLoadingAnalytics && kpiData && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Total Revenue */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">
                    <span>Total Revenue</span>
                    <DollarSign className="h-4 w-4 text-[var(--accent-brand)]" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-2xl font-black text-[var(--text-primary)]">
                      ₹{kpiData.total_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.revenue_change_pct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                      }`}>
                      {kpiData.revenue_change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {kpiData.revenue_change_pct >= 0 ? "+" : ""}{kpiData.revenue_change_pct}%
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">vs. previous equivalent period</p>
                </div>

                {/* Total Orders */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">
                    <span>Total Orders</span>
                    <ShoppingBag className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-2xl font-black text-[var(--text-primary)]">{kpiData.total_orders}</p>
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.orders_change_pct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                      }`}>
                      {kpiData.orders_change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {kpiData.orders_change_pct >= 0 ? "+" : ""}{kpiData.orders_change_pct}%
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">vs. previous period ({kpiData.prev_total_orders} orders)</p>
                </div>

                {/* Avg Order Value (AOV) */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">
                    <span>Avg Order Value</span>
                    <Activity className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-2xl font-black text-[var(--text-primary)]">
                      ₹{kpiData.avg_order_value.toFixed(2)}
                    </p>
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.aov_change_pct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                      }`}>
                      {kpiData.aov_change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {kpiData.aov_change_pct >= 0 ? "+" : ""}{kpiData.aov_change_pct}%
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">vs. prev AOV (₹{kpiData.prev_avg_order_value.toFixed(2)})</p>
                </div>

                {/* Profit Margin % */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <span>Profit Margin</span>
                    <Percent className="h-4 w-4" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {kpiData.profit_margin_pct.toFixed(1)}%
                    </p>
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${kpiData.margin_change_pct >= 0 ? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/25 text-rose-700"
                      }`}>
                      {kpiData.margin_change_pct >= 0 ? "+" : ""}{kpiData.margin_change_pct}%
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                    Net: ₹{kpiData.net_profit.toFixed(0)} | COGS: ₹{kpiData.cogs.toFixed(0)}
                  </p>
                </div>
              </div>
            )}

            {/* 2. REVENUE OVERVIEW & DRILL-DOWN CHART */}
            <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <h2 className="font-display text-lg font-bold flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[var(--accent-brand)]" />
                    Revenue &amp; Order Volume Trend
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Interactive bar chart — click any bar to filter entire dashboard to that date
                  </p>
                </div>
                {hoveredRevenuePoint && (
                  <div className="rounded-xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 px-3 py-1.5 text-xs font-bold text-[var(--accent-brand)]">
                    {hoveredRevenuePoint.bucket}: ₹{hoveredRevenuePoint.revenue.toFixed(2)} ({hoveredRevenuePoint.orders} orders)
                  </div>
                )}
              </div>

              {!revenueData || revenueData.buckets.length === 0 ? (
                <div className="p-12 text-center text-xs text-[var(--text-muted)]">
                  No sales orders recorded in this date range.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="h-56 flex items-end gap-2 overflow-x-auto pb-4 pt-8 px-2">
                    {(() => {
                      const maxRev = Math.max(...revenueData.buckets.map((b) => b.revenue), 1);
                      return revenueData.buckets.map((b) => {
                        const pct = Math.max(8, Math.round((b.revenue / maxRev) * 100));
                        const isDrilled = drilldownBucket === b.bucket;

                        return (
                          <div
                            key={b.bucket}
                            onClick={() => {
                              setDrilldownBucket(b.bucket);
                              void loadAnalyticsData();
                            }}
                            onMouseEnter={() => setHoveredRevenuePoint({ bucket: b.bucket, revenue: b.revenue, orders: b.orders_count })}
                            onMouseLeave={() => setHoveredRevenuePoint(null)}
                            className="group relative flex-1 min-w-[32px] flex flex-col items-center justify-end cursor-pointer"
                          >
                            {/* Hover Tooltip Card */}
                            <div className="absolute -top-10 hidden group-hover:flex flex-col items-center z-20 whitespace-nowrap">
                              <div className="rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-2 py-1 text-[10px] font-bold shadow-md">
                                ₹{b.revenue.toFixed(0)} ({b.orders_count} orders)
                              </div>
                            </div>

                            {/* Bar fill */}
                            <div
                              style={{ height: `${pct}%` }}
                              className={`w-full rounded-t-lg transition-all duration-200 ${isDrilled
                                ? "bg-emerald-500 shadow-md ring-2 ring-emerald-400"
                                : "bg-[var(--accent-brand)] group-hover:bg-[var(--accent-brand-hover)]"
                                }`}
                            />
                            <span className="mt-2 text-[10px] font-mono text-[var(--text-muted)] truncate max-w-[48px]">
                              {b.bucket.split(" ")[0].slice(-5)}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </article>

            {/* 3. TWO-COLUMN GRID: TOP ITEMS & ORDER FUNNEL */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* TOP SELLING DISHES */}
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-amber-500" />
                    <h2 className="font-display text-lg font-bold">Top Performing Products</h2>
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setTopItemsSortBy(topItemsSortBy === "revenue" ? "quantity" : "revenue")}
                      className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 font-bold text-[var(--text-secondary)] hover:border-[var(--accent-brand)]"
                    >
                      Sort: {topItemsSortBy === "revenue" ? "By Revenue" : "By Qty"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopItemsViewMode(topItemsViewMode === "list" ? "chart" : "list")}
                      className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)]"
                      title={topItemsViewMode === "list" ? "Switch to Donut View" : "Switch to List View"}
                    >
                      {topItemsViewMode === "list" ? <PieChart className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {!topItemsData || topItemsData.items.length === 0 ? (
                  <p className="p-8 text-center text-xs text-[var(--text-muted)]">No item sales recorded in range.</p>
                ) : topItemsViewMode === "list" ? (
                  <div className="space-y-3">
                    {topItemsData.items.map((item, idx) => (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold truncate text-[var(--text-primary)]">
                            #{idx + 1} {item.name}
                          </span>
                          <span className="font-mono text-[var(--accent-brand)] font-bold">
                            ₹{item.revenue.toFixed(2)} ({item.quantity_sold} sold)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, Math.max(5, item.revenue_share_pct))}%` }}
                            className="h-full rounded-full bg-[var(--accent-brand)]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 flex flex-col items-center justify-center space-y-3">
                    <PieChart className="h-16 w-16 text-[var(--accent-brand)] opacity-60" />
                    <p className="text-xs text-[var(--text-muted)] text-center">
                      Top dish revenue share distribution across <strong>{topItemsData.items.length}</strong> Products.
                    </p>
                  </div>
                )}
              </article>

              {/* ORDER FUNNEL & STATUS MIX */}
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-sky-500" />
                    <h2 className="font-display text-lg font-bold">Order Conversion &amp; Funnel</h2>
                  </div>
                  {funnelData && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                      Conversion: {funnelData.conversion_rate_pct}%
                    </span>
                  )}
                </div>

                {!funnelData ? (
                  <p className="p-8 text-center text-xs text-[var(--text-muted)]">No order data available.</p>
                ) : (
                  <div className="space-y-4">
                    {funnelData.stages.map((stg) => (
                      <div key={stg.stage} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--text-primary)]">{stg.stage_label}</span>
                          <span className="font-mono text-[var(--text-secondary)] font-bold">
                            {stg.count} orders ({stg.percentage}%)
                          </span>
                        </div>
                        <div className="h-3.5 w-full rounded-xl bg-[var(--bg-surface-elevated)] overflow-hidden">
                          <div
                            style={{ width: `${Math.max(4, stg.percentage)}%` }}
                            className={`h-full rounded-xl transition-all ${stg.stage === "CANCELLED"
                              ? "bg-rose-500"
                              : stg.stage === "SERVED"
                                ? "bg-emerald-500"
                                : stg.stage === "PAID"
                                  ? "bg-[var(--accent-brand)]"
                                  : "bg-amber-500"
                              }`}
                          />
                        </div>
                      </div>
                    ))}

                    <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>Total Volume: <strong>{funnelData.total_orders}</strong></span>
                      <span className="text-rose-600 font-bold">Cancellation Rate: {funnelData.cancellation_rate_pct}%</span>
                    </div>
                  </div>
                )}
              </article>
            </div>

            {/* 4. PEAK HOURS SERVICE HEATMAP */}
            <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <h2 className="font-display text-lg font-bold">Peak Service Hours (24-Hour Distribution)</h2>
                </div>
                <span className="text-xs text-[var(--text-muted)]">Order volume by hour-of-day</span>
              </div>

              {!peakHoursData ? (
                <p className="p-8 text-center text-xs text-[var(--text-muted)]">No peak hours data.</p>
              ) : (
                <div className="h-36 flex items-end gap-1 overflow-x-auto pb-4 pt-6 px-2">
                  {(() => {
                    const maxCnt = Math.max(...peakHoursData.buckets.map((b) => b.orders_count), 1);
                    return peakHoursData.buckets.map((b) => {
                      const pct = Math.max(10, Math.round((b.orders_count / maxCnt) * 100));

                      return (
                        <div key={b.hour} className="group relative flex-1 min-w-[20px] flex flex-col items-center justify-end">
                          <div className="absolute -top-7 hidden group-hover:flex flex-col items-center z-20">
                            <div className="rounded-md bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-bold">
                              {b.hour_label}: {b.orders_count} orders
                            </div>
                          </div>
                          <div
                            style={{ height: `${pct}%` }}
                            className={`w-full rounded-t-md transition-all ${b.orders_count > maxCnt * 0.7 ? "bg-amber-500" : "bg-[var(--accent-brand)]/70"
                              }`}
                          />
                          <span className="mt-1 text-[9px] font-mono text-[var(--text-muted)]">{b.hour}h</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </article>

            {/* 5. PROFIT MARGIN & COGS ANALYSIS */}
            <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <h2 className="font-display text-lg font-bold flex items-center gap-2">
                    <Percent className="h-5 w-5 text-emerald-500" />
                    Profit Margin &amp; Cost of Goods Sold (COGS)
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Calculated using ingredient <code>unit_cost_snapshot</code> at the exact moment of stock deduction
                  </p>
                </div>
                {profitData && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600">
                    Overall Margin: {profitData.overall_margin_pct}%
                  </div>
                )}
              </div>

              {!profitData || profitData.buckets.length === 0 ? (
                <p className="p-8 text-center text-xs text-[var(--text-muted)]">No profit margin data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="p-3">Time Bucket</th>
                        <th className="p-3 text-right">Revenue (INR)</th>
                        <th className="p-3 text-right">COGS (INR)</th>
                        <th className="p-3 text-right">Net Profit (INR)</th>
                        <th className="p-3 text-center">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] text-xs font-mono">
                      {profitData.buckets.map((b) => (
                        <tr key={b.bucket} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                          <td className="p-3 font-bold font-sans text-[var(--text-primary)]">{b.bucket}</td>
                          <td className="p-3 text-right text-[var(--text-primary)]">₹{b.revenue.toFixed(2)}</td>
                          <td className="p-3 text-right text-rose-500">₹{b.cogs.toFixed(2)}</td>
                          <td className="p-3 text-right text-emerald-600 font-bold">₹{b.profit.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <span className="inline-block rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                              {b.margin_pct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        )}
        {/* ── TAB: BILLING & POS ─────────────────────────────────────── */}
        {activeTab === ("billing" as any) && (
          <div className="space-y-6">
            {/* Header & Control Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Receipt className="h-6 w-6 text-[var(--accent-brand)]" />
                  Billing &amp; Point of Sale (POS)
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Create walk-in &amp; phone bills, apply manager discounts, process Cash &amp; UPI payments, and print PDF receipts
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadBillingData()}
                  disabled={isLoadingBilling}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingBilling ? "animate-spin" : ""}`} />
                  Sync Billing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftCartItems([]);
                    setCreateBillModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
                >
                  <Plus className="h-4 w-4" />
                  Create New Bill
                </button>
              </div>
            </div>

            {/* PENDING DISCOUNT APPROVALS QUEUE (FOR MANAGERS/ADMINS) */}
            {pendingApprovals.length > 0 && (!staffPermissions || staffPermissions.can_manage_billing) && (
              <article className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
                    <ShieldAlert className="h-5 w-5 text-amber-500" />
                    <h2 className="font-display text-lg font-bold">Pending Discount Approvals Queue</h2>
                  </div>
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
                    {pendingApprovals.length} Pending
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pendingApprovals.map((appr) => (
                    <div
                      key={appr.id}
                      className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 space-y-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-xs border-b border-[var(--border-subtle)] pb-2">
                        <span className="font-mono font-bold text-[var(--accent-brand)]">
                          Basket #{appr.order_table_number}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {new Date(appr.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--text-muted)]">Requested By:</span>
                          <span className="font-bold text-[var(--text-primary)]">{appr.requested_by_name || "Cashier"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--text-muted)]">Discount Requested:</span>
                          <span className="font-bold text-emerald-600">
                            {appr.discount_type === "PERCENT"
                              ? `${appr.discount_value}% OFF`
                              : appr.discount_type === "FLAT"
                                ? `₹${appr.discount_value} OFF`
                                : "100% COMPLIMENTARY"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--text-muted)]">Order Total:</span>
                          <span className="font-mono font-bold">₹{appr.order_total_amount.toFixed(2)}</span>
                        </div>
                        <div className="pt-1">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Reason Note:</span>
                          <p className="text-xs italic text-[var(--text-secondary)] rounded-lg bg-[var(--bg-surface-elevated)] p-2 mt-0.5">
                            &quot;{appr.reason_note}&quot;
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => void handleResolveApproval(appr.id, true)}
                          className="flex-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResolveApproval(appr.id, false)}
                          className="flex-1 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )}

            {/* BILL HISTORY & MANAGEMENT TABLE */}
            <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-4">
              {/* Filter Tabs */}
              <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 overflow-x-auto text-xs font-bold">
                  {(["ALL", "DRAFT", "PENDING_APPROVAL", "FINALIZED", "PAID", "CANCELLED"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setBillingStatusFilter(st)}
                      className={`rounded-xl px-3 py-1.5 transition ${billingStatusFilter === st
                        ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                        }`}
                    >
                      {st.replace("_", " ")}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={billingSearchQuery}
                    onChange={(e) => setBillingSearchQuery(e.target.value)}
                    placeholder="Search by Bill ID or Table..."
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-3 text-xs"
                  />
                </div>
              </div>

              {/* Bills List Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-3.5">Bill ID &amp; Source</th>
                      <th className="p-3.5">Table &amp; Customer</th>
                      <th className="p-3.5 text-center">Items</th>
                      <th className="p-3.5 text-right">Subtotal</th>
                      <th className="p-3.5 text-right">Discount</th>
                      <th className="p-3.5 text-right">Grand Total</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                    {billsList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-12 text-center text-[var(--text-muted)]">
                          No bills found matching filters. Create your first bill above!
                        </td>
                      </tr>
                    ) : (
                      billsList
                        .filter((b) => {
                          if (billingStatusFilter !== "ALL" && b.status.toUpperCase() !== billingStatusFilter && b.discount_status?.toUpperCase() !== billingStatusFilter) {
                            return false;
                          }
                          if (billingSearchQuery) {
                            const q = billingSearchQuery.toLowerCase();
                            return b.id.toLowerCase().includes(q) || b.table_number.toLowerCase().includes(q);
                          }
                          return true;
                        })
                        .map((b) => (
                          <tr key={b.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                            <td className="p-3.5 font-mono">
                              <span className="font-bold text-[var(--text-primary)]">#{b.id.slice(0, 8).toUpperCase()}</span>
                              <span className="block text-[10px] uppercase font-bold text-[var(--accent-brand)]">{b.source}</span>
                            </td>

                            <td className="p-3.5">
                              <span className="font-bold text-[var(--text-primary)]">Basket #{b.table_number}</span>
                              {b.customer_name && (
                                <span className="block text-[10px] text-[var(--text-muted)]">{b.customer_name}</span>
                              )}
                            </td>

                            <td className="p-3.5 text-center font-bold font-mono">{b.items?.length || 0}</td>

                            <td className="p-3.5 text-right font-mono">₹{b.subtotal_amount.toFixed(2)}</td>

                            <td className="p-3.5 text-right font-mono">
                              {b.discount_type ? (
                                <span className="text-emerald-600 font-bold">
                                  {b.discount_type === "PERCENT"
                                    ? `-${b.discount_value}%`
                                    : b.discount_type === "FLAT"
                                      ? `-₹${b.discount_value}`
                                      : "FREE"}
                                </span>
                              ) : (
                                <span className="text-[var(--text-muted)]">—</span>
                              )}
                            </td>

                            <td className="p-3.5 text-right font-mono font-black text-sm text-[var(--text-primary)]">
                              ₹{b.total_amount.toFixed(2)}
                            </td>

                            <td className="p-3.5 text-center">
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${b.status === "PAID" || b.status === "SERVED" || b.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : b.discount_status === "PENDING_APPROVAL"
                                    ? "bg-amber-100 text-amber-800 animate-pulse"
                                    : b.status === "CANCELLED"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-sky-100 text-sky-800"
                                  }`}
                              >
                                {b.discount_status === "PENDING_APPROVAL" ? "Pending Discount Approval" : b.status}
                              </span>
                              {b.payment_method && (
                                <span className="block text-[10px] text-[var(--text-muted)] font-mono uppercase mt-0.5">
                                  Via {b.payment_method}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-right space-x-1">
                              {/* Apply Discount Button */}
                              {b.status !== "PAID" && b.status !== "COMPLETED" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDiscountTargetBill(b);
                                    setDiscountModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-emerald-600 transition"
                                  title="Apply Discount"
                                >
                                  <Percent className="h-4 w-4" />
                                </button>
                              )}

                              {/* Mark Paid Button */}
                              {b.status !== "PAID" && b.status !== "COMPLETED" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentTargetBill(b);
                                    setPaymentModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition"
                                  title="Process Cash / UPI Payment"
                                >
                                  <CreditCard className="h-4 w-4" />
                                </button>
                              )}

                              {/* Print / PDF Receipt Button (reuses generateReceiptPDF) */}
                              <button
                                type="button"
                                onClick={() => {
                                  generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT");
                                }}
                                className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)] hover:border-[var(--accent-brand)] transition"
                                title="Print PDF Bill"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        )}
        {activeTab === "inventory" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">Inventory Management</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Outlet ingredient master, stock intakes, recipe auto-deduction, and movement ledger
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadInventoryData();
                  void loadLedgerData(1, ledgerFilterItemId, ledgerFilterChangeType);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingInventory ? "animate-spin text-[var(--accent-brand)]" : ""}`} />
                <span>Refresh Inventory</span>
              </button>
            </div>

            {/* Inventory Sub-Tab Navigation Bar */}
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setInventorySubTab("overview")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shrink-0 ${inventorySubTab === "overview"
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
              >
                <Boxes className="h-4 w-4" />
                <span>Overview &amp; Alerts ({inventoryItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setInventorySubTab("intake")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shrink-0 ${inventorySubTab === "intake"
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
              >
                <Plus className="h-4 w-4" />
                <span>Stock Intake</span>
              </button>

              <button
                type="button"
                onClick={() => setInventorySubTab("master")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shrink-0 ${inventorySubTab === "master"
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
              >
                <ClipboardList className="h-4 w-4" />
                <span>Ingredient Master</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInventorySubTab("recipes");
                  if (menuItems.length > 0 && !selectedRecipeMenuItemId) {
                    setSelectedRecipeMenuItemId(menuItems[0].id);
                    void loadRecipeForMenuItem(menuItems[0].id);
                  }
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shrink-0 ${inventorySubTab === "recipes"
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>Recipe Mapping</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInventorySubTab("ledger");
                  void loadLedgerData(1, ledgerFilterItemId, ledgerFilterChangeType);
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shrink-0 ${inventorySubTab === "ledger"
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
              >
                <Activity className="h-4 w-4" />
                <span>Movement Ledger</span>
              </button>
            </div>

            {/* SUB-VIEW 1: OVERVIEW & LOW STOCK ALERTS */}
            {inventorySubTab === "overview" && (
              <div className="space-y-6">
                {/* Stat Cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Ingredients</p>
                    <p className="text-2xl font-black text-[var(--text-primary)]">{inventoryItems.length}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Low Stock Alerts</p>
                    <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{lowStockAlerts.length}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-1 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Near-Expiry / Expired</p>
                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400">
                      {nearExpiryAlerts.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Est. Inventory Value</p>
                    <p className="text-2xl font-black text-[var(--accent-brand)]">
                      ₹{inventoryItems.reduce((sum, i) => sum + (parseFloat(i.current_stock) > 0 ? parseFloat(i.current_stock) * parseFloat(i.cost_per_unit) : 0), 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Near-Expiry Alerts Section */}
                {nearExpiryAlerts.length > 0 && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                      <h3 className="font-bold text-sm text-[var(--text-primary)]">
                        Near-Expiry &amp; Expired Produce Batches ({nearExpiryAlerts.length})
                      </h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {nearExpiryAlerts.map((alert) => {
                        const isExpired = alert.status === "EXPIRED";
                        const dateStr = alert.expiry_date ? formatDateTime(alert.expiry_date).split(",")[0] : "";
                        return (
                          <div
                            key={alert.intake_id}
                            className={`rounded-xl border p-3 space-y-1.5 ${
                              isExpired
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs">{alert.item_name}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                                  isExpired ? "bg-rose-500 text-white" : "bg-amber-500 text-white"
                                }`}
                              >
                                {isExpired ? "Expired" : `In ${alert.days_until_expiry}d`}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs font-mono">
                              <span>Batch Stock: {parseFloat(alert.remaining_quantity).toFixed(2)} {alert.unit}</span>
                              <span>Expires: {dateStr}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Ingredients Cards Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {inventoryItems.map((item) => {
                    const stock = parseFloat(item.current_stock);
                    const threshold = parseFloat(item.reorder_threshold);
                    const isLow = stock <= threshold;
                    const isOut = stock <= 0;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-4 space-y-3 flex flex-col justify-between transition ${isOut
                          ? "border-rose-500/50 bg-rose-500/5"
                          : isLow
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                          }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-base text-[var(--text-primary)]">{item.name}</h3>
                            <span className="rounded-md bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)] uppercase">
                              {item.category}
                            </span>
                          </div>

                          <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-2">
                            <span className="text-xs text-[var(--text-secondary)]">Current Stock</span>
                            <span className={`font-mono text-lg font-black ${isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-[var(--text-primary)]"}`}>
                              {stock.toFixed(2)} {item.unit}
                            </span>
                          </div>

                          <div className="flex justify-between text-xs text-[var(--text-muted)]">
                            <span>Reorder Threshold:</span>
                            <span className="font-mono">{threshold.toFixed(2)} {item.unit}</span>
                          </div>
                          <div className="flex justify-between text-xs text-[var(--text-muted)]">
                            <span>Cost per Unit:</span>
                            <span className="font-mono">₹{parseFloat(item.cost_per_unit).toFixed(2)} / {item.unit}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
                          {isOut ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-600">
                              <AlertTriangle className="h-3 w-3" />
                              Out of Stock
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              In Stock
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setIntakeForm((prev) => ({ ...prev, item_id: item.id }));
                              setInventorySubTab("intake");
                            }}
                            className="text-xs font-bold text-[var(--accent-brand)] hover:underline"
                          >
                            + Add Stock
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUB-VIEW 2: STOCK INTAKE ENTRY FORM */}
            {inventorySubTab === "intake" && (
              <div className="max-w-xl mx-auto space-y-4">
                <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xs">
                  <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold">Log Daily Stock Intake</h2>
                      <p className="text-xs text-[var(--text-secondary)]">Record newly arrived ingredients &amp; update unit cost</p>
                    </div>
                  </div>

                  <form onSubmit={onSubmitStockIntake} className="space-y-4">
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Select Ingredient</span>
                      <select
                        value={intakeForm.item_id}
                        onChange={(e) => setIntakeForm((prev) => ({ ...prev, item_id: e.target.value }))}
                        required
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm"
                      >
                        <option value="">-- Choose Ingredient --</option>
                        {inventoryItems.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.unit}) — Current Stock: {parseFloat(i.current_stock).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Quantity Arrived</span>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={intakeForm.quantity}
                          onChange={(e) => setIntakeForm((prev) => ({ ...prev, quantity: e.target.value }))}
                          required
                          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-mono"
                        />
                      </label>

                      <label className="block space-y-1">
                        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Unit Cost (₹)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={intakeForm.unit_cost}
                          onChange={(e) => setIntakeForm((prev) => ({ ...prev, unit_cost: e.target.value }))}
                          required
                          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-mono"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Supplier Name (Optional)</span>
                      <input
                        type="text"
                        value={intakeForm.supplier_name}
                        onChange={(e) => setIntakeForm((prev) => ({ ...prev, supplier_name: e.target.value }))}
                        placeholder="e.g. Metro Wholesale, Local Dairy..."
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Expiry Date (Optional)</span>
                      <input
                        type="date"
                        value={intakeForm.expiry_date}
                        onChange={(e) => setIntakeForm((prev) => ({ ...prev, expiry_date: e.target.value }))}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-mono"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Notes (Optional)</span>
                      <textarea
                        value={intakeForm.notes}
                        onChange={(e) => setIntakeForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Invoice #, batch number, freshness check..."
                        rows={2}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isSavingIntake}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-3 text-sm font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-md transition"
                    >
                      <Plus className="h-4 w-4" />
                      {isSavingIntake ? "Recording Intake..." : "Record Stock Arrival"}
                    </button>
                  </form>
                </article>
              </div>
            )}

            {/* SUB-VIEW 3: INGREDIENT MASTER CRUD */}
            {inventorySubTab === "master" && (
              <div className="space-y-6">
                <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xs">
                  <h2 className="font-display text-lg font-bold">
                    {editingInventoryId ? "Edit Ingredient Master" : "Add New Ingredient to Master"}
                  </h2>
                  <form onSubmit={onSubmitInventoryItem} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Ingredient Name</span>
                      <input
                        type="text"
                        value={inventoryForm.name}
                        onChange={(e) => setInventoryForm((prev) => ({ ...prev, name: e.target.value }))}
                        required
                        placeholder="e.g. Milk, Flour, Coffee Beans"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Measurement Unit</span>
                      <select
                        value={inventoryForm.unit}
                        onChange={(e) => setInventoryForm((prev) => ({ ...prev, unit: e.target.value as InventoryUnit }))}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm font-mono"
                      >
                        <option value="pcs">pcs (Pieces)</option>
                        <option value="kg">kg (Kilograms)</option>
                        <option value="g">g (Grams)</option>
                        <option value="l">l (Liters)</option>
                        <option value="ml">ml (Milliliters)</option>
                      </select>
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Category</span>
                      <input
                        type="text"
                        value={inventoryForm.category}
                        onChange={(e) => setInventoryForm((prev) => ({ ...prev, category: e.target.value }))}
                        placeholder="Dairy, Produce, Spices..."
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Initial Stock</span>
                      <input
                        type="number"
                        step="0.001"
                        value={inventoryForm.current_stock}
                        onChange={(e) => setInventoryForm((prev) => ({ ...prev, current_stock: e.target.value }))}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm font-mono"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Reorder Threshold</span>
                      <input
                        type="number"
                        step="0.001"
                        value={inventoryForm.reorder_threshold}
                        onChange={(e) => setInventoryForm((prev) => ({ ...prev, reorder_threshold: e.target.value }))}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm font-mono"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Cost per Unit (₹)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={inventoryForm.cost_per_unit}
                        onChange={(e) => setInventoryForm((prev) => ({ ...prev, cost_per_unit: e.target.value }))}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm font-mono"
                      />
                    </label>

                    <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-2">
                      {editingInventoryId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingInventoryId(null);
                            setInventoryForm({ name: "", unit: "pcs", category: "General", current_stock: "0", reorder_threshold: "0", cost_per_unit: "0" });
                          }}
                          className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-bold hover:bg-[var(--bg-surface-elevated)]"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSavingInventoryItem}
                        className="rounded-xl bg-[var(--accent-brand)] px-6 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
                      >
                        {isSavingInventoryItem ? "Saving..." : editingInventoryId ? "Update Ingredient" : "+ Add Ingredient"}
                      </button>
                    </div>
                  </form>
                </article>

                {/* Master Table */}
                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <th className="p-3.5">Ingredient Name</th>
                          <th className="p-3.5">Category</th>
                          <th className="p-3.5">Unit</th>
                          <th className="p-3.5 text-right">Current Stock</th>
                          <th className="p-3.5 text-right">Reorder Level</th>
                          <th className="p-3.5 text-right">Cost / Unit</th>
                          <th className="p-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                        {inventoryItems.map((item) => (
                          <tr key={item.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                            <td className="p-3.5 font-bold text-[var(--text-primary)]">{item.name}</td>
                            <td className="p-3.5 text-[var(--text-secondary)]">{item.category}</td>
                            <td className="p-3.5 font-mono uppercase text-[var(--text-muted)]">{item.unit}</td>
                            <td className="p-3.5 font-mono font-bold text-right">{parseFloat(item.current_stock).toFixed(2)}</td>
                            <td className="p-3.5 font-mono text-[var(--text-muted)] text-right">{parseFloat(item.reorder_threshold).toFixed(2)}</td>
                            <td className="p-3.5 font-mono text-[var(--text-primary)] text-right">₹{parseFloat(item.cost_per_unit).toFixed(2)}</td>
                            <td className="p-3.5 text-right space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingInventoryId(item.id);
                                  setInventoryForm({
                                    name: item.name,
                                    unit: item.unit,
                                    category: item.category,
                                    current_stock: item.current_stock,
                                    reorder_threshold: item.reorder_threshold,
                                    cost_per_unit: item.cost_per_unit,
                                  });
                                }}
                                className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)]"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void onDeleteInventoryItem(item.id, item.name)}
                                className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600"
                                title="Deactivate"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 4: DISH RECIPE MAPPING */}
            {inventorySubTab === "recipes" && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-5 shadow-xs">
                  <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold">Dish Recipe Builder</h2>
                      <p className="text-xs text-[var(--text-secondary)]">Attach required ingredients per unit sold for auto-deduction</p>
                    </div>
                  </div>

                  {/* Dish Selector Dropdown */}
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Select Menu Item Dish</span>
                    <select
                      value={selectedRecipeMenuItemId}
                      onChange={(e) => {
                        setSelectedRecipeMenuItemId(e.target.value);
                        void loadRecipeForMenuItem(e.target.value);
                      }}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-semibold"
                    >
                      <option value="">-- Choose Menu Item --</option>
                      {menuItems.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (₹{m.price})
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedRecipeMenuItemId && (
                    <form onSubmit={onSubmitRecipe} className="space-y-4 pt-2">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          Required Ingredients per 1 Portion
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            if (inventoryItems.length === 0) {
                              setError("Create inventory ingredients first in Item Master!");
                              return;
                            }
                            setRecipeIngredients((prev) => [
                              ...prev,
                              {
                                inventory_item_id: inventoryItems[0].id,
                                quantity_required: "0.1",
                                unit: inventoryItems[0].unit,
                              },
                            ]);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] px-2.5 py-1 text-xs font-bold hover:bg-[var(--accent-brand)]/20"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>+ Add Ingredient</span>
                        </button>
                      </div>

                      {isLoadingRecipe ? (
                        <p className="text-xs text-[var(--text-muted)] py-4 text-center">Loading dish recipe...</p>
                      ) : recipeIngredients.length === 0 ? (
                        <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                          No ingredients mapped to this dish yet. Click <strong>+ Add Ingredient</strong> above.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {recipeIngredients.map((ing, idx) => (
                            <div key={idx} className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5">
                              <select
                                value={ing.inventory_item_id}
                                onChange={(e) => {
                                  const selectedInv = inventoryItems.find((i) => i.id === e.target.value);
                                  setRecipeIngredients((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                          ...item,
                                          inventory_item_id: e.target.value,
                                          unit: selectedInv ? selectedInv.unit : item.unit,
                                        }
                                        : item
                                    )
                                  );
                                }}
                                className="w-1/2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs"
                              >
                                {inventoryItems.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.name} ({i.unit})
                                  </option>
                                ))}
                              </select>

                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                value={ing.quantity_required}
                                onChange={(e) =>
                                  setRecipeIngredients((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, quantity_required: e.target.value } : item))
                                  )
                                }
                                placeholder="Qty required"
                                className="w-1/4 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono"
                              />

                              <span className="w-1/8 text-xs font-mono uppercase text-[var(--text-muted)] font-bold">{ing.unit}</span>

                              <button
                                type="button"
                                onClick={() => setRecipeIngredients((prev) => prev.filter((_, i) => i !== idx))}
                                className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg"
                                title="Remove Ingredient"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSavingRecipe}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-3 text-sm font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] transition shadow-md"
                      >
                        <Save className="h-4 w-4" />
                        {isSavingRecipe ? "Saving Recipe Mapping..." : "Save Recipe Mapping"}
                      </button>
                    </form>
                  )}
                </article>
              </div>
            )}

            {/* SUB-VIEW 5: STOCK MOVEMENT LEDGER */}
            {inventorySubTab === "ledger" && (
              <div className="space-y-4">
                {/* Ledger Filters */}
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Ingredient:</span>
                    <select
                      value={ledgerFilterItemId}
                      onChange={(e) => {
                        setLedgerFilterItemId(e.target.value);
                        void loadLedgerData(1, e.target.value, ledgerFilterChangeType);
                      }}
                      className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs"
                    >
                      <option value="ALL">All Ingredients</option>
                      {inventoryItems.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Change Type:</span>
                    <select
                      value={ledgerFilterChangeType}
                      onChange={(e) => {
                        setLedgerFilterChangeType(e.target.value);
                        void loadLedgerData(1, ledgerFilterItemId, e.target.value);
                      }}
                      className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs"
                    >
                      <option value="ALL">All Movements</option>
                      <option value="intake">Stock Intake (+)</option>
                      <option value="auto_deduction">Auto Deduction (-)</option>
                      <option value="restock">Restock / Reversal (+)</option>
                      <option value="manual_adjustment">Manual Adjustment</option>
                    </select>
                  </div>
                </div>

                {/* Ledger Table */}
                <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <th className="p-3.5">Date &amp; Time</th>
                          <th className="p-3.5">Ingredient Name</th>
                          <th className="p-3.5">Movement Type</th>
                          <th className="p-3.5 text-right">Quantity Change</th>
                          <th className="p-3.5 text-right">Resulting Balance</th>
                          <th className="p-3.5">Ref / Order ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                        {ledgerPageData?.items?.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                              No stock movement ledger records found.
                            </td>
                          </tr>
                        ) : (
                          ledgerPageData?.items.map((row) => {
                            const change = parseFloat(row.quantity_change);
                            const isPositive = change > 0;

                            return (
                              <tr key={row.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                                <td className="p-3.5 text-[var(--text-secondary)] font-mono text-[11px]">
                                  {new Date(row.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="p-3.5 font-bold text-[var(--text-primary)]">{row.item_name}</td>
                                <td className="p-3.5">
                                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${row.change_type === "intake"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : row.change_type === "auto_deduction"
                                      ? "bg-sky-100 text-sky-800"
                                      : row.change_type === "restock"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-purple-100 text-purple-800"
                                    }`}>
                                    {row.change_type.replace("_", " ")}
                                  </span>
                                </td>
                                <td className={`p-3.5 font-mono font-bold text-right ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                                  {isPositive ? `+${change.toFixed(3)}` : change.toFixed(3)} {row.unit}
                                </td>
                                <td className="p-3.5 font-mono font-bold text-[var(--text-primary)] text-right">
                                  {parseFloat(row.resulting_stock).toFixed(3)} {row.unit}
                                </td>
                                <td className="p-3.5 font-mono text-[11px] text-[var(--text-muted)]">
                                  {row.reference_order_id ? `Order #${row.reference_order_id.slice(0, 8)}` : "—"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {ledgerPageData && ledgerPageData.total_pages > 1 && (
                    <div className="flex items-center justify-between border-t border-[var(--border-subtle)] p-3 text-xs">
                      <span className="text-[var(--text-muted)]">
                        Page {ledgerPageData.page} of {ledgerPageData.total_pages} ({ledgerPageData.total} entries)
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={ledgerCurrentPage <= 1}
                          onClick={() => {
                            const prev = ledgerCurrentPage - 1;
                            setLedgerCurrentPage(prev);
                            void loadLedgerData(prev, ledgerFilterItemId, ledgerFilterChangeType);
                          }}
                          className="rounded-lg border border-[var(--border-strong)] px-3 py-1 font-bold disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={ledgerCurrentPage >= ledgerPageData.total_pages}
                          onClick={() => {
                            const next = ledgerCurrentPage + 1;
                            setLedgerCurrentPage(next);
                            void loadLedgerData(next, ledgerFilterItemId, ledgerFilterChangeType);
                          }}
                          className="rounded-lg border border-[var(--border-strong)] px-3 py-1 font-bold disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: OUTLET SETTINGS ──────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Outlet Settings</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Manage restaurant profile, payment modes, Razorpay keys, and UPI details
              </p>
            </div>

            <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold">Restaurant Profile &amp; Payment Gateway</h2>
                  <p className="text-xs text-[var(--text-secondary)]">Configure outlet payment mode and info</p>
                </div>
              </div>

              <form onSubmit={onSubmitRestaurantSettings} className="space-y-4">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Restaurant Name</span>
                  <input
                    value={restaurantForm.name}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">URL Slug</span>
                  <input
                    value={restaurantForm.slug}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                    required
                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Payment Mode</span>
                  <select
                    value={restaurantForm.payment_mode}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        payment_mode: event.target.value as PaymentMode,
                      }))
                    }
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                  >
                    <option value="PAY_AT_COUNTER">Pay At Counter (Verify/Collect at counter)</option>
                    <option value="RAZORPAY_GATEWAY">Razorpay Gateway (Instant automated)</option>
                    <option value="BOTH">Both (Customer can choose at checkout)</option>
                  </select>
                </label>

                {/* Store Logo & Tax / Registration Info */}
                <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Official Store & Receipt Branding</h3>

                  {/* Logo Upload Input */}
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Store Logo URL</span>
                    <div className="flex gap-2">
                      <input
                        value={restaurantForm.logo_url}
                        onChange={(event) =>
                          setRestaurantForm((current) => ({
                            ...current,
                            logo_url: event.target.value,
                          }))
                        }
                        placeholder="https://... or upload image"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                      />
                      <label className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-xs transition shrink-0 ${isUploadingLogo ? "bg-amber-600 opacity-80 pointer-events-none" : "bg-[var(--accent-brand)] hover:opacity-90"}`}>
                        {isUploadingLogo ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            <span>Upload Logo</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingLogo}
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsUploadingLogo(true);
                            const formData = new FormData();
                            formData.append("file", file);
                            try {
                              const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) || accessToken;
                              const apiBase = getApiBaseUrl();
                              const res = await fetch(`${apiBase}/api/upload/image`, {
                                method: "POST",
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                                body: formData,
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setRestaurantForm((prev) => ({ ...prev, logo_url: data.url }));
                                setNotice("Store logo uploaded successfully! Click Save Settings.");
                              } else {
                                const errData = await res.json().catch(() => ({}));
                                setError(errData.detail || "Logo upload failed.");
                              }
                            } catch (err) {
                              console.error("Logo upload error:", err);
                              setError("Logo upload failed. Check connection.");
                            } finally {
                              setIsUploadingLogo(false);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </label>

                  {/* Address */}
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Store Address</span>
                    <input
                      value={restaurantForm.address}
                      onChange={(event) =>
                        setRestaurantForm((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                      placeholder="Full store address for receipts"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Contact Phone */}
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Contact Phone</span>
                      <input
                        value={restaurantForm.phone}
                        onChange={(event) =>
                          setRestaurantForm((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        placeholder="+91 9876543210"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                      />
                    </label>

                    {/* GSTIN */}
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">GSTIN</span>
                      <input
                        value={restaurantForm.gstin}
                        onChange={(event) =>
                          setRestaurantForm((current) => ({
                            ...current,
                            gstin: event.target.value,
                          }))
                        }
                        placeholder="01AAFCB7044K1ZV"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                      />
                    </label>

                    {/* FSSAI Registration */}
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">FSSAI Registration</span>
                      <input
                        value={restaurantForm.fssai_no}
                        onChange={(event) =>
                          setRestaurantForm((current) => ({
                            ...current,
                            fssai_no: event.target.value,
                          }))
                        }
                        placeholder="10718026..."
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                      />
                    </label>
                  </div>
                </div>

                {(restaurantForm.payment_mode === "RAZORPAY_GATEWAY" || restaurantForm.payment_mode === "BOTH") && (
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Razorpay Account ID</span>
                    <input
                      value={restaurantForm.razorpay_account_id}
                      onChange={(event) =>
                        setRestaurantForm((current) => ({
                          ...current,
                          razorpay_account_id: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                      placeholder="acc_XXXXXXXXX"
                    />
                  </label>
                )}

                {/* Basket Session Duration */}
                <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Basket Session Settings</h3>
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Session Duration (minutes)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={restaurantForm.session_duration_minutes}
                        onChange={(event) =>
                          setRestaurantForm((current) => ({
                            ...current,
                            session_duration_minutes: parseInt(event.target.value) || 30,
                          }))
                        }
                        className="w-24 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-center"
                      />
                      <span className="text-xs text-[var(--text-muted)]">min (5–120). How long a customer&apos;s basket session lasts before expiry.</span>
                    </div>
                  </label>
                </div>

                {/* Verification Rules Settings */}
                <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Basket Verification Rules (Manager+)
                    </h3>
                    <span className="text-[10px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                      Rule Precedence: Flagged Overrides Cutoff
                    </span>
                  </div>

                  {/* Amount Cutoff */}
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                      Auto-Skip Amount Cutoff (₹)
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Disabled (Manual for all)"
                        value={restaurantForm.verification_amount_cutoff}
                        onChange={(event) =>
                          setRestaurantForm((current) => ({
                            ...current,
                            verification_amount_cutoff: event.target.value,
                          }))
                        }
                        className="w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                      />
                      <span className="text-xs text-[var(--text-muted)]">
                        Orders under this amount skip manual verification unless containing a flagged product. Leave blank to require verification for all orders.
                      </span>
                    </div>
                  </label>

                  {/* Flagged Items Selector */}
                  <div className="space-y-2">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                      Flagged Products (Always Require Verification)
                    </span>
                    <p className="text-xs text-[var(--text-muted)]">
                      Products checked below will ALWAYS require manual staff verification at the counter, regardless of order total.
                    </p>
                    {menuItems.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] italic">No products available in catalog.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3">
                        {menuItems.map((item) => {
                          const isFlagged = restaurantForm.flagged_item_ids.includes(item.id);
                          return (
                            <label
                              key={item.id}
                              className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isFlagged}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setRestaurantForm((current) => {
                                      const updated = checked
                                        ? [...current.flagged_item_ids, item.id]
                                        : current.flagged_item_ids.filter((id) => id !== item.id);
                                      return { ...current, flagged_item_ids: updated };
                                    });
                                  }}
                                  className="h-4 w-4 rounded-md border-[var(--border-strong)] text-[var(--accent-brand)] focus:ring-0 accent-[var(--accent-brand)]"
                                />
                                <span className="font-medium text-[var(--text-primary)]">{item.name}</span>
                              </div>
                              <span className="text-[var(--text-muted)] font-mono">{formatRupees(item.price)}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {restaurant && (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Restaurant ID</p>
                    <p className="mt-1 font-mono text-xs text-[var(--text-primary)] select-all break-all">{restaurant.id}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSavingRestaurant}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
                >
                  <Save className="h-4 w-4" />
                  {isSavingRestaurant ? "Saving..." : "Save Settings"}
                </button>
              </form>
            </article>
          </div>
        )}

        {/* ── TAB 5: QR CODES GENERATOR ───────────────────────────────── */}
        {activeTab === "qrcodes" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Table QR Code Generator</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Generate high-quality printable QR codes for customer self-ordering and payments
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              {/* Single QR Generator Form */}
              <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs self-start">
                <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
                  <QrCode className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h2 className="font-display text-base font-bold">Generate Single QR</h2>
                </div>

                <div className="space-y-3">
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Basket Number</span>
                    <input
                      type="text"
                      value={qrTableNumber}
                      onChange={(e) => setQrTableNumber(e.target.value)}
                      placeholder="e.g. 5, 12B, Bar-3"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-semibold"
                    />
                  </label>

                  <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] flex flex-col items-center justify-center text-center space-y-3">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-bold">Target QR Link</span>
                    <p className="text-[10px] font-mono text-[var(--accent-brand)] select-all break-all max-w-full">
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/menu?slug=${restaurant?.slug || "outlet"}&table=${qrTableNumber}`
                        : `/menu?slug=${restaurant?.slug || "outlet"}&table=${qrTableNumber}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.print();
                      }
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
                  >
                    Print QR Code Card
                  </button>
                </div>
              </article>

              {/* Dynamic QR Preview & Printable Card */}
              <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 flex flex-col items-center justify-center space-y-6 shadow-xs min-h-[400px]">
                {/* Print container */}
                <div className="print:m-0 print:p-0 print:border-none print:shadow-none">
                  <div className="w-[300px] rounded-3xl border-4 border-[var(--accent-brand)] bg-white p-6 shadow-md flex flex-col items-center justify-center text-center space-y-5 text-black">
                    {/* Header */}
                    <div className="space-y-1">
                      <h3 className="font-display text-2xl font-black tracking-tight text-[var(--accent-brand)]">
                        {restaurant?.name || "ApnaGreen Basket"}
                      </h3>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                        Scan to Order &amp; Pay
                      </p>
                    </div>

                    {/* QR Code Image */}
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 shadow-2xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                          typeof window !== "undefined"
                            ? `${window.location.origin}/menu?slug=${restaurant?.slug || ""}&table=${qrTableNumber}`
                            : ""
                        )}`}
                        alt={`QR Code for Table ${qrTableNumber}`}
                        className="h-44 w-44 object-contain"
                      />
                    </div>

                    {/* Footer badge */}
                    <div className="rounded-full bg-[var(--accent-brand)] px-5 py-1 text-sm font-black text-white uppercase tracking-wider">
                      Basket #{qrTableNumber}
                    </div>

                    <p className="text-[10px] text-gray-400 font-mono">
                      Powered by ApnaGreen Basket
                    </p>
                  </div>
                </div>
              </article>
            </div>

            {/* Batch QR Generator Sheet Option */}
            <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
                <Layers className="h-5 w-5 text-[var(--accent-brand)]" />
                <h2 className="font-display text-base font-bold">Print Table QR Sheets (Batch Mode)</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 items-end">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Start Basket Number</span>
                  <input
                    type="number"
                    value={batchStart}
                    onChange={(e) => setBatchStart(Number(e.target.value) || 1)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-semibold font-mono"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">End Basket Number</span>
                  <input
                    type="number"
                    value={batchEnd}
                    onChange={(e) => setBatchEnd(Number(e.target.value) || 10)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-semibold font-mono"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      // Trigger batch printing view by generating new print session window
                      const printWindow = window.open("", "_blank");
                      if (printWindow) {
                        const qrCards = [];
                        for (let i = batchStart; i <= batchEnd; i++) {
                          const url = `${window.location.origin}/menu?slug=${restaurant?.slug || ""}&table=${i}`;
                          qrCards.push(`
                            <div style="width: 260px; border: 4px solid #14b8a6; border-radius: 24px; padding: 24px; text-align: center; font-family: system-ui, sans-serif; page-break-inside: avoid; margin: 15px; display: inline-block; background: white; color: black; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                              <h3 style="margin: 0; font-size: 20px; font-weight: 900; color: #14b8a6;">${restaurant?.name || "ApnaGreen Basket"}</h3>
                              <p style="margin: 2px 0 15px 0; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em;">Scan to Order & Pay</p>
                              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" style="width: 170px; height: 170px;" />
                              <div style="background: #14b8a6; color: white; border-radius: 9999px; padding: 4px 16px; font-size: 14px; font-weight: 900; display: inline-block; margin-top: 15px; text-transform: uppercase;">Basket #${i}</div>
                            </div>
                          `);
                        }
                        printWindow.document.write(`
                          <html>
                            <head><title>Print QR Sheet - ${restaurant?.name || "ApnaGreen Basket"}</title></head>
                            <body style="margin:0; padding:20px; background:#f3f4f6; text-align:center;">
                              <div style="margin-bottom: 20px; font-family:system-ui; display:block;" class="no-print">
                                <button onclick="window.print()" style="background:#14b8a6; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:bold; cursor:pointer;">Print QR Codes Sheet</button>
                                <p style="font-size:12px; color:#4b5563;">Tip: Set layout to Landscape or use smaller margins if printing multiple pages.</p>
                              </div>
                              <style>
                                @media print {
                                  .no-print { display: none !important; }
                                  body { background: white !important; padding: 0 !important; }
                                }
                              </style>
                              <div>${qrCards.join("")}</div>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-brand)] hover:border-[var(--accent-brand)]"
                >
                  Generate Printable Sheet
                </button>
              </div>
            </article>
          </div>
        )}

        {/* Variant / Customization Management Modal */}
        {isVariantModalOpen && selectedVariantItemId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-5">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
                    <SlidersHorizontal className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold">Manage Sizes & Customizations</h2>
                    <p className="text-xs text-[var(--text-secondary)] font-semibold">
                      Item: {menuItems.find((i) => i.id === selectedVariantItemId)?.name || "Selected Item"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsVariantModalOpen(false);
                    setEditingVariantId(null);
                    setVariantForm({ name: "", price_delta: "0", is_available: true });
                  }}
                  className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Existing Variants List */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide font-bold text-[var(--text-muted)]">
                  Existing Options / Sizes ({(variantsByItem[selectedVariantItemId] || []).length})
                </p>

                {(variantsByItem[selectedVariantItemId] || []).length === 0 ? (
                  <p className="py-4 text-center text-xs text-[var(--text-muted)] rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                    No sizes or variants created yet. Add options below (e.g. &quot;Half Plate&quot;, &quot;Full Plate&quot;, &quot;Extra Cheese&quot;).
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {(variantsByItem[selectedVariantItemId] || []).map((variant) => (
                      <div
                        key={variant.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--text-primary)]">{variant.name}</span>
                          <span className="font-mono text-xs font-bold text-[var(--accent-brand)]">
                            {parseFloat(variant.price_delta) >= 0
                              ? `+${formatRupees(variant.price_delta)}`
                              : `-${formatRupees(Math.abs(parseFloat(variant.price_delta)))}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void onToggleVariantAvailable(variant)}
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${variant.is_available
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                              }`}
                          >
                            {variant.is_available ? "Available" : "Disabled"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVariantId(variant.id);
                              setVariantForm({
                                name: variant.name,
                                price_delta: variant.price_delta,
                                is_available: variant.is_available,
                              });
                            }}
                            className="p-1 rounded-md text-[var(--accent-brand)] hover:bg-[var(--bg-surface)]"
                            title="Edit Variant"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteVariant(variant.id)}
                            className="p-1 rounded-md text-rose-500 hover:bg-rose-100"
                            title="Delete Variant"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add / Edit Variant Form */}
              <form onSubmit={onSubmitVariant} className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[var(--accent-brand)] uppercase tracking-wide">
                    {editingVariantId ? "Edit Size / Option" : "+ Add Size / Customization"}
                  </p>
                  {editingVariantId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingVariantId(null);
                        setVariantForm({ name: "", price_delta: "0", is_available: true });
                      }}
                      className="text-[11px] text-[var(--text-muted)] hover:text-rose-500 font-semibold"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">Size / Customization Name *</span>
                    <input
                      type="text"
                      value={variantForm.name}
                      onChange={(e) => setVariantForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                      placeholder="e.g. Half Plate, Full Plate, Extra Cheese..."
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">Price Extra (₹)</span>
                    <input
                      type="text"
                      value={variantForm.price_delta}
                      onChange={(e) => setVariantForm((prev) => ({ ...prev, price_delta: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono font-bold text-[var(--accent-brand)]"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={variantForm.is_available}
                      onChange={(e) => setVariantForm((prev) => ({ ...prev, is_available: e.target.checked }))}
                      className="rounded-md border-[var(--border-strong)] text-[var(--accent-brand)] focus:ring-0"
                    />
                    <span>Available for order</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSavingVariant}
                    className="rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                  >
                    {isSavingVariant ? "Saving..." : editingVariantId ? "Update Option" : "+ Save Option"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Offer Management Modal */}
        {isOfferModalOpen && selectedOfferItemId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-5">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30">
                    <Flame className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold">Manage Special Offer</h2>
                    <p className="text-xs text-[var(--text-secondary)] font-semibold">
                      Item: {menuItems.find((i) => i.id === selectedOfferItemId)?.name || "Selected Item"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOfferModalOpen(false)}
                  className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={onSubmitOffer} className="space-y-4">
                {/* Toggle Offer Switch */}
                <label className="flex items-center justify-between rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3.5 cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="font-bold text-sm text-[var(--text-primary)]">Activate Special Offer</span>
                    <p className="text-xs text-[var(--text-muted)]">Displays slashed price and deal badge on customer catalog</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={offerForm.is_on_offer}
                    onChange={(e) => setOfferForm((prev) => ({ ...prev, is_on_offer: e.target.checked }))}
                    className="h-5 w-5 rounded-md border-[var(--border-strong)] text-amber-500 focus:ring-0 accent-amber-500"
                  />
                </label>

                {offerForm.is_on_offer && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Quick Percentage Presets */}
                    {(() => {
                      const currentItem = menuItems.find((i) => i.id === selectedOfferItemId);
                      const origPrice = currentItem ? parseFloat(currentItem.price) : 0;
                      if (!origPrice) return null;
                      return (
                        <div className="space-y-1">
                          <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">
                            Quick Discount Presets (Regular: ₹{origPrice})
                          </span>
                          <div className="flex gap-2">
                            {[10, 20, 25, 30, 50].map((pct) => {
                              const discPrice = (origPrice * (1 - pct / 100)).toFixed(2);
                              return (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() =>
                                    setOfferForm((prev) => ({
                                      ...prev,
                                      offer_price: discPrice,
                                      offer_label: `${pct}% OFF`,
                                    }))
                                  }
                                  className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/10 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition"
                                >
                                  {pct}% OFF
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <label className="block space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">
                        Special Offer Price (₹) *
                      </span>
                      <input
                        type="text"
                        value={offerForm.offer_price}
                        onChange={(e) => setOfferForm((prev) => ({ ...prev, offer_price: e.target.value }))}
                        required={offerForm.is_on_offer}
                        placeholder="e.g. 220"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-mono font-bold text-amber-500"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">
                        Offer Tag / Custom Label
                      </span>
                      <input
                        type="text"
                        value={offerForm.offer_label}
                        onChange={(e) => setOfferForm((prev) => ({ ...prev, offer_label: e.target.value }))}
                        placeholder="e.g. 20% OFF, Today's Pick, Combo Deal"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs font-semibold"
                      />
                    </label>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOfferModalOpen(false)}
                    className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingOffer}
                    className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition"
                  >
                    {isSavingOffer ? "Saving Offer..." : "Save Offer Settings"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: ADD / EDIT STAFF ──────────────────────────────────── */}
        {staffModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h3 className="font-display text-lg font-bold">
                    {editingStaffId ? "Edit Staff Details" : "Add New Staff Member"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setStaffModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={onSubmitStaffMember} className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Full Name</span>
                  <input
                    type="text"
                    value={staffFormState.name}
                    onChange={(e) => setStaffFormState((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder="e.g. Vikram Singh"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Email Address</span>
                  <input
                    type="email"
                    value={staffFormState.email}
                    onChange={(e) => setStaffFormState((prev) => ({ ...prev, email: e.target.value }))}
                    required
                    placeholder="staff@outlet.com"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-mono"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Phone (Optional)</span>
                    <input
                      type="tel"
                      value={staffFormState.phone}
                      onChange={(e) => setStaffFormState((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="+91 9876543210"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-mono"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Role</span>
                    <select
                      value={staffFormState.role}
                      onChange={(e) => setStaffFormState((prev) => ({ ...prev, role: e.target.value as StaffRole }))}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold"
                    >
                      <option value="RESTAURANT_ADMIN">Outlet Admin / Owner</option>
                      <option value="MANAGER">Store Manager</option>
                      <option value="CASHIER">Cashier</option>
                      <option value="WAITER">Store Assistant / Basket Verifier</option>
                      <option value="DELIVERY_BOY">Delivery Executive / Delivery Boy</option>
                      <option value="STAFF">General Staff</option>
                    </select>
                  </label>
                </div>

                {!editingStaffId && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-[var(--border-subtle)]">
                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Password</span>
                      <input
                        type="password"
                        value={staffFormState.password}
                        onChange={(e) => setStaffFormState((prev) => ({ ...prev, password: e.target.value }))}
                        required={!editingStaffId}
                        minLength={6}
                        placeholder="Min 6 characters"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Initial 4-Digit PIN (Optional)</span>
                      <input
                        type="password"
                        maxLength={6}
                        pattern="[0-9]*"
                        value={staffFormState.pin}
                        onChange={(e) => setStaffFormState((prev) => ({ ...prev, pin: e.target.value }))}
                        placeholder="e.g. 1234"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-mono tracking-widest text-center"
                      />
                    </label>
                  </div>
                )}

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setStaffModalOpen(false)}
                    className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingStaff}
                    className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                  >
                    {isSavingStaff ? "Saving Staff..." : editingStaffId ? "Update Staff" : "Provision Staff Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: ADMIN SET PIN ─────────────────────────────────────── */}
        {pinModalOpen && pinTargetStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h3 className="font-display text-lg font-bold">Set 4-Digit PIN</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPinModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={onSubmitSetStaffPin} className="space-y-4">
                <p className="text-xs text-[var(--text-secondary)]">
                  Set 4 to 6 digit quick-switch PIN for <strong>{pinTargetStaff.name}</strong> ({pinTargetStaff.role.replace("_", " ")}):
                </p>

                <label className="block space-y-1">
                  <input
                    type="password"
                    maxLength={6}
                    pattern="[0-9]*"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    required
                    placeholder="••••"
                    autoFocus
                    className="w-full rounded-2xl border-2 border-[var(--accent-brand)] bg-[var(--bg-surface-elevated)] p-3 text-center font-mono text-2xl font-black tracking-widest text-[var(--text-primary)]"
                  />
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPinModalOpen(false)}
                    className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPin || !pinInput}
                    className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:bg-[var(--accent-brand-hover)] transition disabled:opacity-50"
                  >
                    {isSavingPin ? "Saving PIN..." : "Save PIN"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: LOCK-SCREEN PIN QUICK-SWITCH ─────────────────────── */}
        {pinSwitchModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-md space-y-6 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h3 className="font-display text-lg font-bold">Shared Tablet PIN Switch</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPinSwitchModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={onSubmitPinQuickSwitch} className="space-y-5">
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Select Active Staff Member</span>
                  <div className="grid gap-2 grid-cols-2 max-h-48 overflow-y-auto p-1">
                    {staffList.map((member) => {
                      const isSelected = pinSwitchStaffId === member.id;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => setPinSwitchStaffId(member.id)}
                          className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition ${isSelected
                            ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/15 ring-2 ring-[var(--accent-brand)]"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)]"
                            }`}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-brand)]/20 text-[var(--accent-brand)] font-bold text-xs">
                            {member.name[0].toUpperCase()}
                          </div>
                          <div className="truncate">
                            <p className="font-bold text-xs truncate text-[var(--text-primary)]">{member.name}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase font-mono">{member.role.replace("_", " ")}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block space-y-1 text-center">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Enter 4-Digit Staff PIN</span>
                  <input
                    type="password"
                    maxLength={6}
                    pattern="[0-9]*"
                    value={pinSwitchInput}
                    onChange={(e) => setPinSwitchInput(e.target.value)}
                    required
                    placeholder="••••"
                    autoFocus
                    className="w-full max-w-xs mx-auto block rounded-2xl border-2 border-[var(--accent-brand)] bg-[var(--bg-surface-elevated)] p-3 text-center font-mono text-2xl font-black tracking-widest text-[var(--text-primary)]"
                  />
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPinSwitchModalOpen(false)}
                    className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-3 text-xs font-bold text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSwitchingPin || !pinSwitchInput || !pinSwitchStaffId}
                    className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-3 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:bg-[var(--accent-brand-hover)] transition disabled:opacity-50"
                  >
                    {isSwitchingPin ? "Authenticating..." : "Unlock Active Context"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* ── MODAL: CREATE MANUAL BILL (POS DRAWER) ─────────────────── */}
        {createBillModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-[var(--accent-brand)]" />
                  <h3 className="font-display text-lg font-bold">Create New Manual Bill (POS)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateBillModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body: 2 Columns */}
              <div className="flex-1 overflow-y-auto grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
                {/* Left Column: Product Catalog Picker */}
                <div className="lg:col-span-7 p-4 space-y-4 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Select Products</span>
                    <div className="relative flex-1 max-w-[200px]">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        placeholder="Search items..."
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-2.5 text-xs"
                      />
                    </div>
                  </div>

                  {/* Products Grid */}
                  <div className="grid gap-2 sm:grid-cols-2 max-h-[360px] overflow-y-auto pr-1">
                    {menuItems.map((item) => {
                      const itemVariants = variantsByItem[item.id] || [];
                      const itemPriceNum = parseFloat(item.price) || 0;

                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-2 hover:border-[var(--accent-brand)] transition"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-xs text-[var(--text-primary)] truncate">{item.name}</p>
                            <span className="font-mono text-xs font-bold text-[var(--accent-brand)]">₹{itemPriceNum.toFixed(2)}</span>
                          </div>

                          {itemVariants.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {itemVariants.map((v) => {
                                const variantPriceNum = itemPriceNum + (parseFloat(v.price_delta) || 0);
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => {
                                      setDraftCartItems((prev) => {
                                        const existingIdx = prev.findIndex(
                                          (ci) => ci.menu_item_id === item.id && ci.variant_id === v.id
                                        );
                                        if (existingIdx >= 0) {
                                          const updated = [...prev];
                                          updated[existingIdx].quantity += 1;
                                          return updated;
                                        }
                                        return [
                                          ...prev,
                                          {
                                            menu_item_id: item.id,
                                            variant_id: v.id,
                                            item_name: `${item.name} (${v.name})`,
                                            unit_price: variantPriceNum,
                                            quantity: 1,
                                            is_complimentary: false,
                                          },
                                        ];
                                      });
                                    }}
                                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)] hover:border-[var(--accent-brand)]"
                                  >
                                    + {v.name} (₹{variantPriceNum.toFixed(0)})
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDraftCartItems((prev) => {
                                  const existingIdx = prev.findIndex(
                                    (ci) => ci.menu_item_id === item.id && !ci.variant_id
                                  );
                                  if (existingIdx >= 0) {
                                    const updated = [...prev];
                                    updated[existingIdx].quantity += 1;
                                    return updated;
                                  }
                                  return [
                                    ...prev,
                                    {
                                      menu_item_id: item.id,
                                      item_name: item.name,
                                      unit_price: itemPriceNum,
                                      quantity: 1,
                                      is_complimentary: false,
                                    },
                                  ];
                                });
                              }}
                              className="w-full rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] hover:bg-[var(--accent-brand)] hover:text-white py-1.5 text-xs font-bold transition"
                            >
                              + Add Item
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Draft Cart Panel */}
                <div className="lg:col-span-5 p-4 space-y-4 flex flex-col justify-between bg-[var(--bg-surface)]">
                  <div className="space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                      Bill Metadata &amp; Items
                    </span>

                    {/* Metadata fields */}
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Basket #</span>
                        <select
                          value={selectedTable}
                          onChange={(e) => setSelectedTable(e.target.value)}
                          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 text-xs font-bold"
                        >
                          <option value="WALK-IN">WALK-IN (Standalone)</option>
                          {Array.from({ length: 20 }, (_, i) => `Basket #${i + 1}`).map((tbl) => (
                            <option key={tbl} value={tbl}>{tbl}</option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Customer Name</span>
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Optional"
                          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 text-xs"
                        />
                      </label>
                    </div>

                    {/* Cart Items List */}
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {draftCartItems.length === 0 ? (
                        <p className="p-8 text-center text-xs text-[var(--text-muted)]">
                          Cart is empty. Click items on the left to add to bill.
                        </p>
                      ) : (
                        draftCartItems.map((ci, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[var(--text-primary)]">{ci.item_name}</span>
                              <span className="font-mono font-bold text-[var(--accent-brand)]">
                                ₹{(ci.is_complimentary ? 0 : ci.unit_price * ci.quantity).toFixed(2)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 text-[11px]">
                              {/* Quantity Counter */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDraftCartItems((prev) => {
                                      const updated = [...prev];
                                      if (updated[idx].quantity > 1) {
                                        updated[idx].quantity -= 1;
                                      } else {
                                        updated.splice(idx, 1);
                                      }
                                      return updated;
                                    });
                                  }}
                                  className="p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-secondary)]"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="font-mono font-bold">{ci.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDraftCartItems((prev) => {
                                      const updated = [...prev];
                                      updated[idx].quantity += 1;
                                      return updated;
                                    });
                                  }}
                                  className="p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-secondary)]"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>

                              {/* Complimentary Toggle */}
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ci.is_complimentary}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setDraftCartItems((prev) => {
                                      const updated = [...prev];
                                      updated[idx].is_complimentary = checked;
                                      return updated;
                                    });
                                  }}
                                  className="rounded border-[var(--border-strong)]"
                                />
                                <span className="text-[10px] font-bold text-amber-600">Zero Cost</span>
                              </label>

                              <button
                                type="button"
                                onClick={() => {
                                  setDraftCartItems((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="text-rose-500 hover:text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Cart Footer */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                    <div className="flex items-center justify-between font-mono font-black text-sm">
                      <span>Subtotal Amount:</span>
                      <span className="text-lg text-[var(--accent-brand)]">
                        ₹
                        {draftCartItems
                          .reduce(
                            (acc, item) => acc + (item.is_complimentary ? 0 : item.unit_price * item.quantity),
                            0
                          )
                          .toFixed(2)}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateBillModalOpen(false)}
                        className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCreateBill()}
                        disabled={draftCartItems.length === 0}
                        className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition disabled:opacity-50"
                      >
                        Create Bill Draft
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: APPLY DISCOUNT (WITH REASON NOTE) ─────────────────── */}
        {discountModalOpen && discountTargetBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-emerald-500" />
                  <h3 className="font-display text-lg font-bold">Apply Discount</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDiscountModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)] font-sans">Bill ID:</span>
                  <span className="font-bold text-[var(--text-primary)]">#{discountTargetBill.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)] font-sans">Current Subtotal:</span>
                  <span className="font-bold">₹{discountTargetBill.subtotal_amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-4">
                {/* Discount Type Selector */}
                <div className="block space-y-1 text-xs font-bold">
                  <span className="text-[var(--text-muted)] uppercase tracking-wider">Discount Type</span>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)]">
                    {(["PERCENT", "FLAT", "COMPLIMENTARY"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDiscountType(t)}
                        className={`rounded-lg py-1.5 text-[11px] font-bold transition ${discountType === t
                          ? "bg-[var(--accent-brand)] text-white shadow-xs"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                      >
                        {t === "PERCENT" ? "% Percent" : t === "FLAT" ? "Flat (₹)" : "Complimentary"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discount Value Input */}
                {discountType !== "COMPLIMENTARY" && (
                  <label className="block space-y-1 text-xs font-bold">
                    <span className="text-[var(--text-muted)] uppercase tracking-wider">
                      {discountType === "PERCENT" ? "Percentage Discount (%)" : "Flat Discount Amount (₹)"}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={discountType === "PERCENT" ? 100 : discountTargetBill.subtotal_amount}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2.5 text-sm font-mono font-bold"
                    />
                  </label>
                )}

                {/* Mandatory Reason Note */}
                <label className="block space-y-1 text-xs font-bold">
                  <span className="text-[var(--text-muted)] uppercase tracking-wider">
                    Reason Note <span className="text-rose-500">*</span>
                  </span>
                  <textarea
                    rows={2}
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    required
                    placeholder="e.g. VIP Customer / Promo Coupon / Manager Courtesy"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs font-normal"
                  />
                </label>

                {/* Role approval notification note */}
                <p className="text-[11px] text-[var(--text-muted)] italic rounded-xl bg-[var(--bg-surface-elevated)] p-2.5">
                  {(!staffPermissions || staffPermissions.can_manage_staff)
                    ? "✓ You are logged in as Manager/Admin. Discount will be auto-approved immediately."
                    : "ℹ You are logged in as Cashier. Discount will be submitted as PENDING APPROVAL for Manager review."}
                </p>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDiscountModalOpen(false)}
                    className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApplyDiscount()}
                    className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                  >
                    Submit Discount
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: PROCESS PAYMENT (CASH / UPI) ─────────────────────── */}
        {paymentModalOpen && paymentTargetBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-500" />
                  <h3 className="font-display text-lg font-bold">Process Settlement Payment</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Bill Summary */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 font-mono">
                <div className="flex justify-between text-xs text-emerald-800 dark:text-emerald-300 font-sans">
                  <span>Bill #{paymentTargetBill.id.slice(0, 8).toUpperCase()}</span>
                  <span>Basket #{paymentTargetBill.table_number}</span>
                </div>
                <div className="flex justify-between text-lg font-black text-emerald-600 dark:text-emerald-400 border-t border-emerald-500/30 pt-2">
                  <span className="font-sans">Grand Total:</span>
                  <span>₹{paymentTargetBill.total_amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-4">
                <div className="block space-y-1 text-xs font-bold">
                  <span className="text-[var(--text-muted)] uppercase tracking-wider">Select Payment Method</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentMethod("CASH")}
                      className={`rounded-2xl border p-3 flex items-center justify-center gap-2 text-xs font-bold transition ${selectedPaymentMethod === "CASH"
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-600"
                        : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]"
                        }`}
                    >
                      <DollarSign className="h-4 w-4" />
                      CASH PAYMENT
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentMethod("UPI")}
                      className={`rounded-2xl border p-3 flex items-center justify-center gap-2 text-xs font-bold transition ${selectedPaymentMethod === "UPI"
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-600"
                        : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]"
                        }`}
                    >
                      <QrCode className="h-4 w-4" />
                      DIRECT UPI
                    </button>
                  </div>
                </div>

                {/* Cash Tendered & Change Calculator */}
                {selectedPaymentMethod === "CASH" && (
                  <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                    <label className="block space-y-1 text-xs font-bold">
                      <span className="text-[var(--text-muted)] uppercase tracking-wider">Cash Tendered by Customer (₹)</span>
                      <input
                        type="number"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        placeholder={`e.g. ${Math.ceil(paymentTargetBill.total_amount / 100) * 100}`}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-2.5 text-sm font-mono font-bold"
                      />
                    </label>

                    {cashTendered && parseFloat(cashTendered) >= paymentTargetBill.total_amount && (
                      <div className="flex justify-between items-center text-xs font-mono font-bold text-emerald-600 pt-1">
                        <span>Change to Return:</span>
                        <span className="text-sm">₹{(parseFloat(cashTendered) - paymentTargetBill.total_amount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPaymentModalOpen(false)}
                    className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMarkPaid()}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                  >
                    Mark Paid &amp; Settle
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
