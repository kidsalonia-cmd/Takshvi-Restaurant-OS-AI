import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { savePurchaseBill } from "@/lib/inventoryStorage";

type Row = Record<string, unknown>;
type Inventory = { id: string; name: string; sku: string | null; current_stock: number; average_cost: number; unit: string };

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing.");
  return { url, key };
}
function headers(key: string, prefer?: string) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function db(path: string, init: RequestInit = {}) {
  const { url, key } = cfg();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers(key), ...(init.headers || {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function norm(value: unknown) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function num(value: unknown) { const n = Number(String(value ?? "0").replace(/[,₹ ]/g, "")); return Number.isFinite(n) ? n : 0; }
function pick(row: Row, names: string[]) {
  for (const [key, value] of Object.entries(row)) if (names.some((name) => norm(key) === norm(name))) return value;
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const locationId = String(form.get("locationId") || "").trim();
    if (!(file instanceof File) || !locationId) return NextResponse.json({ success: false, message: "Location and purchase bill are required." }, { status: 400 });
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["xlsx", "xls", "csv", "pdf"].includes(extension)) return NextResponse.json({ success: false, message: "Use Excel, CSV or PDF purchase bills." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let storedPath = "";
    try { storedPath = await savePurchaseBill(locationId, file.name, buffer); } catch { /* inventory import should still work even if source storage fails */ }

    if (extension === "pdf") {
      return NextResponse.json({ success: true, sourceOnly: true, storedPath: storedPath || null, message: "PDF bill saved for reference. Automatic stock posting currently runs from Excel/CSV; enter PDF bill quantities manually in Inventory until PDF extraction is added." });
    }

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
    if (!rows.length) return NextResponse.json({ success: false, message: "No purchase lines found in the workbook." }, { status: 400 });

    const inventory = await db(`inventory_items?location_id=eq.${encodeURIComponent(locationId)}&select=id,name,sku,current_stock,average_cost,unit`) as Inventory[];
    const results: { item: string; quantity: number; rate: number; status: string }[] = [];
    for (const row of rows) {
      const name = String(pick(row, ["item", "item name", "ingredient", "product", "description"]) || "").trim();
      const sku = String(pick(row, ["sku", "item code", "product code", "code"]) || "").trim();
      const quantity = num(pick(row, ["qty", "quantity", "received qty", "purchase qty", "units"]));
      const rate = num(pick(row, ["rate", "unit rate", "unit cost", "cost", "price", "purchase rate"]));
      if ((!name && !sku) || quantity <= 0) continue;
      const match = inventory.find((item) => (sku && item.sku && norm(item.sku) === norm(sku)) || (name && norm(item.name) === norm(name)));
      if (!match) { results.push({ item: name || sku, quantity, rate, status: "Not matched" }); continue; }
      const oldQty = Number(match.current_stock || 0);
      const oldCost = Number(match.average_cost || 0);
      const newQty = oldQty + quantity;
      const newCost = newQty > 0 ? ((oldQty * oldCost) + (quantity * rate)) / newQty : rate;
      await db(`inventory_items?id=eq.${encodeURIComponent(match.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ current_stock: newQty, average_cost: newCost, updated_at: new Date().toISOString() }) });
      match.current_stock = newQty; match.average_cost = newCost;
      results.push({ item: match.name, quantity, rate, status: "Posted" });
    }

    const posted = results.filter((row) => row.status === "Posted").length;
    const unmatched = results.length - posted;
    return NextResponse.json({ success: true, sourceOnly: false, storedPath: storedPath || null, posted, unmatched, results, message: `${posted} purchase line(s) posted to inventory.${unmatched ? ` ${unmatched} line(s) could not be matched by SKU/name.` : ""}` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to import purchase bill." }, { status: 500 });
  }
}
