import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;
type Channel = "zomato" | "swiggy" | "online_other" | "offline";

const aliases = {
  orderId: ["order id", "zomato order id", "swiggy order id", "invoice no", "invoice number", "order number", "order_id"],
  date: ["order date", "date", "bill date", "order time", "order placed at", "transaction date", "settlement date"],
  restaurant: ["restaurant name", "restaurant", "outlet name", "store name", "restaurant id and name", "entity name"],
  brand: ["brand name", "brand"],
  source: ["order source", "source", "area", "platform", "channel", "order type", "service type", "delivery partner", "aggregator"],
  status: ["status", "order status"],
  sales: ["net order value", "final total", "total sales", "gross sales", "order value", "net sales", "subtotal", "bill subtotal", "customer paid", "customer payable", "gross order value", "total order value", "food value", "item total", "total amount"],
  payout: ["payout", "net payout", "order level payout", "settlement amount", "amount paid", "net amount payable", "net payable", "amount payable", "final payout", "bank transfer amount"],
  discount: ["discount", "discount amount", "restaurant funded discount", "restaurant discount", "merchant discount", "promo discount", "total discount"],
  commission: ["commission", "commission amount", "service fee", "base service fee", "platform fee", "commission value", "total commission"],
  tax: ["tax", "tax amount", "gst", "gst amount", "taxes", "tds", "tcs"],
  packaging: ["packaging", "packaging charges", "packing charges", "container charge"],
  item: ["item name", "item", "product name", "dish name", "menu item"],
  category: ["category", "category name", "menu category"],
  quantity: ["quantity", "qty", "quantity sold", "item quantity"],
};

function normalize(value: unknown) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9% ]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  const negative = text.startsWith("(") && text.endsWith(")");
  const parsed = Number(text.replace(/[₹,%()\s,]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}

function cell(row: Row, names: string[]) {
  const normalizedNames = names.map(normalize);
  const exact = Object.keys(row).find((key) => normalizedNames.includes(normalize(key)));
  if (exact) return row[exact];

  const fuzzy = Object.keys(row).find((key) => {
    const normalizedKey = normalize(key);
    if (normalizedKey.length < 4) return false;
    return normalizedNames.some((name) => name.length >= 4 && normalizedKey.includes(name));
  });
  return fuzzy ? row[fuzzy] : undefined;
}

function dateValue(input: unknown): string | null {
  if (!input) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input.toISOString();
  if (typeof input === "number") {
    const parsed = XLSX.SSF.parse_date_code(input);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S).toISOString();
  }
  const text = String(input).trim();
  const dmy = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const parsed = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function headerScore(values: unknown[]) {
  const joined = values.map(normalize).join(" | ");
  const tokens = ["order id", "order date", "restaurant", "settlement", "payout", "commission", "discount", "net order value", "amount payable", "item name", "quantity", "gross sales", "order source", "channel"];
  return tokens.reduce((score, token) => score + (joined.includes(token) ? 1 : 0), 0);
}

function uniqueHeaders(values: unknown[]) {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `Column ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
}

function sheetRows(sheet: XLSX.WorkSheet): Row[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (!matrix.length) return [];
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < Math.min(matrix.length, 40); index += 1) {
    const score = headerScore(matrix[index] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  const headers = uniqueHeaders(matrix[bestIndex] || []);
  return matrix.slice(bestIndex + 1)
    .filter((values) => values.some((value) => value !== null && String(value).trim() !== ""))
    .map((values) => {
      const row: Row = {};
      headers.forEach((header, index) => { row[header] = values[index] ?? null; });
      return row;
    });
}

function classifyChannel(row: Row, slot: string): Channel {
  if (slot === "zomato_payout") return "zomato";
  if (slot === "swiggy_payout") return "swiggy";

  const source = normalize(cell(row, aliases.source));
  const fullRow = normalize(JSON.stringify(row));
  const text = `${source} ${fullRow}`;

  if (text.includes("zomato")) return "zomato";
  if (text.includes("swiggy")) return "swiggy";
  if (source.includes("online") || source.includes("aggregator") || source.includes("delivery")) return "online_other";
  return "offline";
}

function detectMarketplace(slot: string) {
  if (slot === "zomato_payout") return "zomato";
  if (slot === "swiggy_payout") return "swiggy";
  return "petpooja";
}

function parseWorkbook(buffer: Buffer, fileName: string, slot: string, selectedStart: string, selectedEnd: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const rows = workbook.SheetNames.flatMap((name) => sheetRows(workbook.Sheets[name]));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const marketplace = detectMarketplace(slot);
  const reportText = normalize(`${fileName} ${columns.join(" ")} ${JSON.stringify(rows.slice(0, 30))}`);

  if (slot === "zomato_payout" && !reportText.includes("zomato")) {
    throw new Error("This does not appear to be a Zomato payout report. Upload the Zomato settlement file in this row.");
  }
  if (slot === "swiggy_payout" && !reportText.includes("swiggy")) {
    throw new Error("This does not appear to be a Swiggy payout report. Upload the Swiggy settlement file in this row.");
  }

  let restaurantName: string | null = null;
  let detectedStart: string | null = null;
  let detectedEnd: string | null = null;
  let excludedOfflineRows = 0;
  const orderFacts: Row[] = [];
  const itemFacts: Row[] = [];
  const channelBreakdown: Record<string, { orders: number; sales: number; payout: number }> = {};

  for (const row of rows) {
    const channel = classifyChannel(row, slot);
    if (slot.startsWith("petpooja") && channel === "offline") {
      excludedOfflineRows += 1;
      continue;
    }

    const restaurant = cell(row, aliases.restaurant);
    if (!restaurantName && restaurant) restaurantName = String(restaurant).trim();
    const orderDate = dateValue(cell(row, aliases.date));
    if (orderDate) {
      const day = orderDate.slice(0, 10);
      if (!detectedStart || day < detectedStart) detectedStart = day;
      if (!detectedEnd || day > detectedEnd) detectedEnd = day;
    }

    const orderIdValue = cell(row, aliases.orderId);
    const orderId = orderIdValue !== undefined && String(orderIdValue).trim() ? String(orderIdValue).trim() : null;
    const sales = num(cell(row, aliases.sales));
    const payout = num(cell(row, aliases.payout));
    const discount = num(cell(row, aliases.discount));
    const commission = num(cell(row, aliases.commission));
    const tax = num(cell(row, aliases.tax));
    const packaging = num(cell(row, aliases.packaging));
    const itemName = cell(row, aliases.item);

    if (!orderId && !orderDate && !sales && !payout && !itemName) continue;

    const platform = channel === "online_other" ? "online_other" : channel;
    if (!channelBreakdown[platform]) channelBreakdown[platform] = { orders: 0, sales: 0, payout: 0 };
    channelBreakdown[platform].orders += 1;
    channelBreakdown[platform].sales += sales;
    channelBreakdown[platform].payout += payout;

    if (sales || payout || orderId || orderDate) {
      orderFacts.push({
        marketplace: platform,
        external_order_id: orderId,
        invoice_number: orderId,
        order_date: orderDate,
        restaurant_name: restaurant ? String(restaurant) : restaurantName,
        brand_name: String(cell(row, aliases.brand) ?? "") || null,
        order_source: platform,
        order_status: String(cell(row, aliases.status) ?? "") || null,
        gross_sales: sales,
        discount_amount: discount,
        tax_amount: tax,
        packaging_amount: packaging,
        commission_amount: commission,
        other_deductions: 0,
        net_order_value: sales,
        payout_amount: payout,
        raw_row: row,
      });
    }

    if (itemName) {
      itemFacts.push({
        marketplace: platform,
        external_order_id: orderId,
        invoice_number: orderId,
        order_date: orderDate,
        restaurant_name: restaurant ? String(restaurant) : restaurantName,
        brand_name: String(cell(row, aliases.brand) ?? "") || null,
        category_name: String(cell(row, aliases.category) ?? "") || null,
        item_name: String(itemName),
        quantity: num(cell(row, aliases.quantity)) || 1,
        gross_sales: sales,
        discount_amount: discount,
        tax_amount: tax,
        final_total: sales,
        raw_row: row,
      });
    }
  }

  const sales = orderFacts.reduce((sum, row) => sum + num(row.gross_sales), 0);
  const payout = orderFacts.reduce((sum, row) => sum + num(row.payout_amount), 0);
  const uniqueOrders = new Set(orderFacts.map((row) => String(row.external_order_id ?? "")).filter(Boolean));
  const orders = uniqueOrders.size || orderFacts.length;

  return {
    marketplace,
    reportType: slot,
    restaurantName,
    periodStart: selectedStart || detectedStart,
    periodEnd: selectedEnd || detectedEnd,
    columns,
    orderFacts,
    itemFacts,
    summary: {
      scope: "online_only",
      rows: orderFacts.length,
      sourceRows: rows.length,
      excludedOfflineRows,
      orders,
      sales,
      payout,
      discount: orderFacts.reduce((sum, row) => sum + num(row.discount_amount), 0),
      commission: orderFacts.reduce((sum, row) => sum + num(row.commission_amount), 0),
      tax: orderFacts.reduce((sum, row) => sum + num(row.tax_amount), 0),
      packaging: orderFacts.reduce((sum, row) => sum + num(row.packaging_amount), 0),
      aov: orders ? sales / orders : 0,
      payoutRatio: sales ? (payout / sales) * 100 : 0,
      channelBreakdown,
      uploadSlot: slot,
    },
  };
}

async function database(path: string, init: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !key) throw new Error("Supabase environment variables are missing.");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
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

    const locationId = String(formData.get("locationId") || "").trim();
    const brandId = String(formData.get("brandId") || "").trim();
    const uploadSlot = String(formData.get("uploadSlot") || "").trim();
    const periodStart = String(formData.get("periodStart") || "").trim();
    const periodEnd = String(formData.get("periodEnd") || "").trim();

    if (!locationId) return NextResponse.json({ success: false, message: "Select a location before saving." }, { status: 400 });
    if (!periodStart || !periodEnd) return NextResponse.json({ success: false, message: "Select week start and week end before saving." }, { status: 400 });
    if (periodEnd < periodStart) return NextResponse.json({ success: false, message: "Week end cannot be before week start." }, { status: 400 });

    const isLocationReport = uploadSlot.startsWith("petpooja");
    if (!isLocationReport && !brandId) return NextResponse.json({ success: false, message: "Select a brand before uploading Zomato or Swiggy reports." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const effectiveBrandId = isLocationReport ? "" : brandId;
    const brandFilter = effectiveBrandId ? `brand_id=eq.${encodeURIComponent(effectiveBrandId)}` : "brand_id=is.null";
    const duplicateQuery = [`file_hash=eq.${fileHash}`, `location_id=eq.${encodeURIComponent(locationId)}`, brandFilter, `report_type=eq.${encodeURIComponent(uploadSlot)}`, `period_start=eq.${encodeURIComponent(periodStart)}`, `period_end=eq.${encodeURIComponent(periodEnd)}`, "select=id", "limit=1"].join("&");
    const duplicate = await database(`marketplace_reports?${duplicateQuery}`, { method: "GET" });
    if (Array.isArray(duplicate) && duplicate.length) return NextResponse.json({ success: false, duplicate: true, message: "This report is already saved for the selected scope and week." }, { status: 409 });

    const parsed = parseWorkbook(buffer, file.name, uploadSlot, periodStart, periodEnd);
    if (!parsed.summary.rows) {
      const message = uploadSlot.startsWith("petpooja")
        ? "No Zomato, Swiggy or other online orders were detected. Dine-in and offline rows are intentionally excluded."
        : "No usable marketplace rows were found in this report.";
      return NextResponse.json({ success: false, message }, { status: 422 });
    }

    const created = await database("marketplace_reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ marketplace: parsed.marketplace, report_type: parsed.reportType, restaurant_name: parsed.restaurantName, location_id: locationId, brand_id: effectiveBrandId || null, period_start: parsed.periodStart, period_end: parsed.periodEnd, original_file_name: file.name, file_size_bytes: file.size, file_hash: fileHash, processing_status: "processed", detected_columns: parsed.columns, summary: parsed.summary }),
    });

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
    if (!locationId || !periodStart || !periodEnd) return NextResponse.json({ success: false, message: "Location and week dates are required." }, { status: 400 });

    const brandFilter = brandId ? `&brand_id=eq.${encodeURIComponent(brandId)}` : "&brand_id=is.null";
    const query = [`location_id=eq.${encodeURIComponent(locationId)}`, brandFilter.slice(1), `period_start=lte.${encodeURIComponent(periodEnd)}`, `period_end=gte.${encodeURIComponent(periodStart)}`, "select=id"].join("&");
    const reports = await database(`marketplace_reports?${query}`, { method: "GET" });
    const ids = Array.isArray(reports) ? reports.map((row: { id?: string }) => row.id).filter((id: unknown): id is string => typeof id === "string" && Boolean(id)) : [];
    if (!ids.length) return NextResponse.json({ success: true, deleted: 0, message: "No saved database records were found for the selected week and scope." });

    const encodedIds = ids.map((id) => `"${id.replaceAll('"', "")}"`).join(",");
    await database(`marketplace_order_facts?report_id=in.(${encodedIds})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await database(`marketplace_item_facts?report_id=in.(${encodedIds})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await database(`marketplace_reports?id=in.(${encodedIds})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return NextResponse.json({ success: true, deleted: ids.length, message: `${ids.length} saved report${ids.length === 1 ? "" : "s"} and linked online analysis data cleared successfully.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to clear data." }, { status: 500 });
  }
}
