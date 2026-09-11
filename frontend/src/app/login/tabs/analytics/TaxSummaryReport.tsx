import React, { useState } from "react";
import { Calculator, Landmark, Download, FileSpreadsheet, Loader2, ShieldCheck, Layers } from "lucide-react";
import { TaxSummaryResponse, Gstr1HsnSummaryResponse, Gstr1HsnItem } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

type Props = {
  data: TaxSummaryResponse | null;
  gstr1Data?: Gstr1HsnSummaryResponse | null;
  isLoading: boolean;
  fromDate?: string;
  toDate?: string;
};

export function TaxSummaryReport({ data, gstr1Data, isLoading, fromDate, toDate }: Props) {
  const [isDownloadingCaReport, setIsDownloadingCaReport] = useState(false);

  const handleDownloadCaExcel = async () => {
    try {
      setIsDownloadingCaReport(true);
      const apiBase = getApiBaseUrl();
      const token = typeof window !== "undefined"
        ? (localStorage.getItem("agb_access_token") || localStorage.getItem("admin_access_token") || localStorage.getItem("token"))
        : null;
      let url = `${apiBase}/api/analytics/ca-export`;
      const queryParams: string[] = [];
      if (fromDate) queryParams.push(`from_date=${encodeURIComponent(fromDate)}`);
      if (toDate) queryParams.push(`to_date=${encodeURIComponent(toDate)}`);
      if (queryParams.length > 0) url += `?${queryParams.join("&")}`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let errMsg = "Failed to generate CA audit report";
        try {
          const errJson = await res.json();
          errMsg = errJson.detail || errMsg;
        } catch {
          try {
            const errText = await res.text();
            if (errText) errMsg = errText;
          } catch {}
        }
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const fNameDate = fromDate ? `${fromDate.slice(0, 10)}_to_${toDate ? toDate.slice(0, 10) : "today"}` : "full_period";
      a.download = `GST_CA_Audit_Report_${fNameDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error("CA export download error:", err);
      alert(err.message || "Failed to download CA audit report.");
    } finally {
      setIsDownloadingCaReport(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-[var(--text-secondary)]">Loading tax summary & GSTR-1 compliance reports...</div>;
  }
  if (!data) return null;

  const hsnItems: Gstr1HsnItem[] = gstr1Data?.items || [];
  const totalHsnTaxable = gstr1Data?.total_taxable_value ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.taxable_value || 0), 0);
  const totalHsnValue = gstr1Data?.total_value ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.total_value || 0), 0);
  const totalHsnIgst = gstr1Data?.total_igst ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.igst_amount || 0), 0);
  const totalHsnCgst = gstr1Data?.total_cgst ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.cgst_amount || 0), 0);
  const totalHsnSgst = gstr1Data?.total_sgst ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.sgst_amount || 0), 0);
  const totalHsnTax = totalHsnIgst + totalHsnCgst + totalHsnSgst;

  return (
    <div className="space-y-6">
      {/* Header & 1-Click CA Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              Tax Summary &amp; GST Compliance
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="h-3 w-3" /> GSTR-1 Ready
              </span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Statutory GST collections, Table 12 HSN summaries, and Chartered Accountant audit downloads
            </p>
          </div>
        </div>

        {/* 1-Click CA GST Excel Export */}
        <button
          type="button"
          onClick={handleDownloadCaExcel}
          disabled={isDownloadingCaReport}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
          title="Download multi-sheet GST report formatted for CA and GST Portal upload (Table 12 HSN, GSTR-3B, B2B Register, B2C Summary)"
        >
          {isDownloadingCaReport ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating CA Report...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4" />
              <span>Download CA GST Excel Report (.xlsx)</span>
            </>
          )}
        </button>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Taxable Value</p>
          <p className="mt-2 text-2xl font-black font-mono text-[var(--text-primary)]">₹{data.total_taxable_amount.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Tax Collected</p>
          <p className="mt-2 text-2xl font-black font-mono text-purple-400">₹{data.total_tax_collected.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Central + State (CGST + SGST)</p>
          <p className="mt-2 text-2xl font-black font-mono text-cyan-400">
            ₹{(totalHsnCgst + totalHsnSgst > 0 ? (totalHsnCgst + totalHsnSgst) : data.total_tax_collected).toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Inter-State (IGST)</p>
          <p className="mt-2 text-2xl font-black font-mono text-amber-400">₹{totalHsnIgst.toFixed(2)}</p>
        </div>
      </div>

      {/* 1. GSTR-1 Table 12 HSN Summary */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" />
            <h3 className="font-bold text-sm text-[var(--text-primary)]">GSTR-1 Table 12: HSN-Wise Summary of Outward Supplies</h3>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">
            {hsnItems.length} HSN Codes Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
              <tr>
                <th className="px-4 py-3">HSN/SAC</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-3 py-3 text-center">UQC</th>
                <th className="px-3 py-3 text-right">Total Qty</th>
                <th className="px-4 py-3 text-right">Total Value</th>
                <th className="px-4 py-3 text-right">Taxable Value</th>
                <th className="px-3 py-3 text-right text-amber-400">IGST</th>
                <th className="px-3 py-3 text-right text-cyan-400">CGST</th>
                <th className="px-3 py-3 text-right text-cyan-400">SGST</th>
                <th className="px-4 py-3 text-right font-bold text-purple-400">Total Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
              {hsnItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-xs text-[var(--text-muted)] font-sans">
                    <Calculator className="mx-auto h-6 w-6 mb-2 opacity-30" />
                    No HSN items recorded for this date range. Check that inventory/menu items have HSN codes assigned.
                  </td>
                </tr>
              ) : (
                hsnItems.map((row: Gstr1HsnItem, idx: number) => {
                  const rowTax = (row.igst_amount || 0) + (row.cgst_amount || 0) + (row.sgst_amount || 0);
                  return (
                    <tr key={`${row.hsn_code}-${row.tax_rate}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-4 py-3 font-bold text-amber-400 font-mono">
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 border border-amber-500/20">
                          {row.hsn_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-sans font-medium truncate max-w-[180px]" title={row.description}>
                        {row.description}
                      </td>
                      <td className="px-3 py-3 text-center text-[var(--text-muted)]">{row.uqc}</td>
                      <td className="px-3 py-3 text-right">{row.total_quantity.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{row.total_value.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">₹{row.taxable_value.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-amber-400">₹{row.igst_amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-cyan-400">₹{row.cgst_amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-cyan-400">₹{row.sgst_amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-400">₹{rowTax.toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {hsnItems.length > 0 && (
              <tfoot className="border-t-2 border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] font-mono font-bold text-xs">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-sans uppercase">Total Outward Supplies</td>
                  <td className="px-3 py-3 text-right">-</td>
                  <td className="px-4 py-3 text-right">₹{totalHsnValue.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[var(--text-primary)]">₹{totalHsnTaxable.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-amber-400">₹{totalHsnIgst.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-cyan-400">₹{totalHsnCgst.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-cyan-400">₹{totalHsnSgst.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-purple-400">₹{totalHsnTax.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 2. Tax Slab Summary */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3">
          <h3 className="font-bold text-sm text-[var(--text-primary)]">GST Tax Slab Breakdown</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-3 font-semibold">Tax Category</th>
                <th className="px-6 py-3 font-semibold text-right">Tax Rate %</th>
                <th className="px-6 py-3 font-semibold text-right">Items Count</th>
                <th className="px-6 py-3 font-semibold text-right">Taxable Amount</th>
                <th className="px-6 py-3 font-semibold text-right text-purple-400">Tax Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.slabs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <Calculator className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No tax data found for this period.
                  </td>
                </tr>
              ) : (
                data.slabs.map((slab, idx) => (
                  <tr key={`${slab.tax_category}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-3 font-medium text-[var(--text-primary)]">
                      {slab.tax_category}
                    </td>
                    <td className="px-6 py-3 text-right font-medium">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {slab.tax_rate}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-[var(--text-secondary)] font-mono">{slab.items_count}</td>
                    <td className="px-6 py-3 text-right font-medium font-mono">₹{slab.taxable_amount.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-bold text-purple-400 font-mono">₹{slab.tax_collected.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}