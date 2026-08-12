import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { saveMarketplaceSourceFile } from "@/lib/marketplaceStorage";

type SoldLine = { menuItemId: string; quantity: number };
type Recipe = { id: string; menu_item_id: string; yield_quantity: number };
type RecipeIngredient = { recipe_id: string; inventory_item_id: string; quantity: number; wastage_percent: number };
type InventoryItem = { id: string; name: string; unit: string; current_stock: number };

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing.");
  return { url, key };
}

async function db(path: string, init: RequestInit = {}) {
  const { url, key } = cfg();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function consumeInventory(locationId: string, lines: SoldLine[]) {
  const menuIds = [...new Set(lines.map((line) => line.menuItemId))];
  const quoted = menuIds.map((id) => `"${id.replaceAll('"', "")}"`).join(",");
  const recipes = await db(`recipes?location_id=eq.${encodeURIComponent(locationId)}&menu_item_id=in.(${quoted})&select=id,menu_item_id,yield_quantity`) as Recipe[];
  const recipeByMenu = new Map(recipes.map((row) => [row.menu_item_id, row]));
  if (!recipes.length) return { deducted: [], missingRecipes: menuIds };

  const recipeIds = recipes.map((row) => `"${row.id}"`).join(",");
  const ingredients = await db(`recipe_ingredients?recipe_id=in.(${recipeIds})&select=recipe_id,inventory_item_id,quantity,wastage_percent`) as RecipeIngredient[];
  const inventoryIds = [...new Set(ingredients.map((row) => row.inventory_item_id))];
  if (!inventoryIds.length) return { deducted: [], missingRecipes: menuIds.filter((id) => !recipeByMenu.has(id)) };

  const inventoryQuoted = inventoryIds.map((id) => `"${id}"`).join(",");
  const inventory = await db(`inventory_items?id=in.(${inventoryQuoted})&select=id,name,unit,current_stock`) as InventoryItem[];
  const byRecipe = new Map<string, RecipeIngredient[]>();
  for (const line of ingredients) byRecipe.set(line.recipe_id, [...(byRecipe.get(line.recipe_id) || []), line]);
  const deductions = new Map<string, number>();

  for (const sold of lines) {
    const recipe = recipeByMenu.get(sold.menuItemId);
    if (!recipe) continue;
    const yieldQty = Math.max(Number(recipe.yield_quantity || 1), 0.001);
    for (const ingredient of byRecipe.get(recipe.id) || []) {
      const base = Number(ingredient.quantity || 0) * Number(sold.quantity || 0) / yieldQty;
      const qty = base * (1 + Number(ingredient.wastage_percent || 0) / 100);
      deductions.set(ingredient.inventory_item_id, (deductions.get(ingredient.inventory_item_id) || 0) + qty);
    }
  }

  const deducted: { item: string; quantity: number; unit: string; remaining: number }[] = [];
  for (const [inventoryId, quantity] of deductions) {
    const item = inventory.find((row) => row.id === inventoryId);
    if (!item) continue;
    const remaining = Number(item.current_stock || 0) - quantity;
    await db(`inventory_items?id=eq.${encodeURIComponent(inventoryId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ current_stock: remaining, updated_at: new Date().toISOString() }),
    });
    deducted.push({ item: item.name, quantity, unit: item.unit, remaining });
  }

  return { deducted, missingRecipes: menuIds.filter((id) => !recipeByMenu.has(id)) };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const locationId = String(form.get("locationId") || "").trim();
    const brandId = String(form.get("brandId") || "").trim();
    const platform = String(form.get("platform") || "").trim().toLowerCase();
    const orderNumber = String(form.get("orderNumber") || "").trim();
    const orderDate = String(form.get("orderDate") || "").trim();
    const lines = JSON.parse(String(form.get("lines") || "[]")) as SoldLine[];
    const attachment = form.get("attachment");

    if (!locationId || !brandId) return NextResponse.json({ success: false, message: "Location and brand are required." }, { status: 400 });
    if (!['zomato','swiggy'].includes(platform)) return NextResponse.json({ success: false, message: "Select Zomato or Swiggy." }, { status: 400 });
    if (!orderNumber) return NextResponse.json({ success: false, message: "Online order number is required." }, { status: 400 });
    if (!orderDate) return NextResponse.json({ success: false, message: "Order date is required." }, { status: 400 });
    const cleanLines = lines.filter((line) => line.menuItemId && Number(line.quantity) > 0);
    if (!cleanLines.length) return NextResponse.json({ success: false, message: "Add at least one sold menu item." }, { status: 400 });
    if (!(attachment instanceof File)) return NextResponse.json({ success: false, message: "Attach the Zomato/Swiggy bill PDF or camera image." }, { status: 400 });
    if (!/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(attachment.type)) return NextResponse.json({ success: false, message: "Bill attachment must be PDF, JPG, PNG or WEBP." }, { status: 400 });

    const existing = await db(`marketplace_reports?location_id=eq.${encodeURIComponent(locationId)}&brand_id=eq.${encodeURIComponent(brandId)}&marketplace=eq.${platform}&report_type=eq.day_close_online_order&period_start=eq.${encodeURIComponent(orderDate)}&select=id,summary&limit=200`) as { id: string; summary?: { orderNumber?: string } }[];
    if (existing.some((row) => String(row.summary?.orderNumber || "").trim().toLowerCase() === orderNumber.toLowerCase())) {
      return NextResponse.json({ success: false, duplicate: true, message: `${platform.toUpperCase()} order ${orderNumber} was already posted. Inventory was not deducted again.` }, { status: 409 });
    }

    const bytes = Buffer.from(await attachment.arrayBuffer());
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const inventory = await consumeInventory(locationId, cleanLines);
    const summary = { orderNumber, orderDate, platform, lines: cleanLines, inventoryConsumption: { status: "deducted", ...inventory } };

    const created = await db("marketplace_reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        marketplace: platform,
        report_type: "day_close_online_order",
        restaurant_name: null,
        location_id: locationId,
        brand_id: brandId,
        period_start: orderDate,
        period_end: orderDate,
        original_file_name: attachment.name || `${platform}-${orderNumber}.jpg`,
        file_size_bytes: attachment.size,
        file_hash: fileHash,
        processing_status: "processed",
        detected_columns: [],
        summary,
      }),
    });
    const reportId = created?.[0]?.id;
    if (!reportId) throw new Error("Unable to save online order record.");

    let sourceStored = false;
    let sourceStorageMessage = "";
    try {
      await saveMarketplaceSourceFile(reportId, attachment.name || `${platform}-${orderNumber}.jpg`, bytes, attachment.type);
      sourceStored = true;
    } catch (error) {
      sourceStorageMessage = error instanceof Error ? error.message : "Unable to store bill attachment.";
    }

    return NextResponse.json({
      success: true,
      reportId,
      sourceStored,
      sourceStorageMessage: sourceStorageMessage || undefined,
      inventory,
      message: `${platform === 'zomato' ? 'Zomato' : 'Swiggy'} order ${orderNumber} posted. Inventory reduced for ${inventory.deducted.length} ingredient(s).${inventory.missingRecipes.length ? ` ${inventory.missingRecipes.length} sold item(s) have no recipe.` : ''}`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to post online order." }, { status: 500 });
  }
}
