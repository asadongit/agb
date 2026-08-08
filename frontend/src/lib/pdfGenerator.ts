import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OrderResponse } from "@/types";

export interface ReceiptPdfData {
  invoice_no?: string;
  order_id: string;
  table_number: string;
  created_at?: string;
  date_time?: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: string | number;
  subtotal_without_tax?: number;
  total_tax?: number;
  cgst?: number;
  sgst?: number;
  items: Array<{
    menu_item_id?: string;
    item_name?: string;
    quantity: number;
    unit_price: string | number;
    line_total?: string | number;
  }>;
  restaurant?: {
    name?: string;
    address?: string;
    phone?: string;
    gstin?: string;
    fssai_no?: string;
    logo_url?: string;
  };
}

export interface ReceiptPdfData {
  invoice_no?: string;
  order_id: string;
  table_number: string;
  created_at?: string;
  date_time?: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: string | number;
  subtotal_without_tax?: number;
  total_tax?: number;
  cgst?: number;
  sgst?: number;
  items: Array<{
    menu_item_id?: string;
    item_name?: string;
    quantity: number;
    unit_price: string | number;
    line_total?: string | number;
  }>;
  restaurant?: {
    name?: string;
    address?: string;
    phone?: string;
    gstin?: string;
    fssai_no?: string;
    logo_url?: string;
  };
}

export function generateReceiptPDF(
  order: OrderResponse | ReceiptPdfData,
  restaurantName: string = "Restaurant Receipt",
  menuItemsMap?: Record<string, { name: string; price?: string }>,
  storeDetails?: {
    address?: string;
    phone?: string;
    gstin?: string;
    fssai_no?: string;
    logo_url?: string;
  }
) {
  // Pure Monospaced Courier Thermal POS Format (80mm Paper)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 210], // 80mm Standard POS Thermal Paper Format
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 80mm
  const margin = 4;
  const contentWidth = pageWidth - margin * 2; // 72mm

  let y = 8;

  // Helper for drawing dashed divider line
  const drawDashedLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, posY, pageWidth - margin, posY);
    doc.setLineDashPattern([], 0);
  };

  // Helper for drawing solid double divider line
  const drawSolidLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(margin, posY, pageWidth - margin, posY);
  };

  // 1. STORE HEADER BLOCK (Centered, Courier Bold)
  const storeName = (
    storeDetails?.logo_url ||
    (order as any).restaurant?.name ||
    restaurantName ||
    "RESTAURANT"
  ).toUpperCase();

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(storeName, pageWidth / 2, y, { align: "center" });

  y += 4;
  const addressStr = storeDetails?.address || (order as any).restaurant?.address;
  if (addressStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.text(addressStr, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }

  const phoneStr = storeDetails?.phone || (order as any).restaurant?.phone;
  if (phoneStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.text(`Phone: ${phoneStr}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }

  const gstin = storeDetails?.gstin || (order as any).restaurant?.gstin || "01AAFCB7044K1ZV";
  const fssai = storeDetails?.fssai_no || (order as any).restaurant?.fssai_no;
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.text(`GSTIN: ${gstin}${fssai ? ` | FSSAI: ${fssai}` : ""}`, pageWidth / 2, y, { align: "center" });

  y += 2.5;
  drawDashedLine(y);

  // 2. CASH MEMO TITLE & BILL METADATA (Grid Aligned)
  y += 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("TAX INVOICE / CASH MEMO", pageWidth / 2, y, { align: "center" });

  y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);

  const invoiceNo = (order as any).invoice_no || (order as any).id?.slice(0, 8).toUpperCase() || "RECEIPT";
  const tableNo = order.table_number || "#";
  doc.text(`Bill No : #${invoiceNo}`, margin, y);
  doc.text(`Basket: #${tableNo}`, pageWidth - margin, y, { align: "right" });

  y += 3.5;
  let orderDateStr = (order as any).date_time;
  if (!orderDateStr && (order as any).created_at) {
    orderDateStr = new Date((order as any).created_at).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  doc.text(`Date    : ${orderDateStr || "N/A"}`, margin, y);

  const guestName = (order as any).customer?.name || order.customer_name;
  if (guestName) {
    y += 3.5;
    doc.text(`Customer: ${guestName}`, margin, y);
    const guestPhone = (order as any).customer?.phone || (order as any).customer_phone;
    if (guestPhone) {
      doc.text(`Mob: ${guestPhone}`, pageWidth - margin, y, { align: "right" });
    }
  }

  y += 2.5;
  drawSolidLine(y);

  // 3. ITEMIZED TABLE GRID (Courier Monospaced Column Alignment)
  const tableData = (order.items || []).map((item: any, idx: number) => {
    const dishName =
      item.item_name ||
      menuItemsMap?.[item.menu_item_id]?.name ||
      `Dish #${(item.menu_item_id || "").slice(0, 6)}`;
    const qty = item.quantity;
    const price = parseFloat(item.unit_price || "0");
    const lineTotal = item.line_total ? parseFloat(item.line_total) : qty * price;

    return [
      `${idx + 1}. ${dishName}`,
      `${qty}`,
      `${price.toFixed(2)}`,
      `${lineTotal.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: y + 1.5,
    margin: { left: margin, right: margin },
    head: [["Item Description", "Qty", "Rate", "Amount"]],
    body: tableData,
    theme: "plain",
    styles: {
      font: "courier",
      fontSize: 7,
      cellPadding: 1,
      textColor: [0, 0, 0],
      lineWidth: 0,
    },
    headStyles: {
      font: "courier",
      fontStyle: "bold",
      fontSize: 7,
      textColor: [0, 0, 0],
      fillColor: false,
    },
    columnStyles: {
      0: { cellWidth: 35, halign: "left" },
      1: { cellWidth: 8, halign: "center" },
      2: { cellWidth: 14, halign: "right" },
      3: { cellWidth: 15, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 2;
  drawDashedLine(finalY);

  // 4. TAX & FINANCIAL SUMMARY GRID (Clean Monospaced Offsets)
  let summaryY = finalY + 4;
  const totalAmountNum = parseFloat(String(order.total_amount || 0));
  const subtotalWithoutTax =
    (order as any).subtotal_without_tax ?? totalAmountNum / 1.05;
  const totalTax =
    (order as any).total_tax ?? totalAmountNum - subtotalWithoutTax;
  const cgst = (order as any).cgst ?? totalTax / 2;
  const sgst = (order as any).sgst ?? totalTax / 2;

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);

  doc.text("Subtotal (Excl. Tax)", margin, summaryY);
  doc.text(`INR ${subtotalWithoutTax.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });

  summaryY += 3.5;
  doc.text("CGST @ 2.5%", margin, summaryY);
  doc.text(`INR ${cgst.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });

  summaryY += 3.5;
  doc.text("SGST @ 2.5%", margin, summaryY);
  doc.text(`INR ${sgst.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });

  summaryY += 3.5;
  doc.text("Total GST Tax (5%)", margin, summaryY);
  doc.text(`INR ${totalTax.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });

  summaryY += 2;
  drawDashedLine(summaryY);

  summaryY += 4.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text("GRAND TOTAL:", margin, summaryY);
  doc.text(`INR ${totalAmountNum.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });

  summaryY += 3;
  drawSolidLine(summaryY);

  // 5. PAYMENT STATUS STAMP & FOOTER BLOCK
  summaryY += 4.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  doc.text("[ STATUS: PAID & SETTLED ]", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 4.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text(`Thank you for visiting ${storeName}!`, pageWidth / 2, summaryY, { align: "center" });

  summaryY += 3.5;
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text("Please Come Again", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 3.5;
  doc.text("*** HAVE A GREAT DAY ***", pageWidth / 2, summaryY, { align: "center" });

  doc.save(`Receipt-${invoiceNo}.pdf`);
}

export function generateAnalyticsPdfReport(
  restaurantName: string,
  dateRangeLabel: string,
  kpi: {
    total_revenue: number;
    total_orders: number;
    avg_order_value: number;
    profit_margin_pct: number;
    cogs: number;
    net_profit: number;
    revenue_change_pct: number;
    orders_change_pct: number;
    margin_change_pct: number;
  },
  topItems: Array<{ name: string; quantity_sold: number; revenue: number; revenue_share_pct: number }>,
  funnelStages: Array<{ stage_label: string; count: number; percentage: number }>
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header banner
  doc.setFillColor(0, 112, 243);
  doc.rect(0, 0, pageWidth, 25, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(`${restaurantName.toUpperCase()} — EXECUTIVE SALES & ANALYTICS REPORT`, 14, 14);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Period: ${dateRangeLabel} | Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 20);

  let y = 35;

  // Executive KPI summary cards grid table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("1. Executive Summary & KPIs", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value", "Period-over-Period Delta"]],
    body: [
      ["Gross Revenue", `INR ${kpi.total_revenue.toFixed(2)}`, `${kpi.revenue_change_pct >= 0 ? "+" : ""}${kpi.revenue_change_pct}%`],
      ["Total Completed Orders", `${kpi.total_orders}`, `${kpi.orders_change_pct >= 0 ? "+" : ""}${kpi.orders_change_pct}%`],
      ["Average Order Value (AOV)", `INR ${kpi.avg_order_value.toFixed(2)}`, "—"],
      ["Cost of Goods Sold (COGS)", `INR ${kpi.cogs.toFixed(2)}`, "—"],
      ["Net Profit", `INR ${kpi.net_profit.toFixed(2)}`, "—"],
      ["Profit Margin %", `${kpi.profit_margin_pct}%`, `${kpi.margin_change_pct >= 0 ? "+" : ""}${kpi.margin_change_pct}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [0, 112, 243], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Top Items Table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("2. Top Performing Menu Items", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Item Name", "Qty Sold", "Revenue (INR)", "Revenue Share %"]],
    body: topItems.slice(0, 10).map((item) => [
      item.name,
      item.quantity_sold,
      `INR ${item.revenue.toFixed(2)}`,
      `${item.revenue_share_pct.toFixed(1)}%`,
    ]),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Order Funnel Table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("3. Order Conversion & Funnel Breakdown", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Fulfillment Stage", "Order Count", "Stage Share %"]],
    body: funnelStages.map((stg) => [stg.stage_label, stg.count, `${stg.percentage.toFixed(1)}%`]),
    theme: "plain",
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5 },
  });

  doc.save(`Sales-Report-${restaurantName.replace(/\s+/g, "_")}.pdf`);
}
