import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

const aliases = {
  orderId: ["order id", "zomato order id", "swiggy order id", "invoice no", "invoice number"],
  date: ["order date", "date", "bill date", "order time"],
  restaurant: ["restaurant name", "restaurant", "outlet name", "store name"],
  brand: ["brand name", "brand"],
  source: ["order source", "source", "area", "platform"],
  status: ["status", "order status"],
  sales: ["net order value", "final total", "total sales", "gross sales", "order value", "net sales"],
  payout: ["payout", "net payout", "order level payout", "settlement amount", "amount paid"],
  discount: ["discount", "discount amount", "restaurant funded discount", "restaurant discount"],
  commission: ["commission", "commission amount", "service fee", "base service fee"],
  tax: ["tax", "tax amount", "gst", "gst amount"],
  packaging: ["packaging", "packaging charges", "packing charges"],
  item: ["item name", "item", "product name"],
  category: ["category", "category name"],
  quantity: ["quantity", "qty", "quantity sold"],
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  const negative = text.startsWith("(") && text.endsWith(")");
  const parsed = Number(text.replace(/[₹,%()\s,]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}
function cell(row: Row, names: string[]) {
  const key = Object.keys(row).find((item) => names.includes(normalize(item)));
  return key ? row[key] : undefined;
}
function dateValue(input: unknown): string | null {
  if (!input) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input.toISOString();
  if (typeof input === "number") {
    const parsed = XLSX.SSF.parse_date_code(input);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S).toISOString();
  }
  const parsed = new Date(String(input));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function detectMarketplace(fileName: string, rows: Row[], slot: string) {
  if (slot.startsWith("zomato")) return "zomato";
  if (slot.startsWith("swiggy")) return "swiggy";
  if (slot.startsWith("petpooja")) return "petpooja";
  const sample = `${fileName} ${JSON.stringify(rows.slice(0, 20))}`.toLowerCase();
  if (sample.includes("zomato")) return "zomato";
  if (sample.includes("swiggy")) return "swiggy";
  if (sample.includes("petpooja")) return "petpooja";
  return "unknown";
}
function detectReportType(fileName: string, columns: string[], slot: string) {
  if (slot) return slot;
  const text = `${fileName} ${columns.join(" ")}`.toLowerCase();
  if (text.includes("settlement") || text.includes("payout")) return "settlement";
  if (text.includes("item name") || text.includes("quantity sold")) return "item_summary";
  if (text.includes("invoice") || text.includes("order id")) return "order_detail";
  return "unknown";
}
function parseWorkbook(buffer: Buffer, fileName: string, slot: string, selectedStart: string, selectedEnd: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const rows = workbook.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json<Row>(workbook.Sheets[name], { defval: null, raw: true }));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const marketplace = detectMarketplace(fileName, rows, slot);
  const reportType = detectReportType(fileName, columns, slot);
  let restaurantName: string | null = null;
  let detectedStart: string | null = null;
  let detectedEnd: string | null = null;
  const orderFacts: Row[] = [];
  const itemFacts: Row[] = [];

  for (const row of rows) {
    const restaurant = cell(row, aliases.restaurant);
    if (!restaurantName && restaurant) restaurantName = String(restaurant).trim();
    const orderDate = dateValue(cell(row, aliases.date));
    if (orderDate) {
      const day = orderDate.slice(0, 10);
      if (!detectedStart || day < detectedStart) detectedStart = day;
      if (!detectedEnd || day > detectedEnd) detectedEnd = day;
    }
    const orderId = String(cell(row, aliases.orderId) ?? "") || null;
    const sales = num(cell(row, aliases.sales));
    const payout = num(cell(row, aliases.payout));
    const discount = num(cell(row, aliases.discount));
    const commission = num(cell(row, aliases.commission));
    const tax = num(cell(row, aliases.tax));
    const packaging = num(cell(row, aliases.packaging));
    const itemName = cell(row, aliases.item);
    if (sales || payout || orderId) orderFacts.push({ marketplace, external_order_id: orderId, invoice_number: orderId, order_date: orderDate, restaurant_name: restaurant ? String(restaurant) : restaurantName, brand_name: String(cell(row, aliases.brand) ?? "") || null, order_source: String(cell(row, aliases.source) ?? "") || null, order_status: String(cell(row, aliases.status) ?? "") || null, gross_sales: sales, discount_amount: discount, tax_amount: tax, packaging_amount: packaging, commission_amount: commission, other_deductions: 0, net_order_value: sales, payout_amount: payout, raw_row: row });
    if (itemName) itemFacts.push({ marketplace, external_order_id: orderId, invoice_number: orderId, order_date: orderDate, restaurant_name: restaurant ? String(restaurant) : restaurantName, brand_name: String(cell(row, aliases.brand) ?? "") || null, category_name: String(cell(row, aliases.category) ?? "") || null, item_name: String(itemName), quantity: num(cell(row, aliases.quantity)), gross_sales: sales, discount_amount: discount, tax_amount: tax, final_total: sales, raw_row: row });
  }
  const sales = orderFacts.reduce((sum, row) => sum + num(row.gross_sales), 0);
  const payout = orderFacts.reduce((sum, row) => sum + num(row.payout_amount), 0);
  const uniqueOrders = new Set(orderFacts.map((row) => String(row.external_order_id ?? "")).filter(Boolean));
  const orders = uniqueOrders.size || orderFacts.length;
  const summary = { rows: rows.length, orders, sales, payout, discount: orderFacts.reduce((s, r) => s + num(r.discount_amount), 0), commission: orderFacts.reduce((s, r) => s + num(r.commission_amount), 0), tax: orderFacts.reduce((s, r) => s + num(r.tax_amount), 0), packaging: orderFacts.reduce((s, r) => s + num(r.packaging_amount), 0), aov: orders ? sales / orders : 0, payoutRatio: sales ? (payout / sales) * 100 : 0, uploadSlot: slot };
  return { marketplace, reportType, restaurantName, periodStart: selectedStart || detectedStart, periodEnd: selectedEnd || detectedEnd, columns, summary, orderFacts, itemFacts };
}

async function database(path: string, init: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !key) throw new Error("Supabase environment variables are missing.");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "File is required." }, { status: 400 });
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) return NextResponse.json({ success: false, message: "Only XLSX, XLS and CSV files are supported." }, { status: 400 });
    const locationId = String(formData.get("locationId") || "");
    const brandId = String(formData.get("brandId") || "");
    const uploadSlot = String(formData.get("uploadSlot") || "");
    const periodStart = String(formData.get("periodStart") || "");
    const periodEnd = String(formData.get("periodEnd") || "");
    if (!periodStart || !periodEnd) return NextResponse.json({ success: false, message: "Select week start and week end before saving." }, { status: 400 });
    if (periodEnd < periodStart) return NextResponse.json({ success: false, message: "Week end cannot be before week start." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const duplicate = await database(`marketplace_reports?file_hash=eq.${fileHash}&select=id&limit=1`, { method: "GET" });
    if (Array.isArray(duplicate) && duplicate.length) return NextResponse.json({ success: false, duplicate: true, message: "This report is already uploaded." }, { status: 409 });
    const parsed = parseWorkbook(buffer, file.name, uploadSlot, periodStart, periodEnd);
    const created = await database("marketplace_reports", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ marketplace: parsed.marketplace, report_type: parsed.reportType, restaurant_name: parsed.restaurantName, location_id: locationId || null, brand_id: brandId || null, period_start: parsed.periodStart, period_end: parsed.periodEnd, original_file_name: file.name, file_size_bytes: file.size, file_hash: fileHash, processing_status: "processed", detected_columns: parsed.columns, summary: parsed.summary }) });
    const reportId = created?.[0]?.id;
    if (!reportId) throw new Error("Unable to create report record.");
    if (parsed.orderFacts.length) await database("marketplace_order_facts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(parsed.orderFacts.map((row) => ({ ...row, report_id: reportId }))) });
    if (parsed.itemFacts.length) await database("marketplace_item_facts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(parsed.itemFacts.map((row) => ({ ...row, report_id: reportId }))) });
    return NextResponse.json({ success: true, reportId, marketplace: parsed.marketplace, reportType: parsed.reportType, restaurantName: parsed.restaurantName, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, summary: parsed.summary });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to process report." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { locationId?: string; brandId?: string; periodStart?: string; periodEnd?: string };
    const locationId = String(body.locationId || "").trim();
    const brandId = String(body.brandId || "").trim();
    const periodStart = String(body.periodStart || "").trim();
    const periodEnd = String(body.periodEnd || "").trim();

    if (!locationId || !periodStart || !periodEnd) {
      return NextResponse.json({ success: false, message: "Location and week dates are required." }, { status: 400 });
    }

    const brandFilter = brandId
      ? `&brand_id=eq.${encodeURIComponent(brandId)}`
      : "&brand_id=is.null";

    // Delete every report that overlaps the selected week. This also clears older
    // records whose saved period was detected from the file rather than matching
    // the selected dates exactly.
    const query = [
      `location_id=eq.${encodeURIComponent(locationId)}`,
      brandFilter.slice(1),
      `period_start=lte.${encodeURIComponent(periodEnd)}`,
      `period_end=gte.${encodeURIComponent(periodStart)}`,
      "select=id,original_file_name,period_start,period_end",
    ].join("&");

    const reports = await database(`marketplace_reports?${query}`, { method: "GET" });
    const ids = Array.isArray(reports)
      ? reports.map((row: { id?: string }) => row.id).filter((id: unknown): id is string => typeof id === "string" && Boolean(id))
      : [];

    if (!ids.length) {
      return NextResponse.json({ success: true, deleted: 0, message: "No saved database records were found for the selected week and scope." });
    }

    const encodedIds = ids.map((id) => `"${id.replaceAll('"', '')}"`).join(",");
    const factFilter = `report_id=in.(${encodedIds})`;
    const reportFilter = `id=in.(${encodedIds})`;

    await database(`marketplace_order_facts?${factFilter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await database(`marketplace_item_facts?${factFilter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await database(`marketplace_reports?${reportFilter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

    // Verify the parent records are actually gone before reporting success.
    const remaining = await database(`marketplace_reports?${reportFilter}&select=id`, { method: "GET" });
    if (Array.isArray(remaining) && remaining.length) {
      throw new Error("Some report records could not be deleted. Please check Supabase delete permissions.");
    }

    return NextResponse.json({
      success: true,
      deleted: ids.length,
      message: `${ids.length} saved report${ids.length === 1 ? "" : "s"} and linked analysis data cleared successfully.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to clear data." }, { status: 500 });
  }
}
