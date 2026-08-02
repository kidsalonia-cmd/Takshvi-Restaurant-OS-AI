import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

type ParsedReport = {
  marketplace: "zomato" | "swiggy" | "petpooja" | "unknown";
  reportType: string;
  restaurantName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  detectedColumns: string[];
  summary: {
    rows: number;
    orders: number;
    sales: number;
    payout: number;
    discount: number;
    commission: number;
    tax: number;
    packaging: number;
    aov: number;
    payoutRatio: number;
  };
  orderFacts: Row[];
  itemFacts: Row[];
};

const aliases = {
  orderId: ["order id", "zomato order id", "swiggy order id", "external order id", "invoice no", "invoice number"],
  date: ["order date", "date", "order time", "created at", "bill date"],
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
  const cleaned = String(value ?? "").replace(/[₹,%()\s,]/g, "").replace(/^-$/, "0");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findKey(row: Row, names: string[]) {
  const keys = Object.keys(row);
  return keys.find((key) => names.includes(normalize(key)));
}

function valueByAlias(row: Row, names: string[]) {
  const key = findKey(row, names);
  return key ? row[key] : undefined;
}

function dateText(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S).toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function detectMarketplace(fileName: string, rows: Row[]) {
  const sample = `${fileName} ${JSON.stringify(rows.slice(0, 20))}`.toLowerCase();
  if (sample.includes("zomato")) return "zomato" as const;
  if (sample.includes("swiggy")) return "swiggy" as const;
  if (sample.includes("petpooja")) return "petpooja" as const;
  return "unknown" as const;
}

function detectReportType(columns: string[], fileName: string) {
  const text = `${fileName} ${columns.join(" ")}`.toLowerCase();
  if (text.includes("settlement") || text.includes("payout")) return "settlement";
  if (text.includes("item name") || text.includes("quantity sold")) return "item_summary";
  if (text.includes("invoice") || text.includes("order id")) return "order_detail";
  return "unknown";
}

function parseWorkbook(buffer: Buffer, fileName: string): ParsedReport {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const rows: Row[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
    rows.push(...sheetRows);
  }

  const detectedColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const marketplace = detectMarketplace(fileName, rows);
  const reportType = detectReportType(detectedColumns, fileName);

  let restaurantName: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  const orderFacts: Row[] = [];
  const itemFacts: Row[] = [];

  for (const row of rows) {
    const restaurant = valueByAlias(row, aliases.restaurant);
    if (!restaurantName && restaurant) restaurantName = String(restaurant).trim();

    const orderDate = dateText(valueByAlias(row, aliases.date));
    if (orderDate) {
      const day = orderDate.slice(0, 10);
      if (!periodStart || day < periodStart) periodStart = day;
      if (!periodEnd || day > periodEnd) periodEnd = day;
    }

    const itemName = valueByAlias(row, aliases.item);
    const sales = numberValue(valueByAlias(row, aliases.sales));
    const payout = numberValue(valueByAlias(row, aliases.payout));
    const discount = numberValue(valueByAlias(row, aliases.discount));
    const commission = numberValue(valueByAlias(row, aliases.commission));
    const tax = numberValue(valueByAlias(row, aliases.tax));
    const packaging = numberValue(valueByAlias(row, aliases.packaging));

    if (itemName) {
      itemFacts.push({
        marketplace,
        external_order_id: String(valueByAlias(row, aliases.orderId) ?? "") || null,
        invoice_number: String(valueByAlias(row, ["invoice no", "invoice number"]) ?? "") || null,
        order_date: orderDate,
        restaurant_name: restaurant ? String(restaurant) : restaurantName,
        brand_name: String(valueByAlias(row, aliases.brand) ?? "") || null,
        category_name: String(valueByAlias(row, aliases.category) ?? "") || null,
        item_name: String(itemName),
        quantity: numberValue(valueByAlias(row, aliases.quantity)),
        gross_sales: sales,
        discount_amount: discount,
        tax_amount: tax,
        final_total: sales,
        raw_row: row,
      });
    }

    if (sales || payout || valueByAlias(row, aliases.orderId)) {
      orderFacts.push({
        marketplace,
        external_order_id: String(valueByAlias(row, aliases.orderId) ?? "") || null,
        invoice_number: String(valueByAlias(row, ["invoice no", "invoice number"]) ?? "") || null,
        order_date: orderDate,
        restaurant_name: restaurant ? String(restaurant) : restaurantName,
        brand_name: String(valueByAlias(row, aliases.brand) ?? "") || null,
        order_source: String(valueByAlias(row, aliases.source) ?? "") || null,
        order_status: String(valueByAlias(row, aliases.status) ?? "") || null,
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
  }

  const sales = orderFacts.reduce((sum, row) => sum + numberValue(row.gross_sales), 0);
  const payout = orderFacts.reduce((sum, row) => sum + numberValue(row.payout_amount), 0);
  const discount = orderFacts.reduce((sum, row) => sum + numberValue(row.discount_amount), 0);
  const commission = orderFacts.reduce((sum, row) => sum + numberValue(row.commission_amount), 0);
  const tax = orderFacts.reduce((sum, row) => sum + numberValue(row.tax_amount), 0);
  const packaging = orderFacts.reduce((sum, row) => sum + numberValue(row.packaging_amount), 0);
  const uniqueOrders = new Set(orderFacts.map((row) => String(row.external_order_id || row.invoice_number || "")).filter(Boolean));
  const orders = uniqueOrders.size || orderFacts.length;

  return {
    marketplace,
    reportType,
    restaurantName,
    periodStart,
    periodEnd,
    detectedColumns,
    summary: {
      rows: rows.length,
      orders,
      sales,
      payout,
      discount,
      commission,
      tax,
      packaging,
      aov: orders ? sales / orders : 0,
      payoutRatio: sales ? (payout / sales) * 100 : 0,
    },
    orderFacts,
    itemFacts,
  };
}

async function supabaseRequest(path: string, init: RequestInit) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");

  const response = await fetch(`${url}/rest/v1/${path}`, {
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
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "File is required." }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
      return NextResponse.json({ success: false, message: "Only XLSX, XLS or CSV files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = createHash("sha256").update(buffer).digest("hex");

    const duplicate = await supabaseRequest(`marketplace_reports?file_hash=eq.${hash}&select=id,original_file_name&limit=1`, { method: "GET" });
    if (Array.isArray(duplicate) && duplicate.length) {
      return NextResponse.json({ success: false, duplicate: true, message: "This report has already been uploaded." }, { status: 409 });
    }

    const parsed = parseWorkbook(buffer, file.name);
    const locationId = String(form.get("locationId") || "") || null;
    const brandId = String(form.get("brandId") || "") || null;

    const reportRows = await supabaseRequest("marketplace_reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        marketplace: parsed.marketplace,
        report_type: parsed.reportType,
        restaurant_name: parsed.restaurantName,
        location_id: locationId,
        brand_id: brandId,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        original_file_name: file.name,
        file_size_bytes: file.size,
        file_hash: hash,
        processing_status: "processed",
        detected_columns: parsed.detectedColumns,
        summary: parsed.summary,
      }),
    });

    const reportId = reportRows?.[0]?.id;
    if (!reportId) throw new Error("Report record was not created.");

    const orderFacts = parsed.orderFacts.map((row) => ({ ...row, report_id: reportId }));
    const itemFacts = parsed.itemFacts.map((row) => ({ ...row, report_id: reportId }));

    if (orderFacts.length) {
      await supabaseRequest("marketplace_order_facts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(orderFacts),
      });
    }

    if (itemFacts.length) {
      await supabaseRequest("marketplace_item_facts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(itemFacts),
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
      topItems: parsed.itemFacts
        .reduce<Record<string, { item: string; quantity: number; sales: number }>>((acc, row) => {
          const item = String(row.item_name || "Unknown");
          acc[item] ??= { item, quantity: 0, sales: 0 };
          acc[item].quantity += numberValue(row.quantity);
          acc[item].sales += numberValue(row.final_total);
          return acc;
        }, {})
        |> Object.values(#)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to process marketplace report." },
      { status: 500 },
    );
  }
}
