import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;
type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; code: string; location_id: string };
type MenuItem = { id: string; name: string; sku: string; location_id: string; brand_id: string };
type InventoryItem = { id: string; name: string; sku: string | null; location_id: string };
type Recipe = { id: string; location_id: string; menu_item_id: string };

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing.");
  return { url, key };
}
function headers(key: string, prefer?: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function db(path: string, init: RequestInit = {}) {
  const { url, key } = cfg();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers(key), ...(init.headers || {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function norm(value: unknown) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function num(value: unknown) { const n = Number(String(value ?? "0").replace(/[,₹ ]/g, "")); return Number.isFinite(n) ? n : 0; }
function yes(value: unknown, fallback = true) { const v = String(value ?? "").trim().toLowerCase(); return v ? ["yes","y","true","1","active"].includes(v) : fallback; }
function pick(row: Row, names: string[]) {
  for (const [key, value] of Object.entries(row)) if (names.some((name) => norm(key) === norm(name))) return value;
  return undefined;
}

async function parseRows(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["xlsx", "xls", "csv"].includes(ext)) throw new Error("Please upload an Excel or CSV file.");
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
}

async function uploadIngredients(rows: Row[]) {
  const locations = await db("locations?select=id,name,code") as Location[];
  const inventory = await db("inventory_items?select=id,name,sku,location_id") as InventoryItem[];
  const results: { row: number; item: string; status: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const locationCode = String(pick(row, ["Location Code", "Location", "Outlet Code"]) || "").trim();
    const name = String(pick(row, ["Ingredient Name", "Ingredient", "Item Name", "Name"]) || "").trim();
    const sku = String(pick(row, ["SKU", "Item Code", "Ingredient SKU"]) || "").trim();
    const unit = String(pick(row, ["Unit", "UOM"]) || "g").trim().toLowerCase();
    const stock = num(pick(row, ["Opening / Current Stock", "Current Stock", "Opening Stock", "Stock"]));
    const reorder = num(pick(row, ["Reorder Level", "Reorder"]));
    const cost = num(pick(row, ["Average Cost per Unit (INR)", "Average Cost", "Unit Cost", "Cost"]));
    const active = yes(pick(row, ["Active (Yes/No)", "Active", "Is Active"]), true);
    if (!locationCode && !name && !sku) continue;
    const location = locations.find((x) => norm(x.code) === norm(locationCode) || norm(x.name) === norm(locationCode));
    if (!location) { results.push({ row: i + 2, item: name || sku, status: `Location not found: ${locationCode}` }); continue; }
    if (!name) { results.push({ row: i + 2, item: sku, status: "Ingredient name missing" }); continue; }
    const existing = inventory.find((x) => x.location_id === location.id && ((sku && x.sku && norm(x.sku) === norm(sku)) || norm(x.name) === norm(name)));
    const payload = { location_id: location.id, name, sku: sku || null, unit, current_stock: stock, reorder_level: reorder, average_cost: cost, is_active: active, updated_at: new Date().toISOString() };
    if (existing) {
      await db(`inventory_items?id=eq.${encodeURIComponent(existing.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      existing.name = name; existing.sku = sku || null;
      results.push({ row: i + 2, item: name, status: "Updated" });
    } else {
      const company = await db(`companies?select=id&order=created_at.asc&limit=1`) as { id: string }[];
      await db("inventory_items", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...payload, company_id: company[0]?.id }) });
      results.push({ row: i + 2, item: name, status: "Created" });
    }
  }
  return results;
}

async function uploadRecipes(rows: Row[]) {
  const [locations, brands, menuItems, inventory] = await Promise.all([
    db("locations?select=id,name,code") as Promise<Location[]>,
    db("brands?select=id,name,code,location_id") as Promise<Brand[]>,
    db("menu_items?select=id,name,sku,location_id,brand_id") as Promise<MenuItem[]>,
    db("inventory_items?select=id,name,sku,location_id") as Promise<InventoryItem[]>,
  ]);

  type Group = { location: Location; brand: Brand; menu: MenuItem; yieldQuantity: number; notes: string; lines: { inventory_item_id: string; quantity: number; wastage_percent: number }[]; sourceRows: number[] };
  const groups = new Map<string, Group>();
  const results: { row: number; item: string; status: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const locationCode = String(pick(row, ["Location Code", "Location"]) || "").trim();
    const brandCode = String(pick(row, ["Brand Code", "Brand"]) || "").trim();
    const menuSku = String(pick(row, ["Menu Item SKU", "Menu SKU", "Item SKU"]) || "").trim();
    const menuName = String(pick(row, ["Menu Item Name", "Menu Item", "Item Name"]) || "").trim();
    const ingredientSku = String(pick(row, ["Ingredient SKU", "SKU"]) || "").trim();
    const ingredientName = String(pick(row, ["Ingredient Name", "Ingredient"]) || "").trim();
    const quantity = num(pick(row, ["Quantity Used", "Quantity", "Qty"]));
    const wastage = num(pick(row, ["Wastage %", "Wastage Percent", "Wastage"]));
    const yieldQuantity = Math.max(num(pick(row, ["Recipe Yield", "Yield"])) || 1, 0.001);
    const notes = String(pick(row, ["Preparation Notes", "Notes"]) || "").trim();
    if (!locationCode && !brandCode && !menuSku && !menuName && !ingredientSku && !ingredientName) continue;

    const location = locations.find((x) => norm(x.code) === norm(locationCode) || norm(x.name) === norm(locationCode));
    if (!location) { results.push({ row: i + 2, item: menuName || menuSku, status: `Location not found: ${locationCode}` }); continue; }
    const brand = brands.find((x) => x.location_id === location.id && (norm(x.code) === norm(brandCode) || norm(x.name) === norm(brandCode)));
    if (!brand) { results.push({ row: i + 2, item: menuName || menuSku, status: `Brand not found: ${brandCode}` }); continue; }
    const menu = menuItems.find((x) => x.location_id === location.id && x.brand_id === brand.id && ((menuSku && norm(x.sku) === norm(menuSku)) || norm(x.name) === norm(menuName)));
    if (!menu) { results.push({ row: i + 2, item: menuName || menuSku, status: "Menu item not found" }); continue; }
    const ingredient = inventory.find((x) => x.location_id === location.id && ((ingredientSku && x.sku && norm(x.sku) === norm(ingredientSku)) || norm(x.name) === norm(ingredientName)));
    if (!ingredient) { results.push({ row: i + 2, item: `${menu.name} / ${ingredientName || ingredientSku}`, status: "Ingredient not found" }); continue; }
    if (quantity <= 0) { results.push({ row: i + 2, item: `${menu.name} / ${ingredient.name}`, status: "Quantity must be greater than 0" }); continue; }

    const key = `${location.id}:${menu.id}`;
    const group = groups.get(key) || { location, brand, menu, yieldQuantity, notes, lines: [], sourceRows: [] };
    group.yieldQuantity = yieldQuantity; if (notes) group.notes = notes;
    group.lines.push({ inventory_item_id: ingredient.id, quantity, wastage_percent: wastage }); group.sourceRows.push(i + 2);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const recipeRows = await db(`recipes?location_id=eq.${encodeURIComponent(group.location.id)}&menu_item_id=eq.${encodeURIComponent(group.menu.id)}&select=id,location_id,menu_item_id`) as Recipe[];
    let recipeId = recipeRows[0]?.id;
    if (recipeId) {
      await db(`recipes?id=eq.${encodeURIComponent(recipeId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ brand_id: group.brand.id, yield_quantity: group.yieldQuantity, notes: group.notes || null, updated_at: new Date().toISOString() }) });
    } else {
      const created = await db("recipes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ location_id: group.location.id, brand_id: group.brand.id, menu_item_id: group.menu.id, yield_quantity: group.yieldQuantity, notes: group.notes || null, updated_at: new Date().toISOString() }) }) as Recipe[];
      recipeId = created[0]?.id;
    }
    if (!recipeId) continue;
    await db(`recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await db("recipe_ingredients", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(group.lines.map((line) => ({ recipe_id: recipeId, ...line }))) });
    for (const row of group.sourceRows) results.push({ row, item: group.menu.name, status: "Recipe posted" });
  }
  return results.sort((a, b) => a.row - b.row);
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const type = String(form.get("type") || "");
    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "Select an Excel file." }, { status: 400 });
    const rows = await parseRows(file);
    if (!rows.length) return NextResponse.json({ success: false, message: "No data rows found in the file." }, { status: 400 });
    const results = type === "ingredient" ? await uploadIngredients(rows) : type === "recipe" ? await uploadRecipes(rows) : [];
    if (!results.length) return NextResponse.json({ success: false, message: "No valid rows were found." }, { status: 400 });
    const successCount = results.filter((x) => ["Created", "Updated", "Recipe posted"].includes(x.status)).length;
    const failedCount = results.length - successCount;
    return NextResponse.json({ success: true, successCount, failedCount, results, message: `${successCount} row(s) posted successfully.${failedCount ? ` ${failedCount} row(s) need review.` : ""}` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Bulk upload failed." }, { status: 500 });
  }
}
