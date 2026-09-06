import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseUTCDate } from "./api";
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
    (restaurantName && restaurantName !== "Outlet Receipt" && restaurantName !== "ApnaGreen Basket" && restaurantName !== "APNAGREEN BASKET" ? restaurantName : null) ||
    "ApnaGreen Basket";
  const storeName = rawStoreName;

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
    const d = parseUTCDate((order as any).created_at);
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
    const lineTotal = (item.line_total !== undefined && item.line_total !== null) ? parseFloat(String(item.line_total)) : qtyVal * price;

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
  } else if (discType === "COMPLIMENTARY_ITEMS" && discVal > 0) {
    extraDiscountRupees = discVal;
    extraDiscountLabel = `Extra Discount (Items)`;
  } else if (discType === "COMPLIMENTARY") {
    extraDiscountRupees = totalSellingSubtotal;
    extraDiscountLabel = `Extra Discount (Complimentary)`;
  }

  const pointsRedeemed = (order as any).loyalty_points_redeemed || 0;
  let loyaltyDiscountRupees = 0;
  if (pointsRedeemed > 0) {
    const rest = getOutletField("loyalty_redemption_tiers") ? {
      loyalty_redemption_tiers: getOutletField("loyalty_redemption_tiers"),
      loyalty_max_bill_percentage: getOutletField("loyalty_max_bill_percentage"),
    } : (storeDetails || (order as any).restaurant || {});
    
    // We try to find the tier that gives the discount. Since we don't have the historical total balance here,
    // we use the current balance from customer, or default to the highest tier that pointsRedeemed could fit in.
    const currentBalance = (order as any).customer?.loyalty_points || pointsRedeemed; // Best effort fallback
    const tiers: any[] = rest.loyalty_redemption_tiers || [];
    const sortedTiers = [...tiers].sort((a, b) => b.min_points - a.min_points);
    const applicableTier = sortedTiers.find(t => currentBalance >= t.min_points);
    
    const pointValue = applicableTier ? (applicableTier.discount_percentage / 100) : 0;
    const maxBillPercentage = parseFloat(String(rest.loyalty_max_bill_percentage || "100.00"));
    
    const requestedDiscount = pointsRedeemed * pointValue;
    const maxAllowedDiscount = (maxBillPercentage / 100) * totalSellingSubtotal;
    loyaltyDiscountRupees = Math.min(requestedDiscount, maxAllowedDiscount);
  }

  const amountPayable = Math.max(0, totalSellingSubtotal - extraDiscountRupees - loyaltyDiscountRupees);

  const creditApplied = parseFloat(String((order as any).credit_applied || 0)) || 0;
  const debitApplied = parseFloat(String((order as any).debit_applied || 0)) || 0;

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);

  if (mrpSavings > 0 || extraDiscountRupees > 0 || loyaltyDiscountRupees > 0) {
    if (mrpSavings > 0 || extraDiscountRupees > 0 || loyaltyDiscountRupees > 0) {
      doc.text("Total MRP Value", margin, summaryY);
      doc.text(`INR ${totalMrpVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }

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

  // Only distribute bill-level discounts (PERCENT and FLAT) across items.
  // Item-level discounts (COMPLIMENTARY_ITEMS, COMPLIMENTARY) shouldn't reduce the taxable base of paid items.
  let taxableSubtotal = totalSellingSubtotal;
  if (discType === "COMPLIMENTARY_ITEMS" || discType === "COMPLIMENTARY") {
    taxableSubtotal = amountPayable + loyaltyDiscountRupees; // Paid items subtotal before bill-level discounts
  }
  
  // Calculate ratio of actual paid amount to the taxable subtotal (handles FLAT/PERCENT)
  const discountRatio = taxableSubtotal > 0 ? ((amountPayable + loyaltyDiscountRupees) / taxableSubtotal) : 0;

  const taxGroupMap: Record<number, { base: number; tax: number }> = {};

  ((order as any).items || []).forEach((item: any) => {
    if (item.is_complimentary === true || item.is_complimentary === 1 || item.is_complimentary === "true" || item.is_complimentary === "1") return;
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

    if (itemTaxRate >= 0) {
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

  summaryY += 6;

  const debtSettled = parseFloat(String((order as any).debt_settled || 0)) || 0;
  const creditAwarded = parseFloat(String((order as any).credit_awarded || 0)) || 0;
  const creditCashedOut = parseFloat(String((order as any).credit_cashed_out || 0)) || 0;
  
  let netPaid = netTotal;

  if (creditApplied > 0 || debitApplied > 0 || debtSettled > 0 || creditAwarded > 0 || creditCashedOut > 0) {
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      
      if (creditApplied > 0) {
          doc.text("Credit Applied", margin, summaryY);
          doc.text(`- INR ${creditApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= creditApplied;
      }
      
      if (debitApplied > 0) {
          doc.text("Debit (Shortfall)", margin, summaryY);
          doc.text(`- INR ${debitApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= debitApplied;
      }
      
      if (debtSettled > 0) {
          doc.text("Debt Settled", margin, summaryY);
          doc.text(`+ INR ${debtSettled.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += debtSettled;
      }
      
      if (creditAwarded > 0) {
          doc.text("Credit Awarded", margin, summaryY);
          doc.text(`+ INR ${creditAwarded.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += creditAwarded;
      }
      
      if (creditCashedOut > 0) {
          doc.text("Credit Cashed Out", margin, summaryY);
          doc.text(`- INR ${creditCashedOut.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= creditCashedOut;
      }
      
      summaryY += 1;
      drawSolidLine(summaryY + 2);
      summaryY += 6;
      doc.setFont("courier", "bold");
      doc.setFontSize(8.5);
      doc.text("NET PAID", margin, summaryY);
      doc.text(`INR ${netPaid.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 1;
      drawSolidLine(summaryY + 2);
  }

  const customerBalanceRaw = (order as any).customer_balance;
  if (customerBalanceRaw !== undefined && customerBalanceRaw !== null) {
      const customerBalance = parseFloat(String(customerBalanceRaw)) || 0;
      summaryY += 5;
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      if (customerBalance >= 0) {
          doc.text("Store Credit", margin, summaryY);
          doc.text(`INR ${customerBalance.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      } else {
          doc.text("Outstanding Debit", margin, summaryY);
          doc.text(`INR ${Math.abs(customerBalance).toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      }
      summaryY += 2;
  }

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
  restaurant: any,
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
  topItems: Array<{ name: string; category_name?: string | null; quantity_sold: number; revenue: number; revenue_share_pct: number }>,
  funnelStages: Array<{ stage_label: string; count: number; percentage: number }>
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "EXECUTIVE SALES & ANALYTICS REPORT", dateRangeLabel);

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
    head: [["Item Name", "Category", "Qty Sold", "Revenue (INR)", "Revenue Share %"]],
    body: topItems.slice(0, 10).map((item) => [
      item.name,
      item.category_name || "-",
      item.quantity_sold,
      `INR ${item.revenue.toFixed(2)}`,
      `${item.revenue_share_pct.toFixed(1)}%`
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

  doc.save(`Sales-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
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
    unit_price: number | string;
    mrp?: number | string;
    line_refund?: number | string;
    tax_rate?: number | string | null;
    reason?: string;
  }>;
  total_refund_amount: number;
  refund_payment_method?: string;
  created_at?: string;
  processed_at?: string;
  credit_applied?: number;
  credit_cashed_out?: number;
  debt_settled?: number;
  credit_awarded?: number;
  debit_applied?: number;
  wallet_balance_after?: number | null;
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
}

export async function generateReturnReceiptPDF(
  returnData: ReturnPdfData,
  restaurantName: string = "ApnaGreen Basket",
  storeDetailsOrAction?: any,
  actionOpt: "download" | "view" = "download"
) {
  let storeDetails: any = undefined;
  let action: "download" | "view" = actionOpt;
  if (storeDetailsOrAction === "download" || storeDetailsOrAction === "view") {
    action = storeDetailsOrAction;
  } else if (storeDetailsOrAction) {
    storeDetails = storeDetailsOrAction;
  }

  // Fallback to embedded restaurant info if explicit storeDetails not provided
  if (!storeDetails && returnData.restaurant) {
    storeDetails = returnData.restaurant;
  }

  const getOutletField = (field: string) => {
    return storeDetails?.[field] || returnData.restaurant?.[field as keyof typeof returnData.restaurant] || undefined;
  };

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

  // 1. STORE HEADER
  const logoUrlRaw = getOutletField("logo_url");
  let logoUrl = null;
  if (logoUrlRaw) {
    logoUrl = logoUrlRaw.startsWith("http") ? logoUrlRaw : (typeof window !== "undefined" ? window.location.origin : "") + logoUrlRaw;
  } else if (storeDetails && typeof storeDetails.logo === "string") {
    logoUrl = storeDetails.logo.startsWith("http") ? storeDetails.logo : (typeof window !== "undefined" ? window.location.origin : "") + storeDetails.logo;
  }

  if (logoUrl) {
    try {
      const base64Img = await Promise.race([
        fetchImageAsBase64(logoUrl),
        new Promise<string>((_, reject) => setTimeout(() => reject("Timeout"), 3000))
      ]);
      const imgWidth = 20;
      const imgHeight = 20;
      doc.addImage(base64Img, (pageWidth - imgWidth) / 2, y, imgWidth, imgHeight);
      y += imgHeight + 4;
    } catch (e) {
      console.warn("Failed to load logo", e);
    }
  }

  const rawStoreName =
    getOutletField("name") ||
    (restaurantName && restaurantName !== "Outlet Receipt" && restaurantName !== "ApnaGreen Basket" && restaurantName !== "APNAGREEN BASKET" ? restaurantName : null) ||
    "ApnaGreen Basket";
  const storeName = rawStoreName;

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
    } catch { }
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

  y -= 1;
  drawDashedLine(y);

  // 2. CASH MEMO TITLE & BILL METADATA
  y += 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("RETURN INVOICE", pageWidth / 2, y, { align: "center" });

  y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);

  const invoiceNo = returnData.return_number;
  const timestamp = returnData.processed_at || returnData.created_at || new Date().toISOString();
  let orderDateStr = "";
  if (timestamp) {
    const d = parseUTCDate(timestamp);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
    orderDateStr = `${day}/${month}/${year}, ${formattedHours}:${minutes} ${ampm}`;
  }
  
  doc.text(`Return No : #${invoiceNo}`, margin, y);
  
  y += 3.5;
  const origBill = returnData.original_bill_number || (returnData.order_id ? `#${returnData.order_id.slice(0, 8).toUpperCase()}` : "Direct Return");
  doc.text(`Orig Bill : ${origBill}`, margin, y);

  y += 3.5;
  doc.text(`Date      : ${orderDateStr || "N/A"}`, margin, y);

  y += 3.5;
  const guestName = returnData.customer_name || "Walk-In";
  doc.text(`Customer  : ${guestName}`, margin, y);
  
  const guestPhone = returnData.customer_phone;
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
  let totalMrpVal = 0;
  let totalRefundValue = 0;
  
  const tableData = (returnData.returned_items || []).map((item: any, idx: number) => {
    const dishName = item.item_name || `Item #${idx + 1}`;
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const qtyStr = qtyVal % 1 === 0 ? qtyVal.toFixed(0) : String(qtyVal);
    const price = parseFloat(String(item.unit_price || "0"));
    const mrpVal = item.mrp ? parseFloat(String(item.mrp)) : price;
    const lineTotal = item.line_refund !== undefined ? parseFloat(String(item.line_refund)) : qtyVal * price;

    totalMrpVal += mrpVal * qtyVal;
    totalRefundValue += lineTotal;

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

  // 4. TAX & FINANCIAL SUMMARY GRID
  let summaryY = finalY + 4;
  
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);

  const mrpSavings = Math.max(0, totalMrpVal - totalRefundValue);

  if (mrpSavings > 0) {
    doc.text("Total MRP Value", margin, summaryY);
    doc.text(`INR ${totalMrpVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;

    doc.text("Product Discount", margin, summaryY);
    doc.text(`- INR ${mrpSavings.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
    
    summaryY += 1;
    drawDashedLine(summaryY);
    summaryY += 4.5;
  }

  doc.setFont("courier", "bold");
  doc.text("Total Refund (GST Inclusive)", margin, summaryY);
  doc.text(`INR ${totalRefundValue.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  summaryY += 4.5;
  doc.setFont("courier", "normal");

  const taxGroupMap: Record<number, { base: number; tax: number }> = {};
  (returnData.returned_items || []).forEach((item: any) => {
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const price = parseFloat(String(item.unit_price || "0"));
    const lineTotal = item.line_refund !== undefined ? parseFloat(String(item.line_refund)) : qtyVal * price;

    let itemTaxRate = 0;
    if (item.tax_rate !== undefined && item.tax_rate !== null) {
      itemTaxRate = parseFloat(String(item.tax_rate));
    }

    if (itemTaxRate >= 0) {
      const base = lineTotal / (1 + (itemTaxRate / 100));
      const taxAmount = lineTotal - base;

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

  const netRefund = Math.round(totalRefundValue);
  const roundOff = netRefund - totalRefundValue;

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  
  if (Math.abs(roundOff) > 0.001) {
    summaryY += 1;
    drawDashedLine(summaryY);
    summaryY += 4.5;
    
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
  doc.text("NET REFUND", margin, summaryY);
  doc.text(`INR ${netRefund.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  
  summaryY += 2;
  drawSolidLine(summaryY);
  summaryY += 5;

  let netPaid = netRefund;
  const creditApplied = returnData.credit_applied || 0;
  const debitApplied = returnData.debit_applied || 0;
  const debtSettled = returnData.debt_settled || 0;
  const creditAwarded = returnData.credit_awarded || 0;
  const creditCashedOut = returnData.credit_cashed_out || 0;

  if (creditApplied > 0 || debitApplied > 0 || debtSettled > 0 || creditAwarded > 0 || creditCashedOut > 0) {
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      
      if (creditApplied > 0) {
          doc.text("Credit Applied (to Exchange)", margin, summaryY);
          doc.text(`+ INR ${creditApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += creditApplied;
      }
      
      if (debitApplied > 0) {
          doc.text("Debit (Shortfall Unpaid)", margin, summaryY);
          doc.text(`+ INR ${debitApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += debitApplied;
      }
      
      if (debtSettled > 0) {
          doc.text("Debt Settled", margin, summaryY);
          doc.text(`- INR ${debtSettled.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= debtSettled;
      }
      
      if (creditAwarded > 0) {
          doc.text("Credit Awarded", margin, summaryY);
          doc.text(`- INR ${creditAwarded.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= creditAwarded;
      }
      
      if (creditCashedOut > 0) {
          doc.text("Credit Cashed Out", margin, summaryY);
          doc.text(`+ INR ${creditCashedOut.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += creditCashedOut;
      }
      
      summaryY += 1;
      drawSolidLine(summaryY + 2);
      summaryY += 6;
      doc.setFont("courier", "bold");
      doc.setFontSize(8.5);
      doc.text("NET SETTLEMENT (CASH)", margin, summaryY);
      doc.text(`INR ${netPaid.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 1;
      drawSolidLine(summaryY + 2);
  }

  const customerBalanceRaw = returnData.wallet_balance_after;
  if (customerBalanceRaw !== undefined && customerBalanceRaw !== null) {
      const customerBalance = parseFloat(String(customerBalanceRaw)) || 0;
      summaryY += 5;
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      if (customerBalance >= 0) {
          doc.text("Store Credit Balance", margin, summaryY);
          doc.text(`INR ${customerBalance.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      } else {
          doc.text("Outstanding Debit", margin, summaryY);
          doc.text(`INR ${Math.abs(customerBalance).toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      }
      summaryY += 2;
  }

  // 5. FOOTER & QR CODE
  summaryY += 8;
  
  if (billQrUrlRaw) {
    try {
      const qrDataUrl = await QRCode.toDataURL(billQrUrlRaw, { margin: 1, width: 60 });
      const qrSize = 25;
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
  
  doc.link(badgesStartX, summaryY, badgeWidth, badgeHeight, { url: "https://play.google.com/store/apps/details?id=com.apnagreenbasket" });
  doc.link(badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight, { url: "https://www.apple.com/app-store/" });
  
  summaryY += badgeHeight + 6;

  // 6. STATUS STAMP & FOOTER
  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  doc.text(`STATUS: REFUND PROCESSED (${returnData.refund_payment_method || "CASH"})`, pageWidth / 2, summaryY, { align: "center" });

  summaryY += 4.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text("*** INVENTORY RESTOCKED ***", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 3.5;
  doc.text("Thank you for shopping with us!", pageWidth / 2, summaryY, { align: "center" });
  
  summaryY += 5;
  
  // Optional: Trim page height to fit content if we went over or under
  if (typeof doc.deletePage === 'function' && typeof doc.addPage === 'function' && doc.internal.pageSize.getHeight() !== summaryY) {
    // Note: jsPDF format modification after creation is complex, so we skip dynamic trim here for safety unless explicitly handled
  }

  if (action === "download") {
    doc.save(`Return-${invoiceNo}.pdf`);
  } else {
    window.open(doc.output("bloburl"), "_blank");
  }
}

// ==========================================
// DYNAMIC ANALYTICS PDF GENERATORS
// ==========================================

function drawHeader(doc: any, restaurant: any, title: string, dateRangeLabel: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(0, 112, 243);
  doc.rect(0, 0, pageWidth, 35, "F");
  
  doc.setTextColor(255, 255, 255);

  const resName = restaurant?.name || "ApnaGreen Basket";

  // Left Column
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(resName, 14, 14);
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 21);
  
  doc.setFontSize(9);
  doc.text(`Period: ${dateRangeLabel} | Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 28);

  // Right Column (Right-Aligned)
  if (restaurant) {
    const startX = pageWidth - 14;
    let currentY = 14;
    
    doc.setFontSize(8);
    const rightAlign = (txt: string, y: number) => {
      if (txt) doc.text(txt, startX, y, { align: "right" });
    };

    if (restaurant.address) { rightAlign(restaurant.address, currentY); currentY += 5; }
    
    const contactParts = [];
    if (restaurant.phone) contactParts.push(restaurant.phone);
    if (restaurant.email) contactParts.push(restaurant.email);
    if (contactParts.length) { rightAlign(contactParts.join(" | "), currentY); currentY += 5; }
    
    const legalParts = [];
    if (restaurant.gstin) legalParts.push(`GSTIN: ${restaurant.gstin}`);
    if (restaurant.fssai_no) legalParts.push(`FSSAI: ${restaurant.fssai_no}`);
    if (legalParts.length) { rightAlign(legalParts.join(" | "), currentY); currentY += 5; }
  }

  return 45;
}

export function generateInventoryPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  stockMovementData: any,
  stockIntakeData: any,
  wastageData: any,
  purchaseReturnData: any,
  supplierSpendData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "INVENTORY & STOCK REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  
  if (stockMovementData?.items) {
    doc.text("1. Stock Movement (Top 15 Items)", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Item", "Opening", "In (+)", "Out (-)", "Adj", "Closing"]],
      body: stockMovementData.items.slice(0, 15).map((i: any) => [
        i.item_name, 
        i.opening_stock, 
        i.intake_qty + i.restock_qty > 0 ? `+${i.intake_qty + i.restock_qty}` : "0", 
        i.sales_deduction_qty + i.purchase_return_qty + i.void_batch_qty > 0 ? `-${i.sales_deduction_qty + i.purchase_return_qty + i.void_batch_qty}` : "0", 
        i.manual_adjustment_qty, 
        `${i.closing_stock} ${i.unit}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (stockIntakeData?.items) {
    doc.text("2. Recent Stock Intakes", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item", "Batch", "Qty", "Unit Cost", "Supplier"]],
      body: stockIntakeData.items.slice(0, 10).map((i: any) => [
        new Date(i.intake_date).toLocaleDateString(), i.item_name, i.batch_number || "-", i.quantity, `INR ${i.unit_cost}`, i.supplier_name
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  if (wastageData?.items) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("3. Wastage Log", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item", "Qty", "Loss (INR)", "Reason"]],
      body: wastageData.items.slice(0, 10).map((w: any) => [
        new Date(w.date).toLocaleDateString(), w.item_name, w.quantity, w.loss_value, w.reason
      ]),
      theme: "grid", headStyles: { fillColor: [220, 38, 38] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (purchaseReturnData?.items) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("4. Purchase Returns", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item", "Supplier", "Qty", "Refund (INR)", "Reason"]],
      body: purchaseReturnData.items.slice(0, 10).map((r: any) => [
        new Date(r.created_at).toLocaleDateString(), r.item_name, r.supplier_name, r.quantity, r.total_refund_amount, r.reason
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (supplierSpendData?.suppliers) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("5. Supplier Spend Analysis", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Supplier Name", "Total Intakes", "Qty Supplied", "Total Spend (INR)", "% Share"]],
      body: supplierSpendData.suppliers.map((s: any) => [
        s.supplier_name, s.total_intakes, s.total_quantity, s.total_spend, `${s.share_pct.toFixed(1)}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
  }

  doc.save(`Inventory-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateCustomersPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  newCustomerData: any,
  customerReturnData: any,
  loyaltyData: any,
  abandonedCartData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CUSTOMERS & LOYALTY REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (newCustomerData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("1. Acquisition Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["New Customers (Period)", newCustomerData.total_new_customers],
        ["Total Customers (All Time)", newCustomerData.total_customers_all_time]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    
    if (newCustomerData.recent_customers) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text("2. Recently Boarded Customers", 14, y);
      y += 6;
      (autoTable as any)(doc, {
        startY: y,
        head: [["Join Date", "Name", "Contact", "Total Orders", "Total Spent"]],
        body: newCustomerData.recent_customers.map((c: any) => [
          new Date(c.created_at).toLocaleDateString(), c.name || "Unknown", c.phone || c.email || "N/A", c.total_orders, `INR ${c.total_spent}`
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }
  
  if (customerReturnData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("3. Customer Returns Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Total Returns", customerReturnData.total_returns ?? 0],
        ["Total Refund Amount", `INR ${(customerReturnData.total_refund_amount ?? 0).toFixed(2)}`],
        ["Return Rate %", `${(customerReturnData.return_rate_pct ?? 0).toFixed(2)}%`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    if (customerReturnData.top_returned_items?.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text("4. Top Returned Items", 14, y);
      y += 6;
      (autoTable as any)(doc, {
        startY: y,
        head: [["Item Name", "Return Count", "Qty Returned", "Total Refunded (INR)"]],
        body: customerReturnData.top_returned_items.map((item: any) => [
          item.item_name,
          item.return_count,
          item.total_quantity_returned,
          `INR ${(item.total_refund_amount ?? 0).toFixed(2)}`
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    if (customerReturnData.returns?.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text("5. Customer Returns Log", 14, y);
      y += 6;
      (autoTable as any)(doc, {
        startY: y,
        head: [["Date", "Return #", "Customer", "Items Qty", "Refund"]],
        body: customerReturnData.returns.slice(0, 15).map((r: any) => [
          new Date(r.created_at).toLocaleDateString(), r.return_number, r.customer_name || r.customer_phone || "N/A", r.items_returned, `INR ${r.total_refund_amount}`
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  if (loyaltyData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("6. Loyalty Program Performance", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Total Points Earned", loyaltyData.total_points_earned],
        ["Total Points Redeemed", loyaltyData.total_points_redeemed],
        ["Net Outstanding Points", loyaltyData.net_outstanding_points],
        ["Customers with Points", loyaltyData.total_customers_with_points],
        ["Avg Points/Customer", loyaltyData.avg_points_per_customer],
        ["Redemption Rate", `${loyaltyData.redemption_rate_pct}%`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (abandonedCartData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("7. Abandoned Cart Analysis", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Total Abandoned", abandonedCartData.total_abandoned],
        ["Total Converted", abandonedCartData.total_converted],
        ["Conversion Rate", `${abandonedCartData.conversion_rate_pct}%`],
        ["Total Abandoned Value", `INR ${abandonedCartData.total_abandoned_value}`],
        ["Avg Cart Value", `INR ${abandonedCartData.avg_cart_value}`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(`Customers-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateFinancialPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  profitData: any,
  billProfitData: any,
  taxSummaryData: any,
  cashDenomData: any,
  outletEarningsData?: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "FINANCIAL & TAX REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (profitData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("1. Profit Margin Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Gross Revenue", "COGS", "Gross Profit", "Margin %"]],
      body: [
        [`INR ${profitData.total_revenue}`, `INR ${profitData.total_cogs}`, `INR ${profitData.total_profit}`, `${profitData.overall_margin_pct}%`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (billProfitData?.bills) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("2. Bill-wise Profit Breakdown (Top 15)", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Bill #", "Date", "Revenue", "Est. COGS", "Est. Profit", "Margin %"]],
      body: billProfitData.bills.slice(0, 15).map((b: any) => [
        b.basket_number, new Date(b.created_at).toLocaleDateString(), b.total_amount, b.estimated_cogs, b.estimated_profit, `${b.margin_pct}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  if (taxSummaryData?.slabs) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("3. Tax Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Tax Category", "Rate %", "Taxable Amt", "Tax Collected"]],
      body: taxSummaryData.slabs.map((t: any) => [
        t.tax_category, t.tax_rate, `INR ${t.taxable_amount}`, `INR ${t.tax_collected}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (cashDenomData?.overall_denominations) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("4. Cash Denominations (Drawer)", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Denomination", "Notes In", "Notes Out", "Net Notes", "Net Value"]],
      body: cashDenomData.overall_denominations.map((d: any) => [
        d.denomination, d.notes_in, d.notes_out, d.net_notes, `INR ${d.net_value}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (outletEarningsData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("5. Outlet Earnings Ledger", 14, y);
    y += 6;
    
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value (INR)"]],
      body: [
        ["Gross Revenue", `+ ${outletEarningsData.gross_revenue}`],
        ["Loyalty Value Redeemed", `- ${outletEarningsData.total_loyalty_discounts}`],
        ["Store Credit Applied", `- ${outletEarningsData.total_credit_applied}`],
        ["Udhaar Given (Shortfalls)", `- ${outletEarningsData.total_udhaar_given}`],
        ["Udhaar Recovered (Debt Settled)", `+ ${outletEarningsData.total_udhaar_recovered}`],
        ["Credit Cashed Out (Drawer)", `- ${outletEarningsData.total_credit_cashed_out}`],
        ["Credit Awarded (Drawer)", `+ ${outletEarningsData.total_credit_awarded}`],
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 5;
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74); // Green
    doc.text(`NET DRAWER EARNINGS: INR ${outletEarningsData.net_drawer_earnings.toFixed(2)}`, 14, y + 5);
    doc.setTextColor(0, 0, 0); // Reset
    y += 15;
  }

  doc.save(`Financial-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateDayBookPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  dayBookData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "DAY BOOK LEDGER", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (dayBookData) {
    doc.text(`Opening Balance: INR ${dayBookData.opening_cash}`, 14, y);
    y += 6;
    
    if (dayBookData.entries) {
      (autoTable as any)(doc, {
        startY: y,
        head: [["Time", "Type", "Ref", "Description", "Debit (Out)", "Credit (In)", "Balance"]],
        body: dayBookData.entries.map((e: any) => [
          new Date(e.timestamp).toLocaleTimeString(), e.entry_type.replace(/_/g, " "), e.reference_number || "-", e.description, 
          e.debit > 0 ? e.debit : "", e.credit > 0 ? e.credit : "", e.running_balance
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
    
    doc.text(`Closing Balance: INR ${dayBookData.closing_balance}`, 14, y);
  }

  doc.save(`DayBook-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateSalesPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  categorySalesData: any,
  itemSalesData: any,
  aovData: any,
  paymentMixData: any,
  discountData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "SALES & ORDERS REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (categorySalesData?.items) {
    doc.text("1. Sales by Category", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Category", "Qty Sold", "Revenue", "% of Total"]],
      body: categorySalesData.items.map((c: any) => [
        c.category_name, c.quantity_sold, `INR ${c.revenue.toFixed(2)}`, `${c.revenue_share_pct.toFixed(1)}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (itemSalesData?.items) {
    doc.text("2. Item-wise Sales", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Item Name", "Category", "Qty Sold", "Revenue"]],
      body: itemSalesData.items.slice(0, 15).map((i: any) => [
        i.item_name, i.category_name || "-", i.quantity_sold, `INR ${i.revenue.toFixed(2)}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (aovData?.trend) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("3. Average Order Value (AOV)", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Orders", "AOV"]],
      body: aovData.trend.slice(0, 15).map((t: any) => [
        new Date(t.bucket).toLocaleDateString(), t.orders_count, `INR ${t.avg_order_value.toFixed(2)}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (paymentMixData?.methods) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("4. Payment Mix", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Method", "Txn Count", "Revenue", "% of Total"]],
      body: paymentMixData.methods.map((p: any) => [
        p.payment_method.replace(/_/g, " "), p.orders_count, `INR ${p.total_revenue.toFixed(2)}`, `${p.revenue_share_pct.toFixed(1)}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (discountData?.by_type) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("5. Discounts & Offers", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Type", "Usage Count", "Discount Value"]],
      body: discountData.by_type.map((d: any) => [
        d.discount_type, d.count, `INR ${d.total_amount.toFixed(2)}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
  }

  doc.save(`Sales-Orders-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}
