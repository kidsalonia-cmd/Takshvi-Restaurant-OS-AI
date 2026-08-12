type Fact = {
  marketplace?: unknown;
  external_order_id?: unknown;
  invoice_number?: unknown;
  order_date?: unknown;
  restaurant_name?: unknown;
  brand_name?: unknown;
  item_name?: unknown;
  quantity?: unknown;
};

type Brand = { id: string; name: string };
type MenuItem = { id: string; name: string; sku: string | null; brand_id: string };
type Recipe = { id: string; menu_item_id: string; yield_quantity: number };
type Ingredient = { recipe_id: string; inventory_item_id: string; quantity: number; wastage_percent: number };
type Inventory = { id: string; name: string; current_stock: number; unit: string };
type PriorReport = { id: string; summary: Record<string, unknown> | null };
type PriorFact = { marketplace: string | null; external_order_id: string | null; invoice_number: string | null };

type ConsumptionResult = {
  status: "deducted" | "skipped" | "failed";
  source: string;
  reportId: string;
  matchedLines: number;
  unmatchedLines: number;
  duplicateOrderLines: number;
  missingRecipeLines: number;
  ingredientCount: number;
  deducted: { item: string; quantity: number; unit: string; remaining: number }[];
  unmatchedItems: string[];
  message: string;
  processedAt: string;
};

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

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderKey(fact: Fact | PriorFact) {
  const marketplace = normalize(fact.marketplace);
  const orderId = normalize(fact.external_order_id || fact.invoice_number);
  return marketplace && orderId ? `${marketplace}|${orderId}` : "";
}

function quoted(ids: string[]) {
  return ids.map((id) => `"${id.replaceAll('"', "")}"`).join(",");
}

export async function consumeMarketplaceInventory(params: {
  reportId: string;
  locationId: string;
  brandId?: string;
  reportType: string;
  marketplace: string;
  periodStart: string;
  periodEnd: string;
  itemFacts: Fact[];
}): Promise<ConsumptionResult> {
  const processedAt = new Date().toISOString();
  const base = {
    source: params.marketplace,
    reportId: params.reportId,
    processedAt,
    matchedLines: 0,
    unmatchedLines: 0,
    duplicateOrderLines: 0,
    missingRecipeLines: 0,
    ingredientCount: 0,
    deducted: [] as { item: string; quantity: number; unit: string; remaining: number }[],
    unmatchedItems: [] as string[],
  };

  try {
    // Petpooja Orders and Petpooja Items can contain the same invoices. Use Item Sales only.
    if (params.marketplace === "petpooja" && params.reportType !== "petpooja_items") {
      return { ...base, status: "skipped", message: "Inventory is deducted from the Petpooja Item Sales report to avoid double consumption with the Orders report." };
    }
    if (!params.itemFacts.length) {
      return { ...base, status: "skipped", message: "No item-level rows were found in this marketplace report, so no recipe inventory was deducted." };
    }

    // Only order keys from reports that were actually consumed count as duplicates.
    const priorReports = await db(
      `marketplace_reports?location_id=eq.${encodeURIComponent(params.locationId)}&period_start=lte.${encodeURIComponent(params.periodEnd)}&period_end=gte.${encodeURIComponent(params.periodStart)}&id=neq.${encodeURIComponent(params.reportId)}&select=id,summary`,
      { method: "GET" },
    ) as PriorReport[];
    const consumedReportIds = (priorReports || [])
      .filter((report) => {
        const marker = report.summary?.inventoryConsumption as { status?: string } | undefined;
        return marker?.status === "deducted";
      })
      .map((report) => report.id);

    const priorOrderKeys = new Set<string>();
    if (consumedReportIds.length) {
      const priorFacts = await db(
        `marketplace_item_facts?report_id=in.(${quoted(consumedReportIds)})&select=marketplace,external_order_id,invoice_number`,
        { method: "GET" },
      ) as PriorFact[];
      for (const fact of priorFacts || []) {
        const key = orderKey(fact);
        if (key) priorOrderKeys.add(key);
      }
    }

    const brands = await db(
      `brands?location_id=eq.${encodeURIComponent(params.locationId)}&is_active=eq.true&select=id,name`,
      { method: "GET" },
    ) as Brand[];
    const menuPath = params.brandId
      ? `menu_items?location_id=eq.${encodeURIComponent(params.locationId)}&brand_id=eq.${encodeURIComponent(params.brandId)}&is_active=eq.true&select=id,name,sku,brand_id`
      : `menu_items?location_id=eq.${encodeURIComponent(params.locationId)}&is_active=eq.true&select=id,name,sku,brand_id`;
    const menu = await db(menuPath, { method: "GET" }) as MenuItem[];
    const brandByName = new Map((brands || []).map((brand) => [normalize(brand.name), brand.id]));

    const soldByMenu = new Map<string, number>();
    const unmatched = new Set<string>();
    let duplicateOrderLines = 0;
    let matchedLines = 0;

    for (const fact of params.itemFacts) {
      const quantity = Math.max(0, num(fact.quantity));
      const itemName = String(fact.item_name ?? "").trim();
      if (!itemName || quantity <= 0) continue;

      const key = orderKey(fact);
      if (key && priorOrderKeys.has(key)) {
        duplicateOrderLines += 1;
        continue;
      }

      const normalizedItem = normalize(itemName);
      const factBrandId = params.brandId || brandByName.get(normalize(fact.brand_name || fact.restaurant_name));
      let candidates = (menu || []).filter((entry) => normalize(entry.name) === normalizedItem || normalize(entry.sku) === normalizedItem);
      if (factBrandId) candidates = candidates.filter((entry) => entry.brand_id === factBrandId);

      // If the brand name in the file does not map, accept only an unambiguous location-wide menu match.
      if (candidates.length !== 1) {
        unmatched.add(itemName);
        continue;
      }
      const selected = candidates[0];
      soldByMenu.set(selected.id, (soldByMenu.get(selected.id) || 0) + quantity);
      matchedLines += 1;
    }

    const menuIds = [...soldByMenu.keys()];
    if (!menuIds.length) {
      return {
        ...base,
        status: "skipped",
        matchedLines: 0,
        unmatchedLines: unmatched.size,
        duplicateOrderLines,
        unmatchedItems: [...unmatched].slice(0, 50),
        message: duplicateOrderLines
          ? "All usable marketplace item rows were already consumed by an earlier imported report, or could not be matched to the menu."
          : "Marketplace items could not be matched unambiguously to active menu items, so stock was not changed.",
      };
    }

    const recipes = await db(
      `recipes?location_id=eq.${encodeURIComponent(params.locationId)}&menu_item_id=in.(${quoted(menuIds)})&select=id,menu_item_id,yield_quantity`,
      { method: "GET" },
    ) as Recipe[];
    const recipeByMenu = new Map((recipes || []).map((recipe) => [recipe.menu_item_id, recipe]));
    const missingRecipeLines = menuIds.filter((id) => !recipeByMenu.has(id)).length;
    const recipeIds = (recipes || []).map((recipe) => recipe.id);
    if (!recipeIds.length) {
      return {
        ...base,
        status: "skipped",
        matchedLines,
        unmatchedLines: unmatched.size,
        duplicateOrderLines,
        missingRecipeLines,
        unmatchedItems: [...unmatched].slice(0, 50),
        message: "Marketplace items matched the menu, but none of those menu items has a recipe configured.",
      };
    }

    const ingredients = await db(
      `recipe_ingredients?recipe_id=in.(${quoted(recipeIds)})&select=recipe_id,inventory_item_id,quantity,wastage_percent`,
      { method: "GET" },
    ) as Ingredient[];
    const ingredientsByRecipe = new Map<string, Ingredient[]>();
    for (const ingredient of ingredients || []) {
      ingredientsByRecipe.set(ingredient.recipe_id, [...(ingredientsByRecipe.get(ingredient.recipe_id) || []), ingredient]);
    }

    const deductions = new Map<string, number>();
    for (const [menuItemId, soldQuantity] of soldByMenu) {
      const recipe = recipeByMenu.get(menuItemId);
      if (!recipe) continue;
      const yieldQty = Math.max(num(recipe.yield_quantity) || 1, 0.001);
      for (const ingredient of ingredientsByRecipe.get(recipe.id) || []) {
        const baseQty = num(ingredient.quantity) * soldQuantity / yieldQty;
        const withWaste = baseQty * (1 + num(ingredient.wastage_percent) / 100);
        deductions.set(ingredient.inventory_item_id, (deductions.get(ingredient.inventory_item_id) || 0) + withWaste);
      }
    }

    const inventoryIds = [...deductions.keys()];
    if (!inventoryIds.length) {
      return {
        ...base,
        status: "skipped",
        matchedLines,
        unmatchedLines: unmatched.size,
        duplicateOrderLines,
        missingRecipeLines,
        unmatchedItems: [...unmatched].slice(0, 50),
        message: "Matched recipes have no ingredient quantities to deduct.",
      };
    }

    const inventory = await db(
      `inventory_items?id=in.(${quoted(inventoryIds)})&select=id,name,current_stock,unit`,
      { method: "GET" },
    ) as Inventory[];
    const deducted: { item: string; quantity: number; unit: string; remaining: number }[] = [];
    for (const [inventoryId, quantity] of deductions) {
      const item = (inventory || []).find((entry) => entry.id === inventoryId);
      if (!item) continue;
      const remaining = num(item.current_stock) - quantity;
      await db(`inventory_items?id=eq.${encodeURIComponent(inventoryId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ current_stock: remaining, updated_at: new Date().toISOString() }),
      });
      deducted.push({ item: item.name, quantity, unit: item.unit, remaining });
    }

    return {
      ...base,
      status: "deducted",
      matchedLines,
      unmatchedLines: unmatched.size,
      duplicateOrderLines,
      missingRecipeLines,
      ingredientCount: deducted.length,
      deducted,
      unmatchedItems: [...unmatched].slice(0, 50),
      message: `Marketplace inventory deducted for ${deducted.length} ingredient(s) from ${matchedLines} matched item row(s).${duplicateOrderLines ? ` ${duplicateOrderLines} duplicate order line(s) were skipped.` : ""}${unmatched.size ? ` ${unmatched.size} item name(s) need menu mapping.` : ""}${missingRecipeLines ? ` ${missingRecipeLines} matched menu item(s) have no recipe.` : ""}`,
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      message: error instanceof Error ? error.message : "Marketplace inventory deduction failed.",
    };
  }
}
