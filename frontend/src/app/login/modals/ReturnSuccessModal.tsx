"use client";

import React from "react";
import { CheckCircle2, Download, Eye, Printer, RotateCcw, X } from "lucide-react";
import { generateReturnReceiptPDF, type ReturnPdfData } from "@/lib/pdfGenerator";

type ReturnSuccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  returnData: ReturnPdfData | null;
  restaurantName?: string;
  restaurant?: any;
};

export function ReturnSuccessModal({
  isOpen,
  onClose,
  returnData,
  restaurantName = "ApnaGreen Basket",
  restaurant,
}: ReturnSuccessModalProps) {
  if (!isOpen || !returnData) return null;

  const handleView = () => {
    generateReturnReceiptPDF(returnData, restaurantName, restaurant, "view");
  };

  const handleDownload = () => {
    generateReturnReceiptPDF(returnData, restaurantName, restaurant, "download");
  };

  const origBillText =
    returnData.original_bill_number ||
    (returnData.order_id ? `#${returnData.order_id.slice(0, 8).toUpperCase()}` : "Direct Return (No Bill)");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header Badge */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-14 w-14 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
            Return Processed Successfully!
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Inventory has been restocked and return bill generated.
          </p>
        </div>

        {/* Info Grid */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
          <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] font-semibold">Return Bill No:</span>
            <span className="font-mono font-bold text-sky-400">{returnData.return_number}</span>
          </div>

          <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] font-semibold">Original Bill Ref:</span>
            <span className="font-mono font-bold text-[var(--text-primary)]">{origBillText}</span>
          </div>

          {returnData.customer_name && (
            <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] font-semibold">Customer:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {returnData.customer_name} {returnData.customer_phone ? `(${returnData.customer_phone})` : ""}
              </span>
            </div>
          )}

          {/* Returned Items List */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
              Returned Line Items:
            </span>
            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {(returnData.returned_items || []).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-mono text-[var(--text-primary)]">
                  <span>
                    {item.item_name} × {item.quantity}
                  </span>
                  <span className="font-bold text-sky-400">
                    ₹{(item.line_refund !== undefined ? Number(item.line_refund) : item.quantity * Number(item.unit_price)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Total Net Refund */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between items-center">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              Net Refund ({returnData.refund_payment_method || "CASH"}):
            </span>
            <span className="font-mono text-lg font-black text-sky-400">
              ₹{returnData.total_refund_amount.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleView}
            className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 py-2.5 px-3 text-xs font-bold text-sky-400 hover:bg-sky-500/20 transition"
          >
            <Eye className="h-4 w-4" />
            <span>View Return Bill</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 px-3 text-xs font-bold text-white hover:bg-sky-600 shadow-md transition"
          >
            <Printer className="h-4 w-4" />
            <span>Print / Download</span>
          </button>
        </div>

        {/* Done / Close */}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
