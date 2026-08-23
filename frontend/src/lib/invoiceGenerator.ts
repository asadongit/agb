import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OrderResponse } from "@/types";
import { ReceiptPdfData } from "./pdfGenerator";

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

function convertToWords(num: number): string {
  if (num === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const n = String(num).padStart(9, "0");
  if (isNaN(num)) return "";
  
  const crore = parseInt(n.substring(0, 2), 10);
  const lakh = parseInt(n.substring(2, 4), 10);
  const thousand = parseInt(n.substring(4, 6), 10);
  const hundred = parseInt(n.substring(6, 7), 10);
  const tens = parseInt(n.substring(7, 9), 10);

  let str = "";
  if (crore) str += (a[crore] || b[crore / 10] + " " + a[crore % 10]) + " Crore ";
  if (lakh) str += (a[lakh] || b[Math.floor(lakh / 10)] + " " + a[lakh % 10]) + " Lakh ";
  if (thousand) str += (a[thousand] || b[Math.floor(thousand / 10)] + " " + a[thousand % 10]) + " Thousand ";
  if (hundred) str += a[hundred] + " Hundred ";
  if (tens) str += (str !== "" ? "and " : "") + (a[tens] || b[Math.floor(tens / 10)] + " " + a[tens % 10]);
  
  return str.trim();
}

export async function generateA4InvoicePDF(
  order: OrderResponse | ReceiptPdfData,
  restaurantName: string = "Tax Invoice",
  menuItemsMap?: Record<string, { name: string; price?: string; tax_rate?: number | string | null; tax_category?: string | null }>,
  storeDetailsOrAction?: any,
  actionOpt: "download" | "view" = "download"
) {
  let storeDetails: any = undefined;
  let action: "download" | "view" = actionOpt;

  if (storeDetailsOrAction === "download" || storeDetailsOrAction === "view") {
    action = storeDetailsOrAction;
  } else if (storeDetailsOrAction && typeof storeDetailsOrAction === "object") {
    storeDetails = storeDetailsOrAction;
  }

  function getOutletField(key: string) {
    if (order && "outlet" in order && order.outlet) {
      return (order.outlet as any)[key];
    }
    if (order && "restaurant" in order && order.restaurant) {
      return (order.restaurant as any)[key];
    }
    return undefined;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let currentY = margin;

  // 1. HEADER SECTION
  const rName = getOutletField("name") || storeDetails?.name || restaurantName;
  const address = getOutletField("address") || storeDetails?.address || "";
  const phone = getOutletField("phone") || storeDetails?.phone || "";
  const email = getOutletField("email") || storeDetails?.email || "";
  const gstin = getOutletField("gstin") || storeDetails?.gstin || "";
  const fssai = getOutletField("fssai_no") || storeDetails?.fssai_no || "";
  const placeOfSupply = getOutletField("place_of_supply") || storeDetails?.place_of_supply || "";
  const logoUrl = getOutletField("logo_url") || storeDetails?.logo_url;

  // Render Logo if exists
  let textStartX = margin;
  if (logoUrl) {
    try {
      const base64Logo = await fetchImageAsBase64(logoUrl);
      doc.addImage(base64Logo, "PNG", margin, currentY, 30, 30);
      textStartX = margin + 35;
    } catch (e) {
      console.error("Failed to load logo", e);
    }
  }

  // Outlet Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(rName.toUpperCase(), textStartX, currentY + 5);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let addrY = currentY + 11;
  if (address) {
    const splitAddress = doc.splitTextToSize(address, pageWidth / 2 - textStartX);
    doc.text(splitAddress, textStartX, addrY);
    addrY += splitAddress.length * 4.5;
  }
  
  if (placeOfSupply) { doc.text(`Place of Supply: ${placeOfSupply}`, textStartX, addrY); addrY += 4.5; }
  if (gstin) { doc.text(`GSTIN: ${gstin}`, textStartX, addrY); addrY += 4.5; }
  if (fssai) { doc.text(`FSSAI: ${fssai}`, textStartX, addrY); addrY += 4.5; }
  if (email) { doc.text(`Email: ${email}`, textStartX, addrY); addrY += 4.5; }
  if (phone) { doc.text(`Phone: ${phone}`, textStartX, addrY); addrY += 4.5; }

  // Title & Invoice Meta (Right Aligned)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TAX INVOICE", pageWidth - margin, currentY + 7, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  
  const invoiceNo = (order as any).invoice_no || (order.id ? order.id.slice(0, 8).toUpperCase() : order.basket_number || "");
  const dateStr = (order as any).date_time || order.created_at || new Date().toISOString();
  const dateStrFormatted = new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
  const timeStrFormatted = new Date(dateStr).toLocaleString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true
  });

  const metaY = currentY + 15;
  const metaLabelX = pageWidth - margin - 45;
  
  doc.text("Invoice No", metaLabelX, metaY);
  doc.text(`: ${invoiceNo}`, metaLabelX + 18, metaY);
  
  doc.text("Date", metaLabelX, metaY + 5);
  doc.text(`: ${dateStrFormatted}`, metaLabelX + 18, metaY + 5);
  doc.text(`  ${timeStrFormatted}`, metaLabelX + 18, metaY + 10);

  // Draw Line
  currentY = Math.max(addrY, metaY + 15) + 5;
  doc.setLineWidth(0.5);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 5;

  // 2. BILLED TO SECTION
  const cName = order.customer_name || (order as any).customer?.name || "Walk-in Customer";
  const cPhone = order.customer_phone || (order as any).customer?.phone || "";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Billed To:", margin, currentY + 4);
  
  doc.setFont("helvetica", "normal");
  doc.text(`Name: ${cName}`, margin, currentY + 9);
  if (cPhone) {
    doc.text(`Phone: ${cPhone}`, margin, currentY + 14);
  }
  
  currentY += 20;

  // 3. ITEMS TABLE
  const tableData = [];
  let totalMrpVal = 0;
  let totalSellingSubtotal = 0;
  let totalTaxSum = 0;

  order.items.forEach((item, index) => {
    let name = item.item_name || "Unknown Item";
    let basePrice = parseFloat(String(item.unit_price)) || 0;
    
    // Resolve MRP and Tax
    let mrpNum = item.mrp ? parseFloat(String(item.mrp)) : undefined;
    let taxRateStr = (item as any).tax_rate ?? (item as any).item_tax_rate ?? null;
    
    if (menuItemsMap && item.menu_item_id && menuItemsMap[item.menu_item_id]) {
      const mi = menuItemsMap[item.menu_item_id];
      if (!name || name === "Unknown Item") name = mi.name;
      if (taxRateStr === null && mi.tax_rate != null) {
        taxRateStr = String(mi.tax_rate);
      }
    }

    const mrp = mrpNum && !isNaN(mrpNum) ? mrpNum : basePrice;
    const taxRate = taxRateStr ? parseFloat(String(taxRateStr)) : 0;
    const isComplimentary = (item as any).is_complimentary === true;
    
    const qty = item.quantity || 1;
    let effectiveRate = isComplimentary ? 0 : basePrice;
    
    // Reverse tax calc (Assuming prices are inclusive of tax)
    const baseAmount = effectiveRate / (1 + (taxRate / 100));
    const taxAmt = effectiveRate - baseAmount;
    
    const lineBaseTotal = baseAmount * qty;
    const lineTaxTotal = taxAmt * qty;
    const lineTotal = effectiveRate * qty;
    
    if (!isComplimentary) {
      totalMrpVal += mrp * qty;
      totalSellingSubtotal += lineTotal;
      totalTaxSum += lineTaxTotal;
    }

    tableData.push([
      index + 1,
      name + (isComplimentary ? "\n(Complimentary)" : ""),
      qty,
      mrp.toFixed(2),
      effectiveRate.toFixed(2),
      `${taxRate}%`,
      lineTaxTotal.toFixed(2),
      lineTotal.toFixed(2)
    ]);
  });

  autoTable(doc, {
    startY: currentY,
    head: [['S.No', 'Item Description', 'Qty', 'MRP (Rs)', 'Rate (Rs)', 'Tax %', 'Tax Amt', 'Total (Rs)']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      2: { halign: 'center', cellWidth: 15 },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 15 },
      6: { halign: 'right', cellWidth: 22 },
      7: { halign: 'right', cellWidth: 25 },
    },
    didDrawPage: (data) => {
      currentY = data.cursor?.y || currentY;
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 5;

  // 4. TOTALS SECTION
  const deliveryCharge = parseFloat(String((order as any).delivery_charge || 0)) || 0;
  const handlingCharge = parseFloat(String((order as any).handling_charge || 0)) || 0;
  
  const discType = (order as any).discount_type;
  const discVal = parseFloat(String((order as any).discount_value || 0)) || 0;
  let extraDiscountRupees = 0;
  let extraDiscountLabel = "Discount";

  if (discType === "PERCENT" && discVal > 0) {
    extraDiscountRupees = totalSellingSubtotal * (discVal / 100);
    extraDiscountLabel = `Discount (${discVal}% OFF)`;
  } else if (discType === "FLAT" && discVal > 0) {
    extraDiscountRupees = discVal;
    extraDiscountLabel = `Discount (Flat Rs.${discVal})`;
  } else if (discType === "COMPLIMENTARY") {
    extraDiscountRupees = totalSellingSubtotal;
    extraDiscountLabel = `Discount (Complimentary)`;
  }

  const pointsRedeemed = (order as any).loyalty_points_redeemed || 0;
  let loyaltyDiscountRupees = 0;
  if (pointsRedeemed > 0) {
    const pointValue = getOutletField("loyalty_point_value_inr") || storeDetails?.loyalty_point_value_inr || 1;
    loyaltyDiscountRupees = pointsRedeemed * parseFloat(String(pointValue));
  }

  const subtotal = totalSellingSubtotal;
  let amountPayable = Math.max(0, subtotal + deliveryCharge + handlingCharge - extraDiscountRupees - loyaltyDiscountRupees);
  const roundOff = Math.round(amountPayable) - amountPayable;
  const finalNetTotal = Math.round(amountPayable);

  const totalsBoxX = pageWidth / 2 + 10;
  const valX = pageWidth - margin;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  let tY = currentY;
  
  const printRightRow = (label: string, val: number, isBold: boolean = false) => {
    if (isBold) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    doc.text(label, totalsBoxX, tY);
    doc.text(val.toFixed(2), valX, tY, { align: "right" });
    tY += 5;
  };

  printRightRow("Subtotal", subtotal);
  if (deliveryCharge > 0) printRightRow("Delivery Charge", deliveryCharge);
  if (handlingCharge > 0) printRightRow("Handling Charge", handlingCharge);
  if (extraDiscountRupees > 0) printRightRow(extraDiscountLabel, -extraDiscountRupees);
  if (loyaltyDiscountRupees > 0) printRightRow(`Loyalty Redemption (${pointsRedeemed} pts)`, -loyaltyDiscountRupees);
  
  if (roundOff !== 0) printRightRow("Round Off", roundOff);
  
  tY += 2;
  doc.setLineWidth(0.2);
  doc.line(totalsBoxX, tY - 5, valX, tY - 5);
  doc.setFontSize(11);
  printRightRow("GRAND TOTAL (Rs)", finalNetTotal, true);
  
  // 5. AMOUNT IN WORDS
  currentY = tY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const words = convertToWords(finalNetTotal);
  doc.text(`Amount in Words: Rupees ${words} Only.`, margin, currentY);

  // 6. FOOTER / TERMS
  currentY += 15;
  const termsStr = getOutletField("invoice_terms_conditions") || storeDetails?.invoice_terms_conditions || "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.";
  
  const footerStartY = currentY;

  if (termsStr) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Terms & Conditions:", margin, footerStartY);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const splitTerms = doc.splitTextToSize(termsStr, pageWidth / 2);
    doc.text(splitTerms, margin, footerStartY + 5);
  }

  // Auth Signatory
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Authorized Signatory", pageWidth - margin, footerStartY, { align: "right" });
  doc.text("____________________", pageWidth - margin, footerStartY + 15, { align: "right" });

  const fileName = `Invoice_${invoiceNo || "Order"}.pdf`;

  if (action === "view") {
    const pdfBlob = doc.output("blob");
    const blobUrl = URL.createObjectURL(pdfBlob);
    window.open(blobUrl, "_blank");
  } else {
    doc.save(fileName);
  }
}
