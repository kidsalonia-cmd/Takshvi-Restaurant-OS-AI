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

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  const negative = text.startsWith("(") && text.endsWith(")");
  const parsed = Number(text.replace(/[₹,%()\s,]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function value(row: Row, names: string[]) {
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

function detectMarketplace(fileName: string, rows: Row[]) {
  const sample = `${fileName} ${JSON.stringify(rows.slice(0, 25))}`.toLowerCase();
  if (sample.includes("zomato")) return "zomato";
  if (sample.includes("swiggy")) return "swiggy";
  if (sample.includes("petpooja")) return "petpooja";
  return "unknown";
}

function detectReportType(fileName: string, columns: string[]) {
  const text = `${fileName} ${columns.join(" ")}`.toLowerCase();
  if (text.includes("settlement") || text.includes("payout")) return "settlement";
  if (text.includes("item name") || text.includes("quantity sold")) return "item_summary";
  if (text.includes("invoice") || text.includes("order id")) return "order_detail";
  return "unknown";
}

function parseWorkbook(buffer: Buffer, fileName: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const rows = workbook.SheetNames.flatMap((name) =>
    XLSX.utils.sheet_to_json<Row>(workbook.Sheets[name], { defval: null, raw: true }),
  );

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const marketplace = detectMarketplace(fileName, rows);
  const reportType = detectReportType(fileName, columns);
  let restaurantName: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  const orderFacts: Row[] = [];
  const itemFacts: Row[] = [];

  for (const row of rows) {
    const restaurant = value(row, aliases.restaurant);
    if (!restaurantName && restaurant) restaurantName = String(restaurant).trim();

    const orderDate = dateValue(value(row, aliases.date));
    if (orderDate) {
      const day = orderDate.slice(0, 10);
      if (!periodStart || day < periodStart) periodStart = day;
      if (!periodEnd || day > periodEnd) periodEnd = day;
    }

    const orderId = String(value(row, aliases.orderId) ?? "") || null;
    const sales = numberValue(value(row, aliases.sales));
    const payout = numberValue(value(row, aliases.payout));
    const discount = numberValue(value(row, aliases.discount));
    const commission = numberValue(value(row, aliases.commission));
    const tax = numberValue(value(row, aliases.tax));
    const packaging = numberValue(value(row, aliases.packaging));
    const itemName = value(row, aliases.item);

    if (sales || payout || orderId) {
      orderFacts.push({
        marketplace,
        external_order_id: orderId,
        invoice_number: orderId,
        order_date: orderDate,
        restaurant_name: restaurant ? String(restaurant) : restaurantName,
        brand_name: String(value(row, aliases.brand) ?? "") || null,
        order_source: String(value(row, aliases.source) ?? "") || null,
        order_status: String(value(row, aliases.status) ?? "") || null,
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
        marketplace,
        external_order_id: orderId,
        invoice_number: orderId,
        order_date: orderDate,
        restaurant_name: restaurant ? String(restaurant) : restaurantName,
        brand_name: String(value(row, aliases.brand) ?? "") || null,
        category_name: String(value(row, aliases.category) ?? "") || null,
        item_name: String(itemName),
        quantity: numberValue(value(row, aliases.quantity)),
        gross_sales: sales,
        discount_amount: discount,
        tax_amount: tax,
        final_total: sales,
        raw_row: row,
      });
    }
  }

  const sales = orderFacts.reduce((sum, row) => sum + numberValue(row.gross_sales), 0);
  const payout = orderFacts.reduce((sum, row) => sum + numberValue(row.payout_amount), 0);
  const uniqueOrders = new Set(orderFacts.map((row) => String(row.external_order_id ?? "")).filter(Boolean));
  const orders = uniqueOrders.size || orderFacts.length;

  const summary = {
    rows: rows.length,
    orders,
    sales,
    payout,
    discount: orderFacts.reduce((sum, row) => sum + numberValue(row.discount_amount), 0),
    commission: orderFacts.reduce((sum, row) => sum + numberValue(row.commission_amount), 0),
    tax: orderFacts.reduce((sum, row) => sum + numberValue(row.tax_amount), 0),
    packaging: orderFacts.reduce((sum, row) => sum + numberValue(row.packaging_amount), 0),
    aov: orders ? sales / orders : 0,
    payoutRatio: sales ? (payout / sales) * 100 : 0,
  };

  const groupedItems = itemFacts.reduce<Record<string, { item: string; quantity: number; sales: number }>>((acc, row) => {
    const item = String(row.item_name || "Unknown");
    acc[item] ??= { item, quantity: 0, sales: 0 };
    acc[item].quantity += numberValue(row.quantity);
    acc[item].sales += numberValue(row.final_total);
    return acc;
  }, {});

  return {
    marketplace,
    reportType,
    restaurantName,
    periodStart,
    periodEnd,
    columns,
    summary,
    orderFacts,
    itemFacts,
    topItems: Object.values(groupedItems).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
  };
}

async function database(path: string, init: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !key) throw new Error("Supabase environment variables are missing.");

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
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
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "File is required." }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
      return NextResponse.json({ success: false, message: "Only XLSX, XLS and CSV files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const duplicate = await database(`marketplace_reports?file_hash=eq.${fileHash}&select=id&limit=1`, { method: "GET" });
    if (Array.isArray(duplicate) && duplicate.length) {
      return NextResponse.json({ success: false, duplicate: true, message: "This report is already uploaded." }, { status: 409 });
    }

    const parsed = parseWorkbook(buffer, file.name);
    const created = await database("marketplace_reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        marketplace: parsed.marketplace,
        report_type: parsed.reportType,
        restaurant_name: parsed.restaurantName,
        location_id: String(formData.get("locationId") || "") || null,
        brand_id: String(formData.get("brandId") || "") || null,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        original_file_name: file.name,
        file_size_bytes: file.size,
        file_hash: fileHash,
        processing_status: "processed",
        detected_columns: parsed.columns,
        summary: parsed.summary,
      }),
    });

    const reportId = created?.[0]?.id;
    if (!reportId) throw new Error("Unable to create report record.");

    if (parsed.orderFacts.length) {
      await database("marketplace_order_facts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(parsed.orderFacts.map((row) => ({ ...row, report_id: reportId }))),
      });
    }

    if (parsed.itemFacts.length) {
      await database("marketplace_item_facts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(parsed.itemFacts.map((row) => ({ ...row, report_id: reportId }))),
      });
    }

    return NextResponse.json({
      success: true,
      reportId,
      marketplace: parsed.marketplace,
      reportType: parsed.reportType,
      restaurantName: parsed.restaurantName,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      summary: parsed.summary,
      topItems: parsed.topItems,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to process report." },
      { status: 500 },
    );
  }
}
