import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OrderResponse } from "@/types";
import QRCode from "qrcode";

export interface ReceiptPdfData {
  invoice_no?: string;
  order_id: string;
  basket_number: string;
  created_at?: string;
  date_time?: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: string | number;
  delivery_charge?: number;
  handling_charge?: number;
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
    mrp?: string | number;
    is_complimentary?: boolean;
    tax_rate?: number | string | null;
    item_tax_rate?: number | string | null;
  }>;
}

// Helper to safely fetch an image and convert it to Base64 (bypassing canvas CORS issues for relative paths)
async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch image");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ReceiptPdfData {
  invoice_no?: string;
  order_id: string;
  basket_number: string;
  created_at?: string;
  date_time?: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: string | number;
  delivery_charge?: number;
  handling_charge?: number;
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
    mrp?: number | string;
    is_complimentary?: boolean;
    tax_rate?: number | string | null;
    item_tax_rate?: number | string | null;
  }>;
  restaurant?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    fssai_no?: string;
    logo_url?: string;
    bill_qr_url?: string;
    place_of_supply?: string;
  };
  discount_type?: string;
  discount_value?: string | number;
  customer?: {
    name?: string;
    phone?: string;
  };
}

export async function generateReceiptPDF(
  order: OrderResponse | ReceiptPdfData,
  restaurantName: string = "Outlet Receipt",
  menuItemsMap?: Record<string, { name: string; price?: string; tax_rate?: number | string | null; tax_category?: string | null }>,
  storeDetailsOrAction?: any,
  actionOpt: "download" | "view" = "download"
) {
  let storeDetails: any = undefined;
  let action: "download" | "view" = actionOpt;

  if (typeof storeDetailsOrAction === "string") {
    if (storeDetailsOrAction === "download" || storeDetailsOrAction === "view") {
      action = storeDetailsOrAction;
    }
  } else if (typeof storeDetailsOrAction === "object" && storeDetailsOrAction !== null) {
    storeDetails = storeDetailsOrAction;
  }

  // Pure Monospaced Courier Thermal POS Format (80mm Paper)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 297], // Extended length to accommodate more content
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
  const getOutletField = (field: string) => {
    return storeDetails?.[field] || (order as any).restaurant?.[field] || (order as any).outlet?.[field];
  };

  const logoUrl = getOutletField("logo_url");
  
  // Try to load image if provided
  if (logoUrl) {
    try {
      // Timeout for image loading
      const base64Img = await Promise.race([
        fetchImageAsBase64(logoUrl),
        new Promise<string>((_, reject) => setTimeout(() => reject("Timeout"), 3000))
      ]);
      
      const imgWidth = 20;
      const imgHeight = 20;
      // We don't know if it's PNG or JPEG from base64 string directly without parsing, 
      // but jsPDF accepts the base64 string directly in addImage if formatted correctly.
      doc.addImage(base64Img, (pageWidth - imgWidth) / 2, y, imgWidth, imgHeight);
      y += imgHeight + 4;
    } catch (e) {
      console.warn("Failed to load logo", e);
      // Skip logo on failure
    }
  }

  const rawStoreName =
    getOutletField("name") ||
    (restaurantName && restaurantName !== "Outlet Receipt" && restaurantName !== "ApnaGreen Basket" ? restaurantName : null) ||
    "APNAGREEN BASKET";
  const storeName = rawStoreName.toUpperCase();

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(storeName, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });

  y += 4;
  const addressStr = getOutletField("address");
  if (addressStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.text(addressStr, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }
  
  const billQrUrlRaw = getOutletField("bill_qr_url");
  if (billQrUrlRaw) {
    try {
      const parsedUrl = new URL(billQrUrlRaw);
      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.text(parsedUrl.hostname, pageWidth / 2, y, { align: "center" });
      y += 3.5;
    } catch {
      // Ignore if not a valid URL
    }
  }

  const fssai = getOutletField("fssai_no");
  if (fssai) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`FSSAI Reg No: ${fssai}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }

  const gstin = getOutletField("gstin") || "01AAFCB7044K1ZV";
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.text(`GSTIN: ${gstin}`, pageWidth / 2, y, { align: "center" });
  y += 3.5;
  
  const phoneStr = getOutletField("phone");
  if (phoneStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`Phone: ${phoneStr}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }
  
  const emailStr = getOutletField("email");
  if (emailStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`Email: ${emailStr}`, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }

  y -= 1; // Adjust spacing before dashed line
  drawDashedLine(y);

  // 2. CASH MEMO TITLE & BILL METADATA (Grid Aligned)
  y += 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("TAX INVOICE", pageWidth / 2, y, { align: "center" });

  y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);

  const invoiceNo = (order as any).invoice_no || (order as any).id?.slice(0, 8).toUpperCase() || "RECEIPT";
  let orderDateStr = (order as any).date_time;
  if (!orderDateStr && (order as any).created_at) {
    const d = new Date((order as any).created_at);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
    orderDateStr = `${day}/${month}/${year}, ${formattedHours}:${minutes} ${ampm}`;
  }
  
  doc.text(`Bill No : #${invoiceNo}`, margin, y);
  
  y += 3.5;
  doc.text(`Date    : ${orderDateStr || "N/A"}`, margin, y);

  y += 3.5;
  const guestName = (order as any).customer?.name || (order as any).customer_name || "Walk-In";
  doc.text(`Customer: ${guestName}`, margin, y);
  
  const guestPhone = (order as any).customer?.phone || (order as any).customer_phone;
  if (guestPhone) {
    doc.text(`Mob: ${guestPhone}`, pageWidth - margin, y, { align: "right" });
  }
  
  const placeOfSupply = getOutletField("place_of_supply");
  if (placeOfSupply) {
    y += 3.5;
    doc.text(`Place of Supply: ${placeOfSupply}`, margin, y);
  }

  y += 2.5;
  drawSolidLine(y);

  // 3. ITEMIZED TABLE GRID (Courier Monospaced Column Alignment)
  const tableData = ((order as any).items || []).map((item: any, idx: number) => {
    const dishName =
      item.item_name ||
      menuItemsMap?.[item.menu_item_id]?.name ||
      item.name ||
      `Item #${idx + 1}`;
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const qtyStr = qtyVal % 1 === 0 ? qtyVal.toFixed(0) : String(qtyVal);
    const price = parseFloat(String(item.unit_price || "0"));
    const mrpVal = item.mrp ? parseFloat(String(item.mrp)) : price;
    const lineTotal = item.line_total ? parseFloat(String(item.line_total)) : qtyVal * price;

    return [
      `${idx + 1}. ${dishName}`,
      qtyStr,
      `${mrpVal.toFixed(2)}`,
      `${price.toFixed(2)}`,
      `${lineTotal.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: y + 1.5,
    margin: { left: margin, right: margin },
    head: [["#  Item", "Qty", "MRP", "Rate", "Amt"]],
    body: tableData,
    theme: "plain",
    styles: {
      font: "courier",
      fontSize: 6.5,
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
      textColor: [0, 0, 0],
      lineWidth: 0,
    },
    headStyles: {
      font: "courier",
      fontStyle: "bold",
      fontSize: 6.5,
      textColor: [0, 0, 0],
      fillColor: false,
    },
    columnStyles: {
      0: { cellWidth: 26, halign: "left" },
      1: { cellWidth: 8, halign: "center" },
      2: { cellWidth: 11, halign: "right" },
      3: { cellWidth: 11, halign: "right" },
      4: { cellWidth: 12, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 2;
  drawDashedLine(finalY);

  // 4. TAX & FINANCIAL SUMMARY GRID (Structured User Format with Per-Item Catalog GST Referencing)
  let summaryY = finalY + 4;
  
  const deliveryCharge = parseFloat(String((order as any).delivery_charge || 0));
  const handlingCharge = parseFloat(String((order as any).handling_charge || 0));

  let totalMrpVal = 0;
  let totalSellingSubtotal = 0;

  ((order as any).items || []).forEach((it: any) => {
    const qty = parseFloat(String(it.quantity || "1"));
    const price = parseFloat(String(it.unit_price || "0"));
    const mrp = it.mrp ? parseFloat(String(it.mrp)) : price;
    totalMrpVal += mrp * qty;
    totalSellingSubtotal += price * qty;
  });

  const mrpSavings = Math.max(0, totalMrpVal - totalSellingSubtotal);

  const discType = (order as any).discount_type;
  const discVal = (order as any).discount_value ? parseFloat(String((order as any).discount_value)) : 0;

  let extraDiscountRupees = 0;
  let extraDiscountLabel = "Extra Discount";

  if (discType === "PERCENT" && discVal > 0) {
    extraDiscountRupees = totalSellingSubtotal * (discVal / 100);
    extraDiscountLabel = `Extra Discount (${discVal}% OFF)`;
  } else if (discType === "FLAT" && discVal > 0) {
    extraDiscountRupees = discVal;
    extraDiscountLabel = `Extra Discount (Flat Rs.${discVal})`;
  } else if (discType === "COMPLIMENTARY") {
    extraDiscountRupees = totalSellingSubtotal;
    extraDiscountLabel = `Extra Discount (Complimentary)`;
  }

  const pointsRedeemed = (order as any).loyalty_points_redeemed || 0;
  let loyaltyDiscountRupees = 0;
  if (pointsRedeemed > 0) {
    const pointValue = getOutletField("loyalty_point_value_inr") || storeDetails?.loyalty_point_value_inr || (order as any).restaurant?.loyalty_point_value_inr || 1;
    loyaltyDiscountRupees = pointsRedeemed * parseFloat(String(pointValue));
  }

  const amountPayable = Math.max(0, totalSellingSubtotal - extraDiscountRupees - loyaltyDiscountRupees);

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);

  if (mrpSavings > 0 || extraDiscountRupees > 0 || loyaltyDiscountRupees > 0) {
    doc.text("Total MRP Value", margin, summaryY);
    doc.text(`INR ${totalMrpVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;

    if (mrpSavings > 0) {
      doc.text("Product Discount", margin, summaryY);
      doc.text(`- INR ${mrpSavings.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }

    if (extraDiscountRupees > 0) {
      doc.text(extraDiscountLabel, margin, summaryY);
      doc.text(`- INR ${extraDiscountRupees.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }

    if (loyaltyDiscountRupees > 0) {
      doc.text(`Loyalty Redemption (${pointsRedeemed} pts)`, margin, summaryY);
      doc.text(`- INR ${loyaltyDiscountRupees.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }
    
    summaryY += 1;
    drawDashedLine(summaryY);
    summaryY += 4.5;
  }

  doc.setFont("courier", "bold");
  doc.text("Bill Total (GST Inclusive)", margin, summaryY);
  doc.text(`INR ${amountPayable.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  summaryY += 4.5;
  doc.setFont("courier", "normal");

  const discountRatio = totalSellingSubtotal > 0 ? (amountPayable / totalSellingSubtotal) : 0;
  const taxGroupMap: Record<number, { base: number; tax: number }> = {};

  ((order as any).items || []).forEach((item: any) => {
    if (item.is_complimentary) return;
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const unitPrice = parseFloat(String(item.unit_price || "0"));
    const itemLineTotal = (qtyVal * unitPrice) * discountRatio;

    let itemTaxRate = 0;
    if (item.tax_rate !== undefined && item.tax_rate !== null) {
      itemTaxRate = parseFloat(String(item.tax_rate));
    } else if (item.item_tax_rate !== undefined && item.item_tax_rate !== null) {
      itemTaxRate = parseFloat(String(item.item_tax_rate));
    } else if (menuItemsMap && item.menu_item_id && menuItemsMap[item.menu_item_id]?.tax_rate !== undefined && menuItemsMap[item.menu_item_id]?.tax_rate !== null) {
      itemTaxRate = parseFloat(String(menuItemsMap[item.menu_item_id].tax_rate));
    }
    if (isNaN(itemTaxRate)) itemTaxRate = 0;

    if (itemTaxRate > 0) {
      const base = itemLineTotal / (1 + (itemTaxRate / 100));
      const taxAmount = itemLineTotal - base;

      if (!taxGroupMap[itemTaxRate]) {
        taxGroupMap[itemTaxRate] = { base: 0, tax: 0 };
      }
      taxGroupMap[itemTaxRate].base += base;
      taxGroupMap[itemTaxRate].tax += taxAmount;
    }
  });

  const activeTaxRates = Object.keys(taxGroupMap).map(Number).sort((a, b) => a - b);

  activeTaxRates.forEach((rate) => {
    const group = taxGroupMap[rate];
    const groupTax = group.tax;
    const cgstVal = groupTax / 2;
    const sgstVal = groupTax / 2;

    const rateLabel = rate.toFixed(1).replace(/\.0$/, "");
    const halfRateLabel = (rate / 2).toFixed(1).replace(/\.0$/, "");

    doc.text(`GST Included @ ${rateLabel}% (on Rs.${group.base.toFixed(2)})`, margin, summaryY);
    summaryY += 3.5;

    doc.text(`  CGST @ ${halfRateLabel}%`, margin, summaryY);
    doc.text(`INR ${cgstVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;

    doc.text(`  SGST @ ${halfRateLabel}%`, margin, summaryY);
    doc.text(`INR ${sgstVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
  });

  summaryY += 1;
  drawDashedLine(summaryY);

  summaryY += 4.5;
  const billAmount = amountPayable;
  const totalBeforeRound = billAmount + deliveryCharge + handlingCharge;
  
  // ALWAYS enforce standard rounding to nearest integer for POS systems
  const netTotal = Math.round(totalBeforeRound);
  const roundOff = netTotal - totalBeforeRound;

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  
  doc.text("Bill Amount", margin, summaryY);
  doc.text(`INR ${billAmount.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  summaryY += 3.5;
  
  if (deliveryCharge > 0 || (order as any).delivery_charge !== undefined) {
    doc.text("Delivery Charge", margin, summaryY);
    doc.text(`INR ${deliveryCharge.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
  }
  
  if (handlingCharge > 0 || (order as any).handling_charge !== undefined) {
    doc.text("Handling Charge", margin, summaryY);
    doc.text(`INR ${handlingCharge.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
  }
  
  if (Math.abs(roundOff) > 0.001) {
    doc.text("Round Off", margin, summaryY);
    const sign = roundOff > 0 ? "+" : "";
    doc.text(`${sign}${roundOff.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
  }
  
  summaryY += 1;
  drawSolidLine(summaryY);

  summaryY += 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("NET TOTAL", margin, summaryY);
  doc.text(`INR ${netTotal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  
  summaryY += 1;
  drawSolidLine(summaryY + 2);

  // 5. FOOTER & QR CODE
  summaryY += 8;
  
  // Draw QR Code if bill_qr_url is available
  if (billQrUrlRaw) {
    try {
      const qrDataUrl = await QRCode.toDataURL(billQrUrlRaw, { margin: 1, width: 60 });
      const qrSize = 25; // 25x25mm
      doc.addImage(qrDataUrl, "PNG", (pageWidth - qrSize) / 2, summaryY, qrSize, qrSize);
      summaryY += qrSize + 4;
    } catch (e) {
      console.warn("Failed to generate QR code", e);
    }
  } else {
    summaryY += 2;
  }
  
  // App Store Badges
  const badgeWidth = 26;
  const badgeHeight = 8;
  const badgeGap = 4;
  const totalBadgesWidth = badgeWidth * 2 + badgeGap;
  const badgesStartX = (pageWidth - totalBadgesWidth) / 2;
  
  try {
    // Attempt to load the user-uploaded images from public folder
    const [playStoreBase64, appStoreBase64] = await Promise.all([
      Promise.race([fetchImageAsBase64("/images/google-play.png"), new Promise<string>((_, r) => setTimeout(() => r(""), 2000))]),
      Promise.race([fetchImageAsBase64("/images/app-store.png"), new Promise<string>((_, r) => setTimeout(() => r(""), 2000))])
    ]);
    
    if (playStoreBase64) {
      doc.addImage(playStoreBase64, badgesStartX, summaryY, badgeWidth, badgeHeight);
    } else {
      throw new Error("Missing play store image");
    }
    
    if (appStoreBase64) {
      doc.addImage(appStoreBase64, badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight);
    } else {
      throw new Error("Missing app store image");
    }
  } catch (err) {
    // Fallback to text boxes if images fail to load
    const drawBadge = (x: number, yPos: number, width: number, height: number, text: string) => {
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(x, yPos, width, height, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.setFont("courier", "bold");
      doc.text(text, x + width / 2, yPos + height / 2 + 1, { align: "center" });
      doc.setTextColor(0, 0, 0);
    };
    
    drawBadge(badgesStartX, summaryY, badgeWidth, badgeHeight, "Google Play");
    drawBadge(badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight, "App Store");
  }
  
  // Text Links
  doc.link(badgesStartX, summaryY, badgeWidth, badgeHeight, { url: "https://play.google.com/store/apps/details?id=com.apnagreenbasket" });
  doc.link(badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight, { url: "https://www.apple.com/app-store/" });
  
  summaryY += badgeHeight + 6;

  // 6. PAYMENT STATUS STAMP & FOOTER BLOCK
  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  doc.text("STATUS: PAID & SETTLED", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 4.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text("THANK YOU", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 3.5;
  doc.text("*** HAVE A GREAT DAY ***", pageWidth / 2, summaryY, { align: "center" });
  
  summaryY += 5; // End margin
  
  // Optional: Trim page height to fit content if we went over or under
  // With jsPDF you can't dynamically resize the page after creation easily, 
  // but starting with 297mm ensures we don't clip unless it's a huge order.
  
  if (action === "view") {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    doc.save(`Receipt-${invoiceNo}.pdf`);
  }
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

export interface ReturnPdfData {
  return_number: string;
  order_id?: string | null;
  original_bill_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  returned_items: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    line_refund?: number;
    reason?: string;
  }>;
  total_refund_amount: number;
  refund_payment_method?: string;
  created_at?: string;
  processed_at?: string;
}

export function generateReturnReceiptPDF(
  returnData: ReturnPdfData,
  restaurantName: string = "APNAGREEN BASKET",
  action: "download" | "view" = "download"
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 210],
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 4;
  const contentWidth = pageWidth - margin * 2;
  let y = 8;

  const drawDashedLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, posY, pageWidth - margin, posY);
    doc.setLineDashPattern([], 0);
  };

  const drawSolidLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(margin, posY, pageWidth - margin, posY);
  };

  // Header Store Name
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text((restaurantName || "APNAGREEN BASKET").toUpperCase(), pageWidth / 2, y, {
    align: "center",
    maxWidth: contentWidth,
  });

  y += 5;
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text("*** CUSTOMER RETURN BILL ***", pageWidth / 2, y, { align: "center" });

  y += 4;
  drawSolidLine(y);
  y += 4.5;

  // Metadata
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);

  doc.text(`RETURN BILL #: ${returnData.return_number}`, margin, y);
  y += 3.5;

  const origBill = returnData.original_bill_number || (returnData.order_id ? `#${returnData.order_id.slice(0, 8).toUpperCase()}` : "Direct Return (No Bill)");
  doc.text(`ORIGINAL BILL: ${origBill}`, margin, y);
  y += 3.5;

  const timestamp = returnData.processed_at || returnData.created_at || new Date().toISOString();
  const formattedDate = new Date(timestamp).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
  });
  doc.text(`DATE/TIME: ${formattedDate}`, margin, y);
  y += 3.5;

  if (returnData.customer_name || returnData.customer_phone) {
    const custStr = `${returnData.customer_name || "Walk-In"} (${returnData.customer_phone || "N/A"})`;
    doc.text(`CUSTOMER: ${custStr}`, margin, y);
    y += 3.5;
  }

  y += 1;
  drawDashedLine(y);
  y += 4;

  // Table Headers
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  doc.text("ITEM", margin, y);
  doc.text("QTY", 42, y, { align: "right" });
  doc.text("PRICE", 57, y, { align: "right" });
  doc.text("REFUND", pageWidth - margin, y, { align: "right" });
  y += 3;
  drawDashedLine(y);
  y += 4;

  // Returned Items Table
  doc.setFont("courier", "normal");
  (returnData.returned_items || []).forEach((item) => {
    const qty = typeof item.quantity === "number" ? item.quantity : parseFloat(String(item.quantity)) || 0;
    const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(String(item.unit_price)) || 0;
    const lineRefund = item.line_refund !== undefined ? item.line_refund : qty * price;

    doc.text(item.item_name, margin, y, { maxWidth: 33 });
    doc.text(qty.toFixed(2), 42, y, { align: "right" });
    doc.text(price.toFixed(2), 57, y, { align: "right" });
    doc.text(lineRefund.toFixed(2), pageWidth - margin, y, { align: "right" });
    y += 4.5;
  });

  y += 1;
  drawDashedLine(y);
  y += 4.5;

  // Total Summary
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL REFUND AMOUNT", margin, y);
  doc.text(`INR ${returnData.total_refund_amount.toFixed(2)}`, pageWidth - margin, y, { align: "right" });

  y += 4.5;
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.text(`REFUND METHOD: ${returnData.refund_payment_method || "CASH"}`, margin, y);

  y += 5;
  drawSolidLine(y);
  y += 4.5;

  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text("*** INVENTORY RESTOCKED ***", pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text("Thank you for shopping with us!", pageWidth / 2, y, { align: "center" });

  if (action === "view") {
    const stringUrl = doc.output("bloburl");
    window.open(stringUrl, "_blank");
  } else {
    doc.save(`Return-Bill-${returnData.return_number}.pdf`);
  }
}

