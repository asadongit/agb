import React, { useState, useRef } from "react";
import { X, Printer, LayoutGrid, ScrollText } from "lucide-react";
import Barcode from "react-barcode";
import { useReactToPrint } from "react-to-print";
import type { InventoryItem } from "@/types";

interface PrintBarcodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
}

export function PrintBarcodesModal({ isOpen, onClose, item }: PrintBarcodesModalProps) {
  const [printFormat, setPrintFormat] = useState<"A4" | "THERMAL">("A4");
  const [quantity, setQuantity] = useState(40);
  
  const componentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Barcodes_${item?.name}`,
  });

  if (!isOpen || !item) return null;

  const barcodeValue = item.barcode || item.id.split("-")[0].toUpperCase();

  return (
    <>
      {/* Screen Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
        <div className="relative w-full max-w-xl rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Print Barcodes
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Generate print-ready layouts for {item.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Print Format
              </label>
              <div className="flex bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => { setPrintFormat("A4"); setQuantity(40); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    printFormat === "A4" 
                      ? "bg-[var(--accent-brand)] text-white shadow-sm" 
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  A4 Sheet
                </button>
                <button
                  type="button"
                  onClick={() => { setPrintFormat("THERMAL"); setQuantity(10); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    printFormat === "THERMAL" 
                      ? "bg-[var(--accent-brand)] text-white shadow-sm" 
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                  }`}
                >
                  <ScrollText className="h-4 w-4" />
                  Thermal Roll
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Quantity (Labels)
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
          </div>

          {/* Preview Panel */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 flex flex-col items-center justify-center min-h-[150px] relative overflow-hidden">
            <p className="absolute top-2 left-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Preview</p>
            <div className="bg-white p-3 rounded shadow-sm border border-gray-200 mt-2 pointer-events-none scale-90 origin-top">
               <p className="text-[10px] font-bold text-center text-black mb-1 w-full truncate max-w-[150px]">{item.name}</p>
               {/* @ts-ignore */}
                  <Barcode value={barcodeValue} format="CODE128" width={1.5} height={40} fontSize={12} margin={0} displayValue={true} />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2">
              Value: <span className="font-mono">{barcodeValue}</span>
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handlePrint()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-sm font-bold text-white shadow-md hover:bg-[var(--accent-brand-dark)] transition active:scale-95"
            >
              <Printer className="h-4 w-4" />
              Print {quantity} Labels
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Print Container */}
      <div className="hidden">
        <div ref={componentRef} className="print-container bg-white text-black min-h-screen">
          <style type="text/css" media="print">
            {`
              @page { size: ${printFormat === "A4" ? "A4" : "50mm 25mm"}; margin: ${printFormat === "A4" ? "10mm" : "0"}; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
              ${printFormat === "THERMAL" ? '.page-break { page-break-after: always; }' : ''}
            `}
          </style>
          
          {printFormat === "A4" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", padding: "10px", width: "100%", boxSizing: "border-box" }}>
              {Array.from({ length: quantity }).map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px", border: "1px dashed #ccc", boxSizing: "border-box" }}>
                  <p style={{ fontSize: "9px", fontWeight: "bold", textAlign: "center", margin: "0 0 4px 0", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                  </p>
                  {/* @ts-ignore */}
                  <Barcode value={barcodeValue} format="CODE128" width={1.2} height={35} fontSize={10} margin={0} displayValue={true} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {Array.from({ length: quantity }).map((_, i) => (
                <div key={i} className="page-break" style={{ width: "50mm", height: "25mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxSizing: "border-box", padding: "2mm", overflow: "hidden" }}>
                  <p style={{ fontSize: "8px", fontWeight: "bold", textAlign: "center", margin: "0 0 2px 0", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                  </p>
                  {/* @ts-ignore */}
                  <Barcode value={barcodeValue} format="CODE128" width={1.2} height={25} fontSize={9} margin={0} displayValue={true} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
