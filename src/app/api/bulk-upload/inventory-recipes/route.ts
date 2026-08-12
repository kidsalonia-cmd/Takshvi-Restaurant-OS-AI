import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;
type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; code: string; location_id: string };
type MenuItem = { id: string; name: string; sku: string; location_id: string; brand_id: string };
type InventoryItem = { id: string; name: string; sku: string | null; location_id: string; unit: string };
type Recipe = { id: string; location_id: string; menu_item_id: string };
type UnitFamily = "mass" | "volume" | "count";
type UnitInfo = { family: UnitFamily; canonicalUnit: "g" | "ml" | "piece"; factorToCanonical: number };

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
function normalizedUnit(value: unknown) {
  const unit = String(value ?? "").trim().toLowerCase();
  if (["g", "gm", "gram", "grams"].includes(unit)) return "g";
  if (["kg", "kilogram", "kilograms"].includes(unit)) return "kg";
  if (["mg", "milligram", "milligrams"].includes(unit)) return "mg";
  if (unit === "ml") return "ml";
  if (["l", "ltr", "litre", "litres", "liter", "liters"].includes(unit)) return "l";
  if (["piece", "pieces", "pcs", "pc", "each", "nos", "no"].includes(unit)) return "piece";
  return unit;
}
function unitInfo(value: unknown): UnitInfo | null {
  const unit = normalizedUnit(value);
  if (unit === "mg") return { family: "mass", canonicalUnit: "g", factorToCanonical: 0.001 };
  if (unit === "g") return { family: "mass", canonicalUnit: "g", factorToCanonical: 1 };
  if (unit === "kg") return { family: "mass", canonicalUnit: "g", factorToCanonical: 1000 };
  if (unit === "ml") return { family: "volume", canonicalUnit: "ml", factorToCanonical: 1 };
  if (unit === "l") return { family: "volume", canonicalUnit: "ml", factorToCanonical: 1000 };
  if (unit === "piece") return { family: "count", canonicalUnit: "piece", factorToCanonical: 1 };
  return null;
}
function convertQuantity(quantity: number, fromUnit: unknown, toUnit: unknown) {
  const from = unitInfo(fromUnit);
  const to = unitInfo(toUnit);
  if (!from) throw new Error(`Unsupported quantity unit: ${String(fromUnit || "blank")}`);
  if (!to) throw new Error(`Unsupported base unit: ${String(toUnit || "blank")}`);
  if (from.family !== to.family) throw new Error(`Cannot convert ${String(fromUnit)} to ${String(toUnit)}.`);
  return (quantity * from.factorToCanonical) / to.factorToCanonical;
}
function canonicalQuantity(quantity: number, unit: unknown) {
  const info = unitInfo(unit);
  if (!info) throw new Error(`Unsupported unit: ${String(unit || "blank")}`);
  return { quantity: quantity * info.factorToCanonical, family: info.family, unit: info.canonicalUnit };
}

async function parseRows(file: File, type: string) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["xlsx", "xls", "csv"].includes(ext)) throw new Error("Please upload an Excel or CSV file.");
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  const preferred = type === "ingredient"
    ? workbook.SheetNames.find((name) => /ingredient|inventory|stock/i.test(name))
    : workbook.SheetNames.find((name) => /recipe/i.test(name));
  const sheetName = preferred || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
}

async function uploadIngredients(rows: Row[]) {
  const locations = await db("locations?select=id,name,code") as Location[];
  const inventory = await db("inventory_items?select=id,name,sku,location_id,unit") as InventoryItem[];
  const company = await db("companies?select=id&order=created_at.asc&limit=1") as { id: string }[];
  const results: { row: number; item: string; status: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const locationCode = String(pick(row, ["Location Code", "Location", "Outlet Code"]) || "").trim();
    const name = String(pick(row, ["Ingredient Name", "Ingredient", "Item Name", "Name"]) || "").trim();
    const sku = String(pick(row, ["Ingredient SKU", "SKU", "Item Code"]) || "").trim();
    const baseUnitRaw = pick(row, ["Base Unit", "Unit", "UOM"]);
    const baseInfo = unitInfo(baseUnitRaw || "g");
    const baseUnit = baseInfo?.canonicalUnit || normalizedUnit(baseUnitRaw || "g");
    const stockQty = num(pick(row, ["Stock Qty", "Purchase Qty", "Opening / Current Stock", "Current Stock", "Opening Stock", "Stock"]));
    const qtyUnitRaw = pick(row, ["Qty Unit", "Quantity Unit", "Purchase Unit", "Stock Unit"]);
    const qtyUnit = normalizedUnit(qtyUnitRaw || baseUnit);
    const reorder = num(pick(row, ["Reorder Level (Base Unit)", "Reorder Level", "Reorder"]));
    const totalCost = num(pick(row, ["Total Cost ₹", "Total Cost", "Purchase Total Cost", "Stock Total Cost"]));
    const fallbackAverageCost = num(pick(row, ["Average Cost / Base Unit ₹", "Average Cost per Unit (INR)", "Average Cost", "Unit Cost", "Cost"]));
    const active = yes(pick(row, ["Active (Yes/No)", "Active", "Is Active"]), true);
    if (!locationCode && !name && !sku) continue;

    const location = locations.find((x) => norm(x.code) === norm(locationCode) || norm(x.name) === norm(locationCode));
    if (!location) { results.push({ row: i + 2, item: name || sku, status: `Location not found: ${locationCode}` }); continue; }
    if (!name) { results.push({ row: i + 2, item: sku, status: "Ingredient name missing" }); continue; }
    if (!baseInfo) { results.push({ row: i + 2, item: name, status: `Unsupported base unit: ${String(baseUnitRaw || baseUnit)}` }); continue; }
    if (!unitInfo(qtyUnit)) { results.push({ row: i + 2, item: name, status: `Unsupported qty unit: ${String(qtyUnitRaw || qtyUnit)}` }); continue; }
    if (stockQty < 0) { results.push({ row: i + 2, item: name, status: "Stock Qty cannot be negative" }); continue; }

    let stockInBaseUnit = 0;
    try { stockInBaseUnit = convertQuantity(stockQty, qtyUnit, baseUnit); }
    catch (error) { results.push({ row: i + 2, item: name, status: error instanceof Error ? error.message : "Unit conversion failed" }); continue; }

    const averageCost = totalCost > 0 && stockInBaseUnit > 0 ? totalCost / stockInBaseUnit : fallbackAverageCost;
    const existing = inventory.find((x) => x.location_id === location.id && ((sku && x.sku && norm(x.sku) === norm(sku)) || norm(x.name) === norm(name)));
    const payload = { location_id: location.id, name, sku: sku || null, unit: baseUnit, current_stock: stockInBaseUnit, reorder_level: reorder, average_cost: averageCost, is_active: active, updated_at: new Date().toISOString() };
    if (existing) {
      await db(`inventory_items?id=eq.${encodeURIComponent(existing.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      existing.name = name; existing.sku = sku || null; existing.unit = baseUnit;
      results.push({ row: i + 2, item: name, status: `Updated — ${stockInBaseUnit.toFixed(3)} ${baseUnit}, avg ₹${averageCost.toFixed(4)}/${baseUnit}` });
    } else {
      await db("inventory_items", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...payload, company_id: company[0]?.id }) });
      results.push({ row: i + 2, item: name, status: `Created — ${stockInBaseUnit.toFixed(3)} ${baseUnit}, avg ₹${averageCost.toFixed(4)}/${baseUnit}` });
    }
  }
  return results;
}

async function uploadRecipes(rows: Row[]) {
  const [locations, brands, menuItems, inventory, company] = await Promise.all([
    db("locations?select=id,name,code") as Promise<Location[]>,
    db("brands?select=id,name,code,location_id") as Promise<Brand[]>,
    db("menu_items?select=id,name,sku,location_id,brand_id") as Promise<MenuItem[]>,
    db("inventory_items?select=id,name,sku,location_id,unit") as Promise<InventoryItem[]>,
    db("companies?select=id&order=created_at.asc&limit=1") as Promise<{ id: string }[]>,
  ]);

  type RecipeLine = { inventory_item_id: string; quantity: number; wastage_percent: number; canonicalQuantity: number; family: UnitFamily };
  type Group = { location: Location; brand: Brand; menu: MenuItem; yieldQuantity: number; portionSize: number; portionUnit: string; portionFamily: UnitFamily | null; expectedBatchCanonical: number | null; notes: string; lines: RecipeLine[]; sourceRows: number[] };
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
    const qtyUnitRaw = pick(row, ["Qty Unit", "Quantity Unit", "Ingredient Unit", "UOM"]);
    const wastage = num(pick(row, ["Wastage %", "Wastage Percent", "Wastage"]));
    const yieldQuantity = Math.max(num(pick(row, ["Recipe Yield (Portions)", "Recipe Yield", "Yield"])) || 1, 0.001);
    const portionSize = num(pick(row, ["Portion Size", "Serving Size"]));
    const portionUnit = normalizedUnit(pick(row, ["Portion Unit", "Serving Unit"]) || "");
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
    if (wastage < 0) { results.push({ row: i + 2, item: `${menu.name} / ${ingredient.name}`, status: "Wastage % cannot be negative" }); continue; }

    const qtyUnit = normalizedUnit(qtyUnitRaw || ingredient.unit);
    let quantityInInventoryUnit = 0;
    let canonical: { quantity: number; family: UnitFamily; unit: "g" | "ml" | "piece" };
    try {
      quantityInInventoryUnit = convertQuantity(quantity, qtyUnit, ingredient.unit);
      canonical = canonicalQuantity(quantity, qtyUnit);
    } catch (error) {
      results.push({ row: i + 2, item: `${menu.name} / ${ingredient.name}`, status: error instanceof Error ? error.message : "Unit conversion failed" });
      continue;
    }

    const key = `${location.id}:${menu.id}`;
    const portionInfo = portionSize > 0 ? unitInfo(portionUnit) : null;
    if (portionSize > 0 && !portionInfo) { results.push({ row: i + 2, item: menu.name, status: `Unsupported portion unit: ${portionUnit || "blank"}` }); continue; }
    const expectedBatchCanonical = portionInfo ? yieldQuantity * portionSize * portionInfo.factorToCanonical : null;
    const group = groups.get(key) || { location, brand, menu, yieldQuantity, portionSize, portionUnit, portionFamily: portionInfo?.family || null, expectedBatchCanonical, notes, lines: [], sourceRows: [] };
    group.yieldQuantity = yieldQuantity;
    if (portionSize > 0) { group.portionSize = portionSize; group.portionUnit = portionUnit; group.portionFamily = portionInfo?.family || null; group.expectedBatchCanonical = expectedBatchCanonical; }
    if (notes) group.notes = notes;
    group.lines.push({ inventory_item_id: ingredient.id, quantity: quantityInInventoryUnit, wastage_percent: wastage, canonicalQuantity: canonical.quantity, family: canonical.family });
    group.sourceRows.push(i + 2);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    let validationStatus = "Recipe posted";
    if (group.portionFamily && group.expectedBatchCanonical !== null) {
      const sameFamily = group.lines.every((line) => line.family === group.portionFamily);
      if (sameFamily) {
        const totalRecipeCanonical = group.lines.reduce((sum, line) => sum + line.canonicalQuantity, 0);
        const tolerance = Math.max(0.01, group.expectedBatchCanonical * 0.005);
        if (Math.abs(totalRecipeCanonical - group.expectedBatchCanonical) > tolerance) {
          for (const row of group.sourceRows) results.push({ row, item: group.menu.name, status: `Recipe total ${totalRecipeCanonical.toFixed(3)} does not match portion batch ${group.expectedBatchCanonical.toFixed(3)} (tolerance ${tolerance.toFixed(3)}). Not posted.` });
          continue;
        }
        validationStatus = `Recipe posted — portion MATCH (${totalRecipeCanonical.toFixed(3)} / ${group.expectedBatchCanonical.toFixed(3)})`;
      } else {
        validationStatus = "Recipe posted — mixed mass/volume/count units; portion total cannot be summed without density conversion";
      }
    } else if (group.portionSize <= 0) {
      validationStatus = "Recipe posted — portion size not provided";
    }

    const portionMetadata = group.portionSize > 0 ? `[TAKSHVI_PORTION yield=${group.yieldQuantity};size=${group.portionSize};unit=${group.portionUnit}]` : "";
    const storedNotes = [group.notes, portionMetadata].filter(Boolean).join(" ");
    const recipeRows = await db(`recipes?location_id=eq.${encodeURIComponent(group.location.id)}&menu_item_id=eq.${encodeURIComponent(group.menu.id)}&select=id,location_id,menu_item_id`) as Recipe[];
    let recipeId = recipeRows[0]?.id;
    if (recipeId) {
      await db(`recipes?id=eq.${encodeURIComponent(recipeId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ brand_id: group.brand.id, yield_quantity: group.yieldQuantity, notes: storedNotes || null, updated_at: new Date().toISOString() }) });
    } else {
      const created = await db("recipes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: company[0]?.id, location_id: group.location.id, brand_id: group.brand.id, menu_item_id: group.menu.id, yield_quantity: group.yieldQuantity, notes: storedNotes || null, updated_at: new Date().toISOString() }) }) as Recipe[];
      recipeId = created[0]?.id;
    }
    if (!recipeId) continue;
    await db(`recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await db("recipe_ingredients", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(group.lines.map(({ canonicalQuantity: _canonicalQuantity, family: _family, ...line }) => ({ recipe_id: recipeId, ...line }))) });
    for (const row of group.sourceRows) results.push({ row, item: group.menu.name, status: validationStatus });
  }
  return results.sort((a, b) => a.row - b.row);
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const type = String(form.get("type") || "");
    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "Select an Excel file." }, { status: 400 });
    const rows = await parseRows(file, type);
    if (!rows.length) return NextResponse.json({ success: false, message: "No data rows found in the file." }, { status: 400 });
    const results = type === "ingredient" ? await uploadIngredients(rows) : type === "recipe" ? await uploadRecipes(rows) : [];
    if (!results.length) return NextResponse.json({ success: false, message: "No valid rows were found." }, { status: 400 });
    const successCount = results.filter((x) => x.status.startsWith("Created") || x.status.startsWith("Updated") || x.status.startsWith("Recipe posted")).length;
    const failedCount = results.length - successCount;
    return NextResponse.json({ success: true, successCount, failedCount, results, message: `${successCount} row(s) posted successfully.${failedCount ? ` ${failedCount} row(s) need review.` : ""}` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Bulk upload failed." }, { status: 500 });
  }
}
