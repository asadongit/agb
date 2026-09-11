"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  CreditCard,
  Eye,
  FileText,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  UserCheck,
  Wallet,
  X,
} from "lucide-react";
import type { AdminMenuItem } from "../adminTypes";
import type { ManualBill } from "@/types";
import type { DraftCartItem } from "./CreateBillDrawer";
import { generateReturnReceiptPDF } from "@/lib/pdfGenerator";
import { apiRequest , parseUTCDate} from "../adminUtils";

type DirectReturnItem = {
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
};

type CustomerReturnsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  billsList: ManualBill[];
  menuItems: AdminMenuItem[];
  onRequestReturn: (returnData: any) => Promise<void>;
  restaurantName?: string;
  restaurant?: any;
};

export function CustomerReturnsModal({
  isOpen,
  onClose,
  billsList,
  menuItems,
  onRequestReturn,
  restaurantName = "ApnaGreen Basket",
  restaurant,
}: CustomerReturnsModalProps) {
  const [lookupTab, setLookupTab] = useState<"USER_HISTORY" | "INVOICE_NO" | "RETURN_HISTORY">("USER_HISTORY");

  // Search queries
  const [customerSearch, setCustomerSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Mode: Bill-referenced return vs Direct un-billed return
  const [returnMode, setReturnMode] = useState<"BILL_REFERENCED" | "DIRECT_UNBILLED">("BILL_REFERENCED");

  // Selected Bill for bill-referenced return
  const [selectedBill, setSelectedBill] = useState<ManualBill | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Return quantities for bill items: item_id -> quantity to return
  const [returnItemsMap, setReturnItemsMap] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("DEFECTIVE_PRODUCT");

  // Direct return items (when customer has no original bill)
  const [directReturnItems, setDirectReturnItems] = useState<DirectReturnItem[]>([]);
  const [directCustomerName, setDirectCustomerName] = useState("");
  const [directCustomerPhone, setDirectCustomerPhone] = useState("");

  // Exchange items to add
  const [exchangeItems, setExchangeItems] = useState<DraftCartItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<"CASH" | "UPI" | "STORE_CREDIT">("CASH");

  // Cash Denominations for refund (Given to Customer)
  const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const [refundCashDenoms, setRefundCashDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });
  
  // Cash Denominations Inward (Received from Customer)
  const [inwardCashDenoms, setInwardCashDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });

  // Wallet / Analytics State
  const [customerAnalytics, setCustomerAnalytics] = useState<any>(null);
  const [customerPhoneOverride, setCustomerPhoneOverride] = useState("");
  const [customerNameOverride, setCustomerNameOverride] = useState("");
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);

  // Customer Dynamic Suggestions State
  const [customerSuggestions, setCustomerSuggestions] = useState<{ name: string; phone: string; gstin?: string; credit_balance?: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  const [autoConvertCredit, setAutoConvertCredit] = useState(false);
  const [autoRecordDebitOnShortfall, setAutoRecordDebitOnShortfall] = useState(false);
  const [autoRecordExtraChangeAsDebt, setAutoRecordExtraChangeAsDebt] = useState(false);
  const [settleDebit, setSettleDebit] = useState(false);
  const [applyCreditAmount, setApplyCreditAmount] = useState("");
  const [creditCashedOut, setCreditCashedOut] = useState("");

  const handleRefundDenomChange = (denom: number, change: number) => {
    setRefundCashDenoms(prev => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + change);
      return { ...prev, [denom]: next };
    });
  };

  const handleInwardDenomChange = (denom: number, change: number) => {
    setInwardCashDenoms(prev => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + change);
      return { ...prev, [denom]: next };
    });
  };

  const refundDenomTotal = Object.entries(refundCashDenoms).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);
  const inwardDenomTotal = Object.entries(inwardCashDenoms).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);

  // Return bills history state
  const [returnsHistoryList, setReturnsHistoryList] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Customer linkage resolution
  const effectiveCustomerPhone = useMemo(() => {
    if (returnMode === "BILL_REFERENCED") {
      return customerPhoneOverride.trim();
    }
    return directCustomerPhone.trim();
  }, [returnMode, customerPhoneOverride, directCustomerPhone]);

  const effectiveCustomerName = useMemo(() => {
    if (returnMode === "BILL_REFERENCED") {
      return customerNameOverride.trim();
    }
    return directCustomerName.trim();
  }, [returnMode, customerNameOverride, directCustomerName]);

  const isCustomerLinked = useMemo(() => {
    const clean = effectiveCustomerPhone.replace(/\D/g, "");
    return clean.length >= 10;
  }, [effectiveCustomerPhone]);

  // Calculate return credit total (Bill-referenced vs Direct unbilled)
  const returnCreditTotal = returnMode === "BILL_REFERENCED" && selectedBill
    ? (selectedBill.items || []).reduce((sum: number, item: any) => {
        const qty = returnItemsMap[item.id] || 0;
        const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
        return sum + qty * price;
      }, 0)
    : directReturnItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  // Calculate exchange items total
  const exchangeItemsTotal = exchangeItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  // Net payable / refundable
  const netBalance = exchangeItemsTotal - returnCreditTotal;
  const isNetRefund = netBalance < 0;
  const rawRefundOwed = isNetRefund ? Math.abs(netBalance) : 0;
  const rawAdditionalPayable = netBalance > 0 ? netBalance : 0;

  // Debt settled when Mart owes customer refund (Net Refund)
  const refundDebtToSettle = useMemo(() => {
    if (!isNetRefund || !settleDebit || !customerAnalytics || !customerAnalytics.credit_balance || customerAnalytics.credit_balance >= 0) {
      return 0;
    }
    const debt = Math.abs(customerAnalytics.credit_balance);
    return Math.min(rawRefundOwed, debt);
  }, [isNetRefund, settleDebit, customerAnalytics, rawRefundOwed]);

  // Debt added when customer owes Mart money on Exchange (Net Payable)
  const payableDebtToAdd = useMemo(() => {
    if (netBalance <= 0 || !settleDebit || !customerAnalytics || !customerAnalytics.credit_balance || customerAnalytics.credit_balance >= 0) {
      return 0;
    }
    return Math.abs(customerAnalytics.credit_balance);
  }, [netBalance, settleDebit, customerAnalytics]);

  // Store credit applied towards Exchange payable
  const appliedCredit = useMemo(() => {
    if (netBalance <= 0) return 0;
    const val = parseFloat(applyCreditAmount) || 0;
    const maxCredit = customerAnalytics && customerAnalytics.credit_balance > 0 ? customerAnalytics.credit_balance : 0;
    return Math.min(val, rawAdditionalPayable, maxCredit);
  }, [netBalance, applyCreditAmount, customerAnalytics, rawAdditionalPayable]);

  // Store credit cashed out during return
  const cashedOutCredit = useMemo(() => {
    const val = parseFloat(creditCashedOut) || 0;
    const maxCredit = customerAnalytics && customerAnalytics.credit_balance > 0 ? customerAnalytics.credit_balance : 0;
    return Math.min(val, maxCredit);
  }, [creditCashedOut, customerAnalytics]);

  // Effective target cash to pay OUTWARD to customer
  const targetRefundAmt = useMemo(() => {
    if (refundMethod !== "CASH") return 0;
    if (isNetRefund) {
      return Math.max(0, rawRefundOwed - refundDebtToSettle) + cashedOutCredit;
    }
    return cashedOutCredit;
  }, [refundMethod, isNetRefund, rawRefundOwed, refundDebtToSettle, cashedOutCredit]);

  // Effective target cash to receive INWARD from customer (for Exchange payable)
  const targetCollectionAmt = useMemo(() => {
    if (refundMethod !== "CASH" || isNetRefund) return 0;
    return Math.max(0, rawAdditionalPayable - appliedCredit) + payableDebtToAdd;
  }, [refundMethod, isNetRefund, rawAdditionalPayable, appliedCredit, payableDebtToAdd]);

  const currentNetRefundGiven = refundDenomTotal - inwardDenomTotal;
  const currentNetCashReceived = inwardDenomTotal - refundDenomTotal;

  const remainingNeededOutward = useMemo(() => {
    if (isNetRefund) {
      return Math.max(0, targetRefundAmt - currentNetRefundGiven);
    }
    return Math.max(0, currentNetCashReceived - targetCollectionAmt);
  }, [isNetRefund, targetRefundAmt, currentNetRefundGiven, currentNetCashReceived, targetCollectionAmt]);

  const remainingNeededInward = useMemo(() => {
    if (!isNetRefund) {
      return Math.max(0, targetCollectionAmt - currentNetCashReceived);
    }
    return Math.max(0, currentNetRefundGiven - targetRefundAmt);
  }, [isNetRefund, targetCollectionAmt, currentNetCashReceived, currentNetRefundGiven, targetRefundAmt]);

  const smartHighlightedDenoms = useMemo(() => {
    if (remainingNeededOutward <= 0) return new Set<number>();

    const highlighted = new Set<number>();
    const denomsAbove = [...DENOMINATIONS].reverse().filter((d) => d > remainingNeededOutward);

    DENOMINATIONS.forEach((d) => {
      if (d <= remainingNeededOutward) highlighted.add(d);
    });

    denomsAbove.slice(0, 2).forEach((d) => {
      if (refundDenomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (currentNetRefundGiven + d) - targetRefundAmt;
        if (resultingChange < refundDenomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [remainingNeededOutward, currentNetRefundGiven, targetRefundAmt, refundDenomTotal]);

  const smartHighlightedInwardDenoms = useMemo(() => {
    const target = !isNetRefund ? remainingNeededInward : remainingNeededInward;
    if (target <= 0) return new Set<number>();

    const highlighted = new Set<number>();
    const denomsAbove = [...DENOMINATIONS].reverse().filter((d) => d > target);

    DENOMINATIONS.forEach((d) => {
      if (d <= target) highlighted.add(d);
    });

    denomsAbove.slice(0, 2).forEach((d) => {
      if (inwardDenomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (inwardDenomTotal + d) - target;
        if (resultingChange < inwardDenomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [isNetRefund, remainingNeededInward, inwardDenomTotal]);

  const smallestSingleNoteForOutward = useMemo(() => {
    return [...DENOMINATIONS].reverse().find((d) => d >= targetRefundAmt) || null;
  }, [targetRefundAmt]);

  const smallestSingleNoteForInward = useMemo(() => {
    const target = !isNetRefund ? targetCollectionAmt : remainingNeededInward;
    return [...DENOMINATIONS].reverse().find((d) => d >= target) || null;
  }, [isNetRefund, targetCollectionAmt, remainingNeededInward]);

  const handleAutoTapOutwardExact = (targetAmount: number) => {
    let rem = Math.floor(targetAmount);
    const newCounts: Record<number, number> = {
      500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
    };
    for (const d of DENOMINATIONS) {
      if (rem >= d) {
        const cnt = Math.floor(rem / d);
        newCounts[d] = cnt;
        rem %= d;
      }
    }
    setRefundCashDenoms(newCounts);
  };

  const handleAutoTapInwardExact = (targetAmount: number) => {
    let rem = Math.floor(targetAmount);
    const newCounts: Record<number, number> = {
      500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
    };
    for (const d of DENOMINATIONS) {
      if (rem >= d) {
        const cnt = Math.floor(rem / d);
        newCounts[d] = cnt;
        rem %= d;
      }
    }
    setInwardCashDenoms(newCounts);
  };

  const handleResetOutwardNotes = () => {
    setRefundCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
  };

  const handleResetInwardNotes = () => {
    setInwardCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
  };

  const activeOutwardNotesList = useMemo(() => {
    return Object.entries(refundCashDenoms).filter(([_, count]) => count > 0);
  }, [refundCashDenoms]);

  const activeInwardNotesList = useMemo(() => {
    return Object.entries(inwardCashDenoms).filter(([_, count]) => count > 0);
  }, [inwardCashDenoms]);

  const fetchCustomerAnalytics = async (phone: string) => {
    try {
      const data = await apiRequest<any>(`/api/admin/customers/analytics?phone=${phone}&period=all_time`);
      setCustomerAnalytics(data || null);
    } catch (err) {
      console.error("Error fetching customer analytics:", err);
      setCustomerAnalytics(null);
    }
  };

  // Search existing customers dynamically & auto-fetch analytics
  const handlePhoneInputChange = async (val: string) => {
    const clean = val.replace(/\D/g, "");
    setCustomerPhoneOverride(clean);
    setHighlightedSuggestionIndex(-1);

    if (clean.length >= 10 && showPhonePrompt) {
      setShowPhonePrompt(false);
      setError(null);
    }

    if (clean.length === 10) {
      void fetchCustomerAnalytics(clean);
    }

    if (clean.trim().length >= 2) {
      try {
        const data = await apiRequest<{ name: string; phone: string; gstin?: string; credit_balance?: number }[]>(
          `/api/admin/customers?search=${encodeURIComponent(clean.trim())}`
        );
        setCustomerSuggestions(data || []);
        setShowSuggestions(true);
      } catch {
        setCustomerSuggestions([]);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectCustomerSuggestion = (s: { name: string; phone: string }) => {
    setCustomerPhoneOverride(s.phone);
    if (s.name) setCustomerNameOverride(s.name);
    setShowSuggestions(false);
    setHighlightedSuggestionIndex(-1);
    if (showPhonePrompt) {
      setShowPhonePrompt(false);
      setError(null);
    }
    void fetchCustomerAnalytics(s.phone);
  };

  // Synchronize customer phone and name overrides when selectedBill changes
  useEffect(() => {
    if (selectedBill) {
      setCustomerPhoneOverride(selectedBill.customer_phone || "");
      setCustomerNameOverride(selectedBill.customer_name || "");
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIndex(-1);
    }
  }, [selectedBill?.id]);

  // Click outside to close suggestion dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const cleanPhone = effectiveCustomerPhone.replace(/\D/g, "");
    if (cleanPhone.length >= 10) {
      void fetchCustomerAnalytics(cleanPhone);
    } else {
      setCustomerAnalytics(null);
    }
  }, [isOpen, effectiveCustomerPhone]);

  // Fetch return bills history when tab 3 (Return Log) is opened
  useEffect(() => {
    if (isOpen && lookupTab === "RETURN_HISTORY") {
      void fetchReturnsHistory();
    }
  }, [isOpen, lookupTab]);

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedBill(null);
      setReturnItemsMap({});
      setReturnReason("DEFECTIVE_PRODUCT");
      setRefundMethod("CASH");
      setRefundCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setInwardCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setDirectReturnItems([]);
      setDirectCustomerName("");
      setDirectCustomerPhone("");
      setCustomerPhoneOverride("");
      setCustomerNameOverride("");
      setShowPhonePrompt(false);
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      setCustomerAnalytics(null);
      setAutoConvertCredit(false);
      setAutoRecordDebitOnShortfall(false);
      setAutoRecordExtraChangeAsDebt(false);
      setSettleDebit(false);
      setApplyCreditAmount("");
      setCreditCashedOut("");
      setExchangeItems([]);
      setCustomerSearch("");
      setInvoiceSearch("");
      setLookupTab("USER_HISTORY");
      setError(null);
    }
  }, [isOpen]);

  const fetchReturnsHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await apiRequest<any[]>("/api/billing/returns");
      setReturnsHistoryList(data || []);
    } catch (err) {
      console.error("Error loading returns history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  // Filter bills by customer search
  const filteredUserBills = billsList.filter((b) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
      (b.customer_phone && b.customer_phone.includes(q))
    );
  });

  // Filter bill by invoice ID
  const matchingInvoiceBill = billsList.find((b) => {
    if (!invoiceSearch.trim()) return false;
    const q = invoiceSearch.toLowerCase().trim();
    return b.id.toLowerCase().includes(q) || (b.basket_number && b.basket_number.toLowerCase().includes(q));
  });

  const handleToggleReturnItem = (itemId: string, maxQty: number) => {
    setReturnItemsMap((prev) => {
      const current = prev[itemId] || 0;
      if (current >= maxQty) {
        return prev;
      }
      return { ...prev, [itemId]: current + 1 };
    });
  };

  const handleSubReturnItem = (itemId: string) => {
    setReturnItemsMap((prev) => {
      const current = prev[itemId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: current - 1 };
    });
  };

  const handleSubmitReturn = async () => {
    // Compulsory check: If any credit/debit option is engaged or STORE_CREDIT chosen
    const hasCreditDebitEngaged = 
      refundMethod === "STORE_CREDIT" ||
      settleDebit ||
      autoConvertCredit ||
      autoRecordDebitOnShortfall ||
      autoRecordExtraChangeAsDebt ||
      parseFloat(applyCreditAmount || "0") > 0 ||
      parseFloat(creditCashedOut || "0") > 0;

    if (hasCreditDebitEngaged && !isCustomerLinked) {
      setShowPhonePrompt(true);
      setError("Customer Phone Number is required to process Store Credit or Udhaar. Please enter customer phone number.");
      return;
    }

    let finalApplyCredit = appliedCredit;
    let finalCreditCashedOut = cashedOutCredit;
    let finalDebtSettled = 0;
    let finalRecordCredit = 0;
    let finalRecordDebit = 0;

    if (refundMethod === "STORE_CREDIT") {
      const curDebt = (customerAnalytics && customerAnalytics.credit_balance < 0) ? Math.abs(customerAnalytics.credit_balance) : 0;
      if (curDebt > 0) {
        if (rawRefundOwed <= curDebt) {
          finalDebtSettled = rawRefundOwed;
          finalRecordCredit = 0;
        } else {
          finalDebtSettled = curDebt;
          finalRecordCredit = rawRefundOwed - curDebt;
        }
      } else {
        finalRecordCredit = rawRefundOwed;
      }
    } else if (isNetRefund) {
      // Cash/UPI Refund
      if (settleDebit) {
        finalDebtSettled += refundDebtToSettle;
      }
      if (refundMethod === "CASH") {
        const netCashGiven = refundDenomTotal - inwardDenomTotal;
        if (netCashGiven < targetRefundAmt) {
          if (!autoConvertCredit) {
            setError(`Cash refund short by ₹${(targetRefundAmt - netCashGiven).toFixed(2)}. Please tap exact change or enable 'Convert to Store Credit'.`);
            return;
          }
          const unpaidRefund = targetRefundAmt - netCashGiven;
          const curDebt = (customerAnalytics && customerAnalytics.credit_balance < 0)
            ? Math.max(0, Math.abs(customerAnalytics.credit_balance) - finalDebtSettled)
            : 0;
          if (curDebt > 0) {
            if (unpaidRefund <= curDebt) {
              finalDebtSettled += unpaidRefund;
            } else {
              finalDebtSettled += curDebt;
              finalRecordCredit += (unpaidRefund - curDebt);
            }
          } else {
            finalRecordCredit += unpaidRefund;
          }
        } else if (netCashGiven > targetRefundAmt) {
          if (!autoRecordExtraChangeAsDebt) {
            setError(`Extra cash given (₹${(netCashGiven - targetRefundAmt).toFixed(2)} extra). Please adjust notes or enable 'Record extra as Debt'.`);
            return;
          }
          finalRecordDebit += (netCashGiven - targetRefundAmt);
        }
      }
    } else {
      // Exchange (Net Payable by Customer)
      if (settleDebit) {
        finalDebtSettled += payableDebtToAdd;
      }
      if (refundMethod === "CASH") {
        const netCashPaid = inwardDenomTotal - refundDenomTotal;
        if (targetCollectionAmt > 0 && netCashPaid <= 0 && !autoRecordDebitOnShortfall) {
          setError(`Please tap cash denominations received from customer.`);
          return;
        }
        if (netCashPaid < targetCollectionAmt) {
          if (!autoRecordDebitOnShortfall) {
            setError(`Customer cash is short by ₹${(targetCollectionAmt - netCashPaid).toFixed(2)}. Please tap exact cash or enable 'Record shortfall as Debt'.`);
            return;
          }
          finalRecordDebit += (targetCollectionAmt - netCashPaid);
        } else if (netCashPaid > targetCollectionAmt) {
          if (!autoConvertCredit && !settleDebit) {
            setError(`Customer paid ₹${(netCashPaid - targetCollectionAmt).toFixed(2)} extra. Tap change given back or enable 'Convert extra change to Store Credit'.`);
            return;
          }
          if (autoConvertCredit) {
            const extra = netCashPaid - targetCollectionAmt;
            const curDebt = (customerAnalytics && customerAnalytics.credit_balance < 0)
              ? Math.max(0, Math.abs(customerAnalytics.credit_balance) - finalDebtSettled)
              : 0;
            if (curDebt > 0) {
              if (extra <= curDebt) {
                finalDebtSettled += extra;
              } else {
                finalDebtSettled += curDebt;
                finalRecordCredit += (extra - curDebt);
              }
            } else {
              finalRecordCredit += extra;
            }
          }
        }
      }
    }

    const walletPayload = {
      apply_credit: finalApplyCredit,
      record_debit: finalRecordDebit,
      record_credit: finalRecordCredit,
      debt_settled: finalDebtSettled,
      credit_cashed_out: finalCreditCashedOut,
    };

    try {
      if (returnMode === "BILL_REFERENCED") {
        if (!selectedBill) return;
        const returnItemsPayload = Object.entries(returnItemsMap).map(([order_item_id, quantity]) => ({
          order_item_id,
          quantity,
          reason: returnReason,
        }));

        if (returnItemsPayload.length === 0) {
          setError("Please select at least one item to return.");
          return;
        }

        await onRequestReturn({
          order_id: selectedBill.id,
          customer_name: effectiveCustomerName || null,
          customer_phone: effectiveCustomerPhone || null,
          return_items: returnItemsPayload,
          exchange_items: exchangeItems,
          refund_payment_method: refundMethod,
          refund_cash_denominations: refundMethod === "CASH" ? refundCashDenoms : undefined,
          inward_cash_denominations: refundMethod === "CASH" ? inwardCashDenoms : undefined,
          notes: returnReason,
          ...walletPayload,
        });
      } else {
        // Direct Unbilled Return
        if (directReturnItems.length === 0) {
          setError("Please add at least one store item for direct return.");
          return;
        }

        const returnItemsPayload = directReturnItems.map((item) => ({
          menu_item_id: item.menu_item_id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          reason: returnReason,
        }));

        await onRequestReturn({
          order_id: null,
          customer_name: effectiveCustomerName || null,
          customer_phone: effectiveCustomerPhone || null,
          return_items: returnItemsPayload,
          exchange_items: exchangeItems,
          refund_payment_method: refundMethod,
          refund_cash_denominations: refundMethod === "CASH" ? refundCashDenoms : undefined,
          inward_cash_denominations: refundMethod === "CASH" ? inwardCashDenoms : undefined,
          notes: returnReason,
          ...walletPayload,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to process return.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full h-full max-w-none max-h-none flex flex-col rounded-none border-none bg-[var(--bg-surface)] overflow-hidden relative">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-500/10 p-2.5 shadow-sm border border-purple-500/20">
              <RotateCcw className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)]">Customer Returns & Exchanges</h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-1 tracking-wide">
                Process returns, issue store credit, or direct exchange.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2.5 flex items-center justify-between text-sm font-bold text-rose-500 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full bg-rose-500 p-0.5 text-[var(--bg-surface)]">
                <X className="h-3.5 w-3.5" />
              </span>
              {error}
            </div>
            <button type="button" onClick={() => setError(null)} className="opacity-70 hover:opacity-100 uppercase text-[10px] tracking-wider px-2 py-1 rounded bg-rose-500/20">
              Dismiss
            </button>
          </div>
        )}

        {/* Content Body: 3:7 ratio */}
        <div className="flex flex-1 overflow-hidden min-h-0 bg-[var(--bg-body)] grid lg:grid-cols-[30%_70%] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left Column (30%): Fixed Header/Tabs/Search, Only Middle Box Scrollable */}
          <div className="p-5 flex flex-col h-full overflow-hidden space-y-4">
            {/* 3 Lookup Options Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)] flex-shrink-0">
              <button
                type="button"
                onClick={() => setLookupTab("USER_HISTORY")}
                className={`rounded-xl py-2 px-1 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "USER_HISTORY"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <UserCheck className="h-4 w-4" />
                <span>1. User History</span>
              </button>
              <button
                type="button"
                onClick={() => setLookupTab("INVOICE_NO")}
                className={`rounded-xl py-2 px-1 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "INVOICE_NO"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Barcode className="h-4 w-4" />
                <span>2. Invoice No</span>
              </button>
              <button
                type="button"
                onClick={() => setLookupTab("RETURN_HISTORY")}
                className={`rounded-xl py-2 px-1 text-xs font-bold transition flex flex-col items-center gap-1 ${
                  lookupTab === "RETURN_HISTORY"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>3. Return Log</span>
              </button>
            </div>

            {/* Search Input based on active lookup option */}
            {lookupTab === "USER_HISTORY" && (
              <div className="relative flex-shrink-0">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search customer phone or name..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-sky-400 outline-none"
                />
              </div>
            )}

            {lookupTab === "INVOICE_NO" && (
              <div className="relative flex-shrink-0">
                <Barcode className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Enter or scan Bill / Invoice ID (e.g. 59C8D...)"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs font-mono text-[var(--text-primary)] focus:border-sky-400 outline-none"
                />
              </div>
            )}

            {/* Scrollable Middle List Box */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {lookupTab === "RETURN_HISTORY" ? (
                isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-12 text-xs text-[var(--text-muted)] space-y-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                    <span>Loading Return Bills History...</span>
                  </div>
                ) : returnsHistoryList.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] text-center py-12">No past return bills found.</p>
                ) : (
                  returnsHistoryList.map((ret) => (
                    <div
                      key={ret.id}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-2"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-sky-400">{ret.return_number}</span>
                        <span className="font-mono font-bold text-[var(--text-primary)]">
                          ₹{ret.total_refund_amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)]">
                        <span>Orig Bill: {ret.original_bill_number}</span>
                        <span>{parseUTCDate(ret.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
                        <span className="text-[11px] text-[var(--text-secondary)] font-semibold">
                          {ret.customer_name || "Walk-In Customer"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "view")}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-bold text-sky-400 hover:bg-sky-500/20"
                          >
                            <Eye className="h-3 w-3" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "download")}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-bold text-[var(--text-primary)] hover:border-sky-400"
                          >
                            <Printer className="h-3 w-3" />
                            <span>Print</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : lookupTab === "INVOICE_NO" ? (
                matchingInvoiceBill ? (
                  <div
                    onClick={() => {
                      setReturnMode("BILL_REFERENCED");
                      setSelectedBill(matchingInvoiceBill);
                      setReturnItemsMap({});
                    }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition ${
                      selectedBill?.id === matchingInvoiceBill.id && returnMode === "BILL_REFERENCED"
                        ? "border-sky-500/40 bg-sky-500/10"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-sky-400/60"
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono font-bold text-sky-400">
                        Bill #{matchingInvoiceBill.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="font-mono font-bold">₹{matchingInvoiceBill.total_amount.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] font-bold mt-1">
                      {matchingInvoiceBill.customer_name || "Walk-In Customer"} ({matchingInvoiceBill.customer_phone || "No Phone"})
                    </p>
                    {((matchingInvoiceBill as any).credit_applied > 0 || (matchingInvoiceBill as any).debit_applied > 0 || (matchingInvoiceBill as any).debt_settled > 0 || (matchingInvoiceBill as any).credit_awarded > 0) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(matchingInvoiceBill as any).credit_applied > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Cr Used: ₹{(matchingInvoiceBill as any).credit_applied}
                          </span>
                        )}
                        {(matchingInvoiceBill as any).debit_applied > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Udhaar: ₹{(matchingInvoiceBill as any).debit_applied}
                          </span>
                        )}
                        {(matchingInvoiceBill as any).debt_settled > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Debt Settled: ₹{(matchingInvoiceBill as any).debt_settled}
                          </span>
                        )}
                        {(matchingInvoiceBill as any).credit_awarded > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            Cr Added: ₹{(matchingInvoiceBill as any).credit_awarded}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] text-center py-12">
                    Enter a valid invoice ID to view bill details.
                  </p>
                )
              ) : filteredUserBills.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-12">No matching paid bills found.</p>
              ) : (
                filteredUserBills.map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => {
                      setReturnMode("BILL_REFERENCED");
                      setSelectedBill(bill);
                      setReturnItemsMap({});
                    }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition space-y-1 ${
                      selectedBill?.id === bill.id && returnMode === "BILL_REFERENCED"
                        ? "border-sky-500/40 bg-sky-500/10"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-sky-400/60"
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono font-bold text-sky-400">
                        Bill #{bill.id.slice(0, 8).toUpperCase()} • {bill.basket_number && bill.basket_number.toUpperCase().includes("WALK") ? "Walk-In" : `Basket #${bill.basket_number}`}
                      </span>
                      <span className="font-mono font-bold text-[var(--text-primary)]">
                        ₹{bill.total_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)]">
                      <span>{bill.customer_name || "Walk-In"} ({bill.customer_phone || "N/A"})</span>
                      <span>{parseUTCDate(bill.created_at).toLocaleDateString()}</span>
                    </div>
                    {((bill as any).credit_applied > 0 || (bill as any).debit_applied > 0 || (bill as any).debt_settled > 0 || (bill as any).credit_awarded > 0) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(bill as any).credit_applied > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Cr Used: ₹{(bill as any).credit_applied}
                          </span>
                        )}
                        {(bill as any).debit_applied > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Udhaar: ₹{(bill as any).debit_applied}
                          </span>
                        )}
                        {(bill as any).debt_settled > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Debt Settled: ₹{(bill as any).debt_settled}
                          </span>
                        )}
                        {(bill as any).credit_awarded > 0 && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            Cr Added: ₹{(bill as any).credit_awarded}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column (70%): Return Items Selector & Summary (Fixed Header/Footer, Middle Scrollable) */}
          <div className="p-5 flex flex-col h-full overflow-hidden justify-between space-y-4">
            {!selectedBill ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--text-muted)] text-center space-y-2 py-16">
                <RotateCcw className="h-8 w-8 text-sky-400/60 animate-bounce" />
                <p className="font-semibold text-sm">Select a bill from the left to initiate Return or Exchange</p>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1">
                {/* Header Block */}
                <div className="border-b border-[var(--border-subtle)] pb-2 flex justify-between items-center flex-shrink-0">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Selected Original Bill
                    </span>
                    <span className="font-mono font-bold text-sky-400 text-xs">
                      #{selectedBill.id.slice(0, 8).toUpperCase()} • {effectiveCustomerName || "Walk-In"}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[var(--text-primary)]">
                    Original Total: ₹{selectedBill.total_amount.toFixed(2)}
                  </span>
                </div>

                {/* Customer Link Card (Compulsory for Store Credit / Udhaar / Wallet) */}
                <div
                  className={`rounded-2xl border p-3 transition-all space-y-2 ${
                    showPhonePrompt && !isCustomerLinked
                      ? "border-rose-500/60 bg-rose-500/10 ring-2 ring-rose-500/30"
                      : isCustomerLinked
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className={`h-4 w-4 ${isCustomerLinked ? "text-emerald-400" : "text-[var(--text-muted)]"}`} />
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {isCustomerLinked ? "Customer Linked" : "Link Customer (Required for Udhaar / Store Credit)"}
                      </span>
                    </div>
                    {isCustomerLinked ? (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                        ✓ {effectiveCustomerPhone}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-rose-400">
                        * Walk-In Bill
                      </span>
                    )}
                  </div>

                  {/* Input fields when bill has no phone or cashier overrides or prompted */}
                  {(!selectedBill.customer_phone || customerPhoneOverride || showPhonePrompt) && (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
                      <div className="relative" ref={suggestionsRef}>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1">
                          Customer Mobile (10 digits) *
                        </label>
                        <input
                          type="tel"
                          maxLength={10}
                          placeholder="e.g. 9876543210"
                          value={customerPhoneOverride}
                          onChange={(e) => handlePhoneInputChange(e.target.value)}
                          onFocus={() => {
                            const currentVal = customerPhoneOverride.trim();
                            if (currentVal.length >= 2) {
                              setShowSuggestions(true);
                              if (customerSuggestions.length === 0) {
                                void handlePhoneInputChange(currentVal);
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (!showSuggestions || customerSuggestions.length === 0) return;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setHighlightedSuggestionIndex((prev) => Math.min(prev + 1, customerSuggestions.length - 1));
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setHighlightedSuggestionIndex((prev) => Math.max(prev - 1, -1));
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              if (highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < customerSuggestions.length) {
                                handleSelectCustomerSuggestion(customerSuggestions[highlightedSuggestionIndex]);
                              }
                            } else if (e.key === "Escape") {
                              setShowSuggestions(false);
                            }
                          }}
                          className={`w-full rounded-xl border px-2.5 py-1.5 text-xs font-mono font-bold bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 ${
                            showPhonePrompt && !isCustomerLinked
                              ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/30"
                              : "border-[var(--border-strong)] focus:border-sky-400 focus:ring-sky-400/30"
                          }`}
                        />
                        {customerPhoneOverride && customerPhoneOverride.length < 10 && (
                          <span className="text-[10px] text-rose-400 block mt-0.5">
                            Min 10 digits ({customerPhoneOverride.length}/10)
                          </span>
                        )}

                        {/* Customer Dynamic Suggestion Dropdown */}
                        {showSuggestions && customerSuggestions.length > 0 && (
                          <div className="absolute left-0 top-full mt-1.5 z-50 w-full sm:w-[calc(200%+0.5rem)] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-1.5 shadow-2xl max-h-52 overflow-y-auto space-y-1">
                            {customerSuggestions.map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSelectCustomerSuggestion(s)}
                                onMouseEnter={() => setHighlightedSuggestionIndex(i)}
                                className={`w-full text-left rounded-lg px-2.5 py-2 text-xs transition cursor-pointer flex items-center justify-between gap-2.5 ${
                                  highlightedSuggestionIndex === i
                                    ? "bg-sky-500/20 border border-sky-500/40 text-white"
                                    : "hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-transparent"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="h-6 w-6 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                                    {(s.name || "C").charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold truncate text-[var(--text-primary)]">{s.name || "Customer"}</p>
                                    <p className="font-mono text-[10px] text-[var(--text-muted)]">{s.phone}</p>
                                  </div>
                                </div>
                                {typeof s.credit_balance === "number" && s.credit_balance !== 0 && (
                                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    s.credit_balance > 0
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                      : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                  }`}>
                                    {s.credit_balance > 0 ? `+₹${s.credit_balance.toFixed(2)} Cr` : `-₹${Math.abs(s.credit_balance).toFixed(2)} Debt`}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1">
                          Customer Name (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Rahul Sharma"
                          value={customerNameOverride}
                          onChange={(e) => setCustomerNameOverride(e.target.value)}
                          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] focus:border-sky-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Line Items to select for return */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                    Select Bill Items to Return:
                  </span>

                  {(selectedBill.items || []).map((item: any) => {
                    const retQty = returnItemsMap[item.id] || 0;
                    const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
                    const totalQty = typeof item.quantity === "number" ? item.quantity : parseFloat(item.quantity) || 1;
                    const returnedQty = typeof item.returned_quantity === "number" ? item.returned_quantity : parseFloat(item.returned_quantity) || 0;
                    const maxQty = Math.max(0, totalQty - returnedQty);
                    const isFullyReturned = maxQty <= 0;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-3 flex items-center justify-between text-xs transition ${
                          retQty > 0
                            ? "border-sky-500/40 bg-sky-500/10"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
                        } ${isFullyReturned ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">{item.item_name} {isFullyReturned && "(Fully Returned)"}</p>
                          <p className="font-mono text-[11px] text-[var(--text-muted)]">
                            ₹{price.toFixed(2)} × {totalQty} bought {returnedQty > 0 && `(${returnedQty} returned)`}
                          </p>
                        </div>

                        {!isFullyReturned && (
                          <div className="flex items-center gap-2">
                            {retQty > 0 && (
                              <button
                                type="button"
                                onClick={() => handleSubReturnItem(item.id)}
                                className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                            )}
                            <span className="font-mono font-bold w-6 text-center text-sky-400">
                              {retQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleReturnItem(item.id, maxQty)}
                              className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Return Reason & Refund Method */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Return Reason</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <option value="DEFECTIVE_PRODUCT">Defective / Damaged</option>
                      <option value="EXPIRED_ITEM">Expired Item</option>
                      <option value="WRONG_ITEM">Wrong Item Purchased</option>
                      <option value="CUSTOMER_CHANGE_OF_MIND">Customer Changed Mind</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Refund Method</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <option value="CASH">Cash Refund</option>
                      <option value="UPI">UPI Refund</option>
                      <option value="STORE_CREDIT">Store Credit Voucher</option>
                    </select>
                  </div>
                </div>

                {/* Store Credit Voucher Explanation Banner */}
                {refundMethod === "STORE_CREDIT" && (
                  <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-sky-400">
                      <Wallet className="h-4 w-4" />
                      <span>Store Credit Voucher Selected</span>
                    </div>
                    <p className="text-[var(--text-secondary)] text-[11px] leading-relaxed">
                      No cash will be dispensed from the cash drawer. The net refund amount of{" "}
                      <span className="font-mono font-bold text-sky-400">₹{rawRefundOwed.toFixed(2)}</span> will be safely deposited into the customer's store credit wallet.
                    </p>
                    {customerAnalytics && customerAnalytics.credit_balance < 0 && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
                        <div>
                          <p className="font-bold">Automatic Debt Clearance:</p>
                          <p>
                            Customer has an outstanding debt of ₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)}.{" "}
                            {rawRefundOwed <= Math.abs(customerAnalytics.credit_balance) ? (
                              <>₹{rawRefundOwed.toFixed(2)} will be used to clear existing debt (remaining debt: ₹{(Math.abs(customerAnalytics.credit_balance) - rawRefundOwed).toFixed(2)}).</>
                            ) : (
                              <>₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)} will completely clear the debt, and remaining ₹{(rawRefundOwed - Math.abs(customerAnalytics.credit_balance)).toFixed(2)} will be added as positive Store Credit.</>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    {!isCustomerLinked && (
                      <p className="text-rose-400 font-bold text-[11px] flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Please enter customer mobile number above to issue Store Credit.
                      </p>
                    )}
                  </div>
                )}

                {/* Denomination Note Tapping Section (CASH Mode) */}
                {refundMethod === "CASH" && (
                  <div className="pt-2 border-t border-[var(--border-subtle)] space-y-4">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Outward Cash Section (Cash Given to Customer) */}
                      <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3 space-y-2.5">
                        <div className="flex justify-between items-center text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          <span className="flex items-center gap-2 text-[var(--text-primary)]">
                            {isNetRefund ? "Refund Given (Outward)" : "Change Given Back (Outward)"}
                          </span>
                          <span className="font-mono text-sm font-black text-sky-400">Total: ₹{refundDenomTotal}</span>
                        </div>

                        {remainingNeededOutward > 0 && (
                          <div className="text-center bg-[var(--bg-surface)] rounded-xl py-1.5 border border-[var(--border-strong)]">
                            <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">
                              Need <span className="text-lg font-black text-sky-400">₹{remainingNeededOutward.toFixed(2)}</span> more
                            </span>
                          </div>
                        )}

                        {/* Quick Auto-Tap Shortcuts Bar */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] whitespace-nowrap">
                            Quick Auto-Tap:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAutoTapOutwardExact(targetRefundAmt)}
                            className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-mono font-bold text-sky-400 hover:border-sky-400 hover:bg-sky-500/10 transition whitespace-nowrap"
                            title="Auto-fill exact note breakdown"
                          >
                            Exact ₹{targetRefundAmt.toFixed(2)}
                          </button>
                          {smallestSingleNoteForOutward && (
                            <button
                              type="button"
                              onClick={() => handleAutoTapOutwardExact(smallestSingleNoteForOutward)}
                              className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)] hover:border-sky-400 hover:text-sky-400 transition whitespace-nowrap"
                              title={`Auto-fill single ₹${smallestSingleNoteForOutward} note`}
                            >
                              1× ₹{smallestSingleNoteForOutward} Note
                            </button>
                          )}
                        </div>

                        {/* 3x3 Grid */}
                        <div className="grid grid-cols-3 gap-2">
                          {DENOMINATIONS.map((d) => {
                            const isSmartHighlight = smartHighlightedDenoms.has(d);
                            const count = refundCashDenoms[d] || 0;
                            return (
                              <div
                                key={`outward-${d}`}
                                className={`relative rounded-xl flex font-mono transition font-black border-2 ${
                                  count > 0
                                    ? "border-sky-500 bg-sky-500 text-white ring-2 ring-sky-500/30 shadow-md"
                                    : isSmartHighlight
                                      ? "border-sky-500 bg-sky-500/10 text-sky-400 ring-2 ring-sky-500/50 shadow-sm scale-[1.02] hover:bg-sky-500/20"
                                      : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-70 hover:opacity-100 hover:border-[var(--text-muted)]"
                                }`}
                              >
                                {count > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRefundDenomChange(d, -1);
                                    }}
                                    className="flex items-center justify-center px-1.5 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md"
                                    title={`Remove 1× ₹${d}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRefundDenomChange(d, 1)}
                                  className="flex-1 py-2.5 px-2 text-center text-base"
                                >
                                  ₹{d}
                                </button>
                                {count > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-slate-950 text-white text-[11px] font-black border border-white pointer-events-none">
                                    {count}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Active Breakdown Chips */}
                        {activeOutwardNotesList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">
                              Breakdown:
                            </span>
                            {activeOutwardNotesList.map(([denomStr, count]) => {
                              const denomNum = Number(denomStr);
                              return (
                                <span
                                  key={`outward-chip-${denomStr}`}
                                  className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)]"
                                >
                                  ₹{denomStr} × {count}
                                  <button
                                    type="button"
                                    onClick={() => handleRefundDenomChange(denomNum, -1)}
                                    className="ml-0.5 text-[var(--text-muted)] hover:text-rose-400"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                            <button
                              type="button"
                              onClick={handleResetOutwardNotes}
                              className="ml-auto text-[10px] font-bold text-rose-400 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inward Cash Section (Cash Received from Customer) */}
                      <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3 space-y-2.5">
                        <div className="flex justify-between items-center text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          <span className="flex items-center gap-2 text-[var(--text-primary)]">
                            {isNetRefund ? "Change / Cash Received (Inward)" : "Cash Received from Customer (Inward)"}
                          </span>
                          <span className="font-mono text-sm font-black text-emerald-400">Total: ₹{inwardDenomTotal}</span>
                        </div>

                        {remainingNeededInward > 0 && (
                          <div className="text-center bg-[var(--bg-surface)] rounded-xl py-1.5 border border-[var(--border-strong)]">
                            <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">
                              Need <span className="text-lg font-black text-emerald-400">₹{remainingNeededInward.toFixed(2)}</span> more
                            </span>
                          </div>
                        )}

                        {/* Quick Auto-Tap Shortcuts Bar */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] whitespace-nowrap">
                            Quick Auto-Tap:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAutoTapInwardExact(targetCollectionAmt > 0 ? targetCollectionAmt : remainingNeededInward)}
                            className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10 transition whitespace-nowrap"
                            title="Auto-fill exact note breakdown"
                          >
                            Exact ₹{(targetCollectionAmt > 0 ? targetCollectionAmt : remainingNeededInward).toFixed(2)}
                          </button>
                          {smallestSingleNoteForInward && (
                            <button
                              type="button"
                              onClick={() => handleAutoTapInwardExact(smallestSingleNoteForInward)}
                              className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)] hover:border-emerald-400 hover:text-emerald-400 transition whitespace-nowrap"
                              title={`Auto-fill single ₹${smallestSingleNoteForInward} note`}
                            >
                              1× ₹{smallestSingleNoteForInward} Note
                            </button>
                          )}
                        </div>

                        {/* 3x3 Grid */}
                        <div className="grid grid-cols-3 gap-2">
                          {DENOMINATIONS.map((d) => {
                            const isSmartHighlight = smartHighlightedInwardDenoms.has(d);
                            const count = inwardCashDenoms[d] || 0;
                            return (
                              <div
                                key={`inward-${d}`}
                                className={`relative rounded-xl flex font-mono transition font-black border-2 ${
                                  count > 0
                                    ? "border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-500/30 shadow-md"
                                    : isSmartHighlight
                                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-2 ring-emerald-500/50 shadow-sm scale-[1.02] hover:bg-emerald-500/20"
                                      : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-70 hover:opacity-100 hover:border-[var(--text-muted)]"
                                }`}
                              >
                                {count > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInwardDenomChange(d, -1);
                                    }}
                                    className="flex items-center justify-center px-1.5 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleInwardDenomChange(d, 1)}
                                  className="flex-1 py-2.5 px-2 text-center text-base"
                                >
                                  ₹{d}
                                </button>
                                {count > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-slate-950 text-white text-[11px] font-black border border-white pointer-events-none">
                                    {count}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Active Breakdown Chips */}
                        {activeInwardNotesList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">
                              Breakdown:
                            </span>
                            {activeInwardNotesList.map(([denomStr, count]) => {
                              const denomNum = Number(denomStr);
                              return (
                                <span
                                  key={`inward-chip-${denomStr}`}
                                  className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)]"
                                >
                                  ₹{denomStr} × {count}
                                  <button
                                    type="button"
                                    onClick={() => handleInwardDenomChange(denomNum, -1)}
                                    className="ml-0.5 text-[var(--text-muted)] hover:text-rose-400"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                            <button
                              type="button"
                              onClick={handleResetInwardNotes}
                              className="ml-auto text-[10px] font-bold text-rose-400 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Balance Card */}
                <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-[var(--text-muted)]">
                    <span>Return Items Total:</span>
                    <span className="font-bold text-sky-400">₹{returnCreditTotal.toFixed(2)}</span>
                  </div>
                  {exchangeItemsTotal > 0 && (
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Exchange Items Total:</span>
                      <span className="font-bold text-[var(--text-primary)]">₹{exchangeItemsTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span>Net Transaction Base:</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {isNetRefund ? `Refund Owed: ₹${rawRefundOwed.toFixed(2)}` : `Payable by Customer: ₹${rawAdditionalPayable.toFixed(2)}`}
                    </span>
                  </div>

                  {/* Wallet Adjustments in Breakdown */}
                  {refundDebtToSettle > 0 && (
                    <div className="flex justify-between text-emerald-400 text-[11px]">
                      <span>Less Debt Settled from Refund:</span>
                      <span className="font-bold">-₹{refundDebtToSettle.toFixed(2)}</span>
                    </div>
                  )}
                  {cashedOutCredit > 0 && (
                    <div className="flex justify-between text-amber-400 text-[11px]">
                      <span>Add Store Credit Cash-Out:</span>
                      <span className="font-bold">+₹{cashedOutCredit.toFixed(2)}</span>
                    </div>
                  )}
                  {appliedCredit > 0 && (
                    <div className="flex justify-between text-emerald-400 text-[11px]">
                      <span>Less Store Credit Applied:</span>
                      <span className="font-bold">-₹{appliedCredit.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Live Net Cash Tapped Status */}
                  {refundMethod === "CASH" && (refundDenomTotal > 0 || inwardDenomTotal > 0) && (
                    <div className="flex justify-between items-center text-xs border-t border-[var(--border-subtle)] pt-1.5 font-bold font-mono">
                      <span className="text-[var(--text-muted)]">
                        {isNetRefund ? "Net Cash Dispensed (Out - In):" : "Net Cash Received (In - Out):"}
                      </span>
                      <span className={
                        (isNetRefund ? (refundDenomTotal - inwardDenomTotal === targetRefundAmt) : (inwardDenomTotal - refundDenomTotal === targetCollectionAmt))
                          ? "text-emerald-400 font-black"
                          : "text-amber-400 font-black"
                      }>
                        ₹{Math.abs(refundDenomTotal - inwardDenomTotal).toFixed(2)}
                        {isNetRefund && (refundDenomTotal - inwardDenomTotal !== targetRefundAmt) && (
                          <span className="text-[10px] font-normal text-amber-400/80 ml-1">
                            ({refundDenomTotal - inwardDenomTotal > targetRefundAmt ? `₹${(refundDenomTotal - inwardDenomTotal - targetRefundAmt).toFixed(2)} extra given` : `₹${(targetRefundAmt - (refundDenomTotal - inwardDenomTotal)).toFixed(2)} short`})
                          </span>
                        )}
                        {!isNetRefund && (inwardDenomTotal - refundDenomTotal !== targetCollectionAmt) && (
                          <span className="text-[10px] font-normal text-amber-400/80 ml-1">
                            ({inwardDenomTotal - refundDenomTotal > targetCollectionAmt ? `₹${(inwardDenomTotal - refundDenomTotal - targetCollectionAmt).toFixed(2)} extra paid` : `₹${(targetCollectionAmt - (inwardDenomTotal - refundDenomTotal)).toFixed(2)} short`})
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-[var(--border-subtle)] pt-2 font-bold font-sans text-xs">
                    <span className="text-[var(--text-primary)]">
                      {refundMethod === "STORE_CREDIT"
                        ? "Total Store Credit Awarded:"
                        : isNetRefund
                        ? "Net Cash to Dispense to Customer:"
                        : "Net Cash to Collect from Customer:"}
                    </span>
                    <span className="font-mono text-base font-black text-sky-400">
                      ₹{refundMethod === "STORE_CREDIT"
                        ? rawRefundOwed.toFixed(2)
                        : isNetRefund
                        ? targetRefundAmt.toFixed(2)
                        : targetCollectionAmt.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* --- CUSTOMER WALLET & CASH ADJUSTMENTS --- */}
                {isCustomerLinked && customerAnalytics ? (
                  <div className="space-y-3 mt-3 border-t border-[var(--border-subtle)] pt-3">
                    {/* Live Wallet Balance UI */}
                    {(() => {
                      let projectedBalance = customerAnalytics.credit_balance || 0;

                      if (refundMethod === "STORE_CREDIT") {
                        const debt = customerAnalytics.credit_balance < 0 ? Math.abs(customerAnalytics.credit_balance) : 0;
                        if (debt > 0) {
                          const settled = Math.min(rawRefundOwed, debt);
                          const added = Math.max(0, rawRefundOwed - debt);
                          projectedBalance = -debt + settled + added;
                        } else {
                          projectedBalance += rawRefundOwed;
                        }
                      } else if (isNetRefund) {
                        if (refundDebtToSettle > 0) {
                          projectedBalance += refundDebtToSettle;
                        }
                        if (cashedOutCredit > 0) {
                          projectedBalance -= cashedOutCredit;
                        }
                        if (refundMethod === "CASH") {
                          const netCashGiven = refundDenomTotal - inwardDenomTotal;
                          if (netCashGiven < targetRefundAmt && autoConvertCredit) {
                            projectedBalance += (targetRefundAmt - netCashGiven);
                          } else if (netCashGiven > targetRefundAmt && autoRecordExtraChangeAsDebt) {
                            projectedBalance -= (netCashGiven - targetRefundAmt);
                          }
                        }
                      } else {
                        if (appliedCredit > 0) {
                          projectedBalance -= appliedCredit;
                        }
                        if (payableDebtToAdd > 0 && settleDebit) {
                          projectedBalance += payableDebtToAdd;
                        }
                        if (refundMethod === "CASH") {
                          const netCashPaid = inwardDenomTotal - refundDenomTotal;
                          if (netCashPaid < targetCollectionAmt && autoRecordDebitOnShortfall) {
                            projectedBalance -= (targetCollectionAmt - netCashPaid);
                          } else if (netCashPaid > targetCollectionAmt) {
                            const extra = netCashPaid - targetCollectionAmt;
                            if (autoConvertCredit) projectedBalance += extra;
                          }
                        }
                      }

                      const isModified = Math.abs(projectedBalance - (customerAnalytics.credit_balance || 0)) > 0.001;

                      return (
                        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3 flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-2.5">
                            <Wallet className="h-4 w-4 text-sky-400" />
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">
                                Customer Wallet
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                {customerAnalytics.customer_name || effectiveCustomerName || "Customer"} • {customerAnalytics.customer_phone || effectiveCustomerPhone}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-[var(--text-muted)] font-semibold">
                              {isModified ? "Projected Balance After Return:" : "Current Balance:"}
                            </div>
                            {projectedBalance > 0.001 ? (
                              <span className={`font-mono text-sm font-black transition-colors ${isModified ? "text-amber-400" : "text-emerald-400"}`}>
                                ₹{projectedBalance.toFixed(2)} <span className={`text-[10px] ${isModified ? "text-amber-400/80" : "text-emerald-500/80"}`}>(Cr)</span>
                              </span>
                            ) : projectedBalance < -0.001 ? (
                              <span className={`font-mono text-sm font-black transition-colors ${isModified ? "text-amber-400" : "text-rose-400"}`}>
                                -₹{Math.abs(projectedBalance).toFixed(2)} <span className={`text-[10px] ${isModified ? "text-amber-400/80" : "text-rose-500/80"}`}>(Dr / Udhaar)</span>
                              </span>
                            ) : (
                              <span className={`font-mono text-sm font-black transition-colors ${isModified ? "text-amber-400" : "text-[var(--text-muted)]"}`}>
                                ₹0.00
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Options when Refund Method is NOT Store Credit */}
                    {refundMethod !== "STORE_CREDIT" && (
                      <div className="space-y-2">
                        {/* NET REFUND CASES */}
                        {isNetRefund ? (
                          <>
                            {/* Case A: Customer has debt, allow settling debt from refund */}
                            {customerAnalytics.credit_balance < 0 && (
                              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/15 transition">
                                <input
                                  type="checkbox"
                                  checked={settleDebit}
                                  onChange={(e) => setSettleDebit(e.target.checked)}
                                  className="mt-0.5 accent-emerald-500"
                                />
                                <div className="text-xs">
                                  <span className="font-bold text-emerald-400 block">
                                    Settle ₹{Math.min(rawRefundOwed, Math.abs(customerAnalytics.credit_balance)).toFixed(2)} of existing Debt (Udhaar)
                                  </span>
                                  <span className="text-[11px] text-emerald-400/80">
                                    Deduct up to outstanding debt from the refund amount instead of giving cash.
                                  </span>
                                </div>
                              </label>
                            )}

                            {/* Case B: Customer has store credit, allow cashing out */}
                            {customerAnalytics.credit_balance > 0 && (
                              <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-2.5 flex items-center gap-2 text-xs border border-[var(--border-strong)]">
                                <span className="font-bold text-[var(--text-muted)] text-[11px]">Cash Out Store Credit:</span>
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <input
                                    type="number"
                                    min="0"
                                    max={customerAnalytics.credit_balance}
                                    value={creditCashedOut}
                                    onChange={(e) => setCreditCashedOut(e.target.value)}
                                    placeholder="₹0"
                                    className="w-20 px-2 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] font-mono font-bold text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setCreditCashedOut(customerAnalytics.credit_balance.toString())}
                                    className="text-[10px] bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 font-bold px-2 py-1 rounded-md transition"
                                  >
                                    MAX
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Case C: Cash Denominations Edge Cases */}
                            {refundMethod === "CASH" && (() => {
                              const netCashGiven = refundDenomTotal - inwardDenomTotal;

                              if (netCashGiven < targetRefundAmt && targetRefundAmt > 0) {
                                const unpaid = targetRefundAmt - netCashGiven;
                                return (
                                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 cursor-pointer hover:bg-sky-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoConvertCredit}
                                      onChange={(e) => setAutoConvertCredit(e.target.checked)}
                                      className="mt-0.5 accent-sky-500"
                                    />
                                    <div className="text-xs">
                                      <span className="font-bold text-sky-400 block">
                                        Convert remaining ₹{unpaid.toFixed(2)} refund to Store Credit
                                      </span>
                                      <span className="text-[11px] text-sky-400/80">
                                        Dispensed ₹{netCashGiven.toFixed(2)} cash. Save the remaining change in customer's store credit.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }

                              if (netCashGiven > targetRefundAmt) {
                                const extraCash = netCashGiven - targetRefundAmt;
                                return (
                                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 cursor-pointer hover:bg-rose-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoRecordExtraChangeAsDebt}
                                      onChange={(e) => setAutoRecordExtraChangeAsDebt(e.target.checked)}
                                      className="mt-0.5 accent-rose-500"
                                    />
                                    <div className="text-xs">
                                      <span className="font-bold text-rose-400 block">
                                        Record extra ₹{extraCash.toFixed(2)} cash given as Debt (Udhaar)
                                      </span>
                                      <span className="text-[11px] text-rose-400/80">
                                        Gave customer more cash than owed. Add the excess to their debt balance.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }
                              return null;
                            })()}
                          </>
                        ) : (
                          /* NET PAYABLE CASES (EXCHANGE) */
                          <>
                            {/* Case A: Apply Store Credit towards exchange */}
                            {customerAnalytics.credit_balance > 0 && (
                              <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-2.5 flex items-center gap-2 text-xs border border-[var(--border-strong)]">
                                <span className="font-bold text-[var(--text-muted)] text-[11px]">Apply Store Credit:</span>
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <input
                                    type="number"
                                    min="0"
                                    max={Math.min(customerAnalytics.credit_balance, rawAdditionalPayable)}
                                    value={applyCreditAmount}
                                    onChange={(e) => setApplyCreditAmount(e.target.value)}
                                    placeholder="₹0"
                                    className="w-20 px-2 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] font-mono font-bold text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setApplyCreditAmount(Math.min(customerAnalytics.credit_balance, rawAdditionalPayable).toString())}
                                    className="text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-bold px-2 py-1 rounded-md transition"
                                  >
                                    MAX
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Case B: Settle old debt alongside exchange */}
                            {customerAnalytics.credit_balance < 0 && (
                              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 cursor-pointer hover:bg-sky-500/15 transition">
                                <input
                                  type="checkbox"
                                  checked={settleDebit}
                                  onChange={(e) => setSettleDebit(e.target.checked)}
                                  className="mt-0.5 accent-sky-500"
                                />
                                <div className="text-xs">
                                  <span className="font-bold text-sky-400 block">
                                    Collect &amp; Settle ₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)} of old Debt (Udhaar)
                                  </span>
                                  <span className="text-[11px] text-sky-400/80">
                                    Collect customer's outstanding debt alongside this exchange payment.
                                  </span>
                                </div>
                              </label>
                            )}

                            {/* Case C: Exchange Cash Collection Edge Cases */}
                            {refundMethod === "CASH" && (() => {
                              const netCashPaid = inwardDenomTotal - refundDenomTotal;

                              if (netCashPaid < targetCollectionAmt && targetCollectionAmt > 0) {
                                const shortfall = targetCollectionAmt - netCashPaid;
                                return (
                                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 cursor-pointer hover:bg-amber-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoRecordDebitOnShortfall}
                                      onChange={(e) => setAutoRecordDebitOnShortfall(e.target.checked)}
                                      className="mt-0.5 accent-amber-500"
                                    />
                                    <div className="text-xs">
                                      <span className="font-bold text-amber-400 block">
                                        Record ₹{shortfall.toFixed(2)} shortfall as Debt (Udhaar)
                                      </span>
                                      <span className="text-[11px] text-amber-400/80">
                                        Customer paid less cash than required. Record remaining balance as udhaar.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }

                              if (netCashPaid > targetCollectionAmt) {
                                const extraCash = netCashPaid - targetCollectionAmt;
                                return (
                                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoConvertCredit}
                                      onChange={(e) => setAutoConvertCredit(e.target.checked)}
                                      className="mt-0.5 accent-emerald-500"
                                    />
                                    <div className="text-xs">
                                      <span className="font-bold text-emerald-400 block">
                                        Convert ₹{extraCash.toFixed(2)} extra cash into Store Credit
                                      </span>
                                      <span className="text-[11px] text-emerald-400/80">
                                        Customer paid extra cash and did not take change. Add to their wallet.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }
                              return null;
                            })()}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* When customer is not yet linked or no phone entered */
                  <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-3 text-center space-y-1.5 mt-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Customer mobile number not linked.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPhonePrompt(true)}
                      className="text-xs text-sky-400 hover:text-sky-300 font-bold underline cursor-pointer"
                    >
                      + Link customer mobile to use Store Credit &amp; Udhaar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Footer Action */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={returnCreditTotal <= 0}
                onClick={handleSubmitReturn}
                className="rounded-xl bg-sky-500 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-sky-600 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Process Return &amp; Restock</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
