import { useCallback, useEffect, useState } from "react";
import type {
  DiscountApproval,
  ManualBill,
} from "@/types";
import type { DraftCartItem } from "../modals/CreateBillDrawer";

type UseBillingManagementProps = {
  accessToken: string | null;
  authHeaders: Record<string, string> | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function useBillingManagement({
  accessToken,
  authHeaders,
  apiRequest,
  setNotice,
  setError,
}: UseBillingManagementProps) {
  const [billsList, setBillsList] = useState<ManualBill[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<DiscountApproval[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [billingStatusFilter, setBillingStatusFilter] = useState<
    "ALL" | "DRAFT" | "PENDING_APPROVAL" | "FINALIZED" | "PAID" | "CANCELLED"
  >("ALL");
  const [billingSearchQuery, setBillingSearchQuery] = useState<string>("");

  // Create Bill Modal State
  const [createBillModalOpen, setCreateBillModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState("WALK-IN");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [draftCartItems, setDraftCartItems] = useState<DraftCartItem[]>([]);

  // Discount Modal State
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

  // Load Billing Data
  const loadBillingData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoadingBilling(true);
    try {
      const [billsRes, approvalsRes, countRes] = await Promise.all([
        apiRequest<ManualBill[]>("/api/billing/bills").catch(() => []),
        apiRequest<DiscountApproval[]>("/api/billing/pending-approvals").catch(() => []),
        apiRequest<{ count: number }>("/api/billing/pending-approvals-count").catch(() => ({ count: 0 })),
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

  // Auto-load billing data when authHeaders is ready
  useEffect(() => {
    if (authHeaders) {
      void loadBillingData();
    }
  }, [authHeaders, loadBillingData]);

  const handleCreateBill = async (proceedToPayment = false) => {
    if (!draftCartItems.length) {
      setError("Please add at least one menu item to the bill.");
      return;
    }
    if (customerPhone.trim()) {
      const cleanPhone = customerPhone.replace(/\D/g, "");
      if (cleanPhone.length < 10) {
        setError("Customer phone number must be at least 10 digits");
        return;
      }
    }
    try {
      const createdBill = await apiRequest<ManualBill>("/api/billing/bills", {
        method: "POST",
        body: JSON.stringify({
          basket_number: selectedTable || "WALK-IN",
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          items: draftCartItems.map((item) => ({
            menu_item_id: item.menu_item_id || null,
            variant_id: item.variant_id || null,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            pricing_type: item.pricing_type || "RETAIL",
            is_complimentary: item.is_complimentary,
          })),
        }),
      });
      setCreateBillModalOpen(false);
      setDraftCartItems([]);
      setCustomerName("");
      setCustomerPhone("");
      void loadBillingData();

      if (proceedToPayment && createdBill) {
        setPaymentTargetBill(createdBill);
        setCashTendered("");
        setSelectedPaymentMethod("CASH");
        setPaymentModalOpen(true);
      } else {
        setNotice("Manual bill created successfully!");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create manual bill.");
    }
  };

  const handleResumeDraft = (bill: ManualBill) => {
    setSelectedTable(bill.basket_number || "WALK-IN");
    setCustomerName(bill.customer_name || "");
    setCustomerPhone(bill.customer_phone || "");
    if (bill.items && bill.items.length > 0) {
      const itemsMapped: DraftCartItem[] = bill.items.map((it: any) => ({
        menu_item_id: it.menu_item_id || "",
        variant_id: it.variant_id || null,
        item_name: it.item_name || it.menu_item?.name || "Item",
        unit_price: typeof it.unit_price === "number" ? it.unit_price : parseFloat(it.unit_price) || 0,
        quantity: typeof it.quantity === "number" ? it.quantity : parseFloat(it.quantity) || 1,
        pricing_type: "RETAIL",
        is_complimentary: !!it.is_complimentary,
      }));
      setDraftCartItems(itemsMapped);
    } else {
      setDraftCartItems([]);
    }
    setCreateBillModalOpen(true);
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

  const handleMarkPaid = async (cashDenominations?: Record<string, number>) => {
    if (!paymentTargetBill) return;
    try {
      await apiRequest<ManualBill>(`/api/billing/bills/${paymentTargetBill.id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          payment_method: selectedPaymentMethod,
          cash_denominations: cashDenominations || null,
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

  const openDiscountModal = (bill: ManualBill) => {
    setDiscountTargetBill(bill);
    setDiscountType("PERCENT");
    setDiscountValue(0);
    setDiscountReason("");
    setDiscountModalOpen(true);
  };

  const openPaymentModal = (bill: ManualBill) => {
    setPaymentTargetBill(bill);
    setSelectedPaymentMethod("CASH");
    setCashTendered("");
    setPaymentModalOpen(true);
  };

  return {
    billsList,
    openDiscountModal,
    openPaymentModal,
    setBillsList,
    pendingApprovals,
    setPendingApprovals,
    pendingApprovalsCount,
    setPendingApprovalsCount,
    isLoadingBilling,
    billingStatusFilter,
    setBillingStatusFilter,
    billingSearchQuery,
    setBillingSearchQuery,
    createBillModalOpen,
    setCreateBillModalOpen,
    selectedTable,
    setSelectedTable,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    draftCartItems,
    setDraftCartItems,
    discountModalOpen,
    setDiscountModalOpen,
    discountTargetBill,
    setDiscountTargetBill,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountReason,
    setDiscountReason,
    paymentModalOpen,
    setPaymentModalOpen,
    paymentTargetBill,
    setPaymentTargetBill,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    cashTendered,
    setCashTendered,
    loadBillingData,
    handleCreateBill,
    handleResumeDraft,
    handleApplyDiscount,
    handleResolveApproval,
    handleMarkPaid,
  };
}
