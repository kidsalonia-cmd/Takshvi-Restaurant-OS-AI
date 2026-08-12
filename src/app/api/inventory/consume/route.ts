import { NextRequest, NextResponse } from "next/server";

type OrderLine = { menuItemId: string; quantity: number };
type Recipe = { id: string; menu_item_id: string; yield_quantity: number };
type Ingredient = { recipe_id: string; inventory_item_id: string; quantity: number; wastage_percent: number };
type Inventory = { id: string; name: string; current_stock: number; unit: string };

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { locationId?: string; orderNumber?: string; lines?: OrderLine[] };
    const locationId = String(body.locationId || "");
    const lines = (body.lines || []).filter((line) => line.menuItemId && Number(line.quantity) > 0);
    if (!locationId || !lines.length) return NextResponse.json({ success: false, message: "Location and sold menu items are required." }, { status: 400 });

    const menuIds = [...new Set(lines.map((line) => line.menuItemId))];
    const quoted = menuIds.map((id) => `"${id.replaceAll('"', "")}"`).join(",");
    const recipes = await db(`recipes?location_id=eq.${encodeURIComponent(locationId)}&menu_item_id=in.(${quoted})&select=id,menu_item_id,yield_quantity`) as Recipe[];
    if (!recipes.length) return NextResponse.json({ success: true, deducted: [], missingRecipes: menuIds, message: "Bill created, but no recipes are configured for the sold items." });

    const recipeIds = recipes.map((r) => `"${r.id}"`).join(",");
    const ingredients = await db(`recipe_ingredients?recipe_id=in.(${recipeIds})&select=recipe_id,inventory_item_id,quantity,wastage_percent`) as Ingredient[];
    const inventoryIds = [...new Set(ingredients.map((i) => i.inventory_item_id))];
    if (!inventoryIds.length) return NextResponse.json({ success: true, deducted: [], missingRecipes: menuIds, message: "Recipes have no ingredient lines." });

    const invQuoted = inventoryIds.map((id) => `"${id}"`).join(",");
    const inventory = await db(`inventory_items?id=in.(${invQuoted})&select=id,name,current_stock,unit`) as Inventory[];
    const recipeByMenu = new Map(recipes.map((r) => [r.menu_item_id, r]));
    const ingredientsByRecipe = new Map<string, Ingredient[]>();
    ingredients.forEach((line) => ingredientsByRecipe.set(line.recipe_id, [...(ingredientsByRecipe.get(line.recipe_id) || []), line]));
    const deductions = new Map<string, number>();

    for (const sold of lines) {
      const recipe = recipeByMenu.get(sold.menuItemId);
      if (!recipe) continue;
      const yieldQty = Math.max(Number(recipe.yield_quantity || 1), 0.001);
      for (const ingredient of ingredientsByRecipe.get(recipe.id) || []) {
        const base = Number(ingredient.quantity || 0) * Number(sold.quantity || 0) / yieldQty;
        const withWaste = base * (1 + Number(ingredient.wastage_percent || 0) / 100);
        deductions.set(ingredient.inventory_item_id, (deductions.get(ingredient.inventory_item_id) || 0) + withWaste);
      }
    }

    const deducted: { item: string; quantity: number; unit: string; remaining: number }[] = [];
    for (const [inventoryId, quantity] of deductions) {
      const item = inventory.find((entry) => entry.id === inventoryId);
      if (!item) continue;
      const remaining = Number(item.current_stock || 0) - quantity;
      await db(`inventory_items?id=eq.${encodeURIComponent(inventoryId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ current_stock: remaining, updated_at: new Date().toISOString() }) });
      deducted.push({ item: item.name, quantity, unit: item.unit, remaining });
    }

    const missingRecipes = menuIds.filter((id) => !recipeByMenu.has(id));
    return NextResponse.json({ success: true, deducted, missingRecipes, orderNumber: body.orderNumber || null, message: `Inventory deducted for ${deducted.length} ingredient(s).${missingRecipes.length ? ` ${missingRecipes.length} sold item(s) have no recipe.` : ""}` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to deduct inventory." }, { status: 500 });
  }
}
