"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string };
type Brand = { id: string; name: string; location_id: string };
type MenuItem = { id: string; name: string; selling_price: number; brand_id: string; location_id: string };
type InventoryItem = { id: string; name: string; unit: string; average_cost: number; location_id: string };
type IngredientLine = { inventory_item_id: string; quantity: number; wastage_percent: number };

type Recipe = {
  id: string;
  location_id: string;
  brand_id: string;
  menu_item_id: string;
  yield_quantity: number;
  notes: string | null;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export default function RecipesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [yieldQuantity, setYieldQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<IngredientLine[]>([{ inventory_item_id: "", quantity: 0, wastage_percent: 0 }]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void loadFoundation(); }, []);
  useEffect(() => { if (locationId) void loadLocationData(locationId); }, [locationId]);

  async function loadFoundation() {
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/locations?select=id,name&order=name.asc`, { headers: headers(key), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const rows = (await response.json()) as Location[];
      setLocations(rows);
      if (rows[0]) setLocationId(rows[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load locations."); }
  }

  async function loadLocationData(id: string) {
    try {
      const { url, key } = config();
      const [brandRes, menuRes, inventoryRes, recipeRes] = await Promise.all([
        fetch(`${url}/rest/v1/brands?location_id=eq.${id}&select=id,name,location_id&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/menu_items?location_id=eq.${id}&select=id,name,selling_price,brand_id,location_id&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/inventory_items?location_id=eq.${id}&select=id,name,unit,average_cost,location_id&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/recipes?location_id=eq.${id}&select=*&order=created_at.desc`, { headers: headers(key), cache: "no-store" }),
      ]);
      for (const response of [brandRes, menuRes, inventoryRes, recipeRes]) if (!response.ok) throw new Error(await response.text());
      const brandRows = (await brandRes.json()) as Brand[];
      setBrands(brandRows);
      setMenuItems((await menuRes.json()) as MenuItem[]);
      setInventory((await inventoryRes.json()) as InventoryItem[]);
      setRecipes((await recipeRes.json()) as Recipe[]);
      setBrandId(brandRows[0]?.id ?? "");
      setMenuItemId("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load recipe data."); }
  }

  const filteredMenu = useMemo(() => menuItems.filter((item) => item.brand_id === brandId), [menuItems, brandId]);
  const selectedMenu = menuItems.find((item) => item.id === menuItemId);
  const recipeCost = lines.reduce((total, line) => {
    const item = inventory.find((entry) => entry.id === line.inventory_item_id);
    if (!item) return total;
    return total + Number(line.quantity || 0) * Number(item.average_cost || 0) * (1 + Number(line.wastage_percent || 0) / 100);
  }, 0) / Math.max(yieldQuantity || 1, 1);
  const foodCostPercent = selectedMenu?.selling_price ? (recipeCost / Number(selectedMenu.selling_price)) * 100 : 0;

  function updateLine(index: number, field: keyof IngredientLine, value: string | number) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }

  async function saveRecipe(event: FormEvent) {
    event.preventDefault();
    if (!locationId || !brandId || !menuItemId) return;
    const validLines = lines.filter((line) => line.inventory_item_id && Number(line.quantity) > 0);
    if (!validLines.length) { setError("Add at least one ingredient with quantity."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const { url, key } = config();
      const recipeResponse = await fetch(`${url}/rest/v1/recipes?on_conflict=location_id,menu_item_id`, {
        method: "POST",
        headers: headers(key, "resolution=merge-duplicates,return=representation"),
        body: JSON.stringify({ location_id: locationId, brand_id: brandId, menu_item_id: menuItemId, yield_quantity: yieldQuantity, notes: notes || null, updated_at: new Date().toISOString() }),
      });
      if (!recipeResponse.ok) throw new Error(await recipeResponse.text());
      const recipe = ((await recipeResponse.json()) as Recipe[])[0];
      if (!recipe) throw new Error("Recipe was not created.");
      const deleteResponse = await fetch(`${url}/rest/v1/recipe_ingredients?recipe_id=eq.${recipe.id}`, { method: "DELETE", headers: headers(key) });
      if (!deleteResponse.ok) throw new Error(await deleteResponse.text());
      const ingredientResponse = await fetch(`${url}/rest/v1/recipe_ingredients`, {
        method: "POST",
        headers: headers(key, "return=minimal"),
        body: JSON.stringify(validLines.map((line) => ({ recipe_id: recipe.id, ...line }))),
      });
      if (!ingredientResponse.ok) throw new Error(await ingredientResponse.text());
      setMessage("Recipe saved successfully. Food cost is now calculated from inventory cost.");
      await loadLocationData(locationId);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save recipe."); }
    finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">Recipe and Food Cost Engine</p>
          <h1 className="mt-2 text-3xl font-black">Menu recipes</h1>
          <p className="mt-3 text-sm text-slate-300">Connect every menu item to ingredients so orders can deduct inventory and calculate real food cost.</p>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={saveRecipe} className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <Select label="Location" value={locationId} onChange={setLocationId} options={locations.map((x) => [x.id, x.name])} />
              <Select label="Brand" value={brandId} onChange={setBrandId} options={brands.map((x) => [x.id, x.name])} />
              <Select label="Menu item" value={menuItemId} onChange={setMenuItemId} options={filteredMenu.map((x) => [x.id, `${x.name} - ₹${Number(x.selling_price).toFixed(0)}`])} />
              <label className="block"><span className="mb-2 block text-sm font-bold">Recipe yield</span><input type="number" min="0.001" step="0.001" value={yieldQuantity} onChange={(e) => setYieldQuantity(Number(e.target.value))} className="h-12 w-full rounded-xl border border-slate-200 px-4" /></label>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between"><h2 className="text-xl font-black">Ingredients</h2><button type="button" onClick={() => setLines([...lines, { inventory_item_id: "", quantity: 0, wastage_percent: 0 }])} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black">+ Add ingredient</button></div>
              <div className="mt-4 space-y-3">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1.4fr_0.7fr_0.7fr_auto]">
                    <select value={line.inventory_item_id} onChange={(e) => updateLine(index, "inventory_item_id", e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3"><option value="">Select ingredient</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select>
                    <input type="number" step="0.001" min="0" value={line.quantity} onChange={(e) => updateLine(index, "quantity", Number(e.target.value))} placeholder="Qty" className="h-11 rounded-xl border border-slate-200 px-3" />
                    <input type="number" step="0.1" min="0" value={line.wastage_percent} onChange={(e) => updateLine(index, "wastage_percent", Number(e.target.value))} placeholder="Wastage %" className="h-11 rounded-xl border border-slate-200 px-3" />
                    <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== index))} className="h-11 rounded-xl border border-red-100 px-3 font-bold text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            </div>

            <label className="mt-5 block"><span className="mb-2 block text-sm font-bold">Preparation notes</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 p-4" /></label>
            <button disabled={saving} className="mt-5 h-12 w-full rounded-xl bg-slate-950 font-black text-white hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50">{saving ? "Saving..." : "Save recipe"}</button>
            {message && <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</p>}
            {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
          </form>

          <div className="space-y-5">
            <div className="rounded-3xl bg-white p-6 shadow-sm"><p className="text-sm font-bold text-slate-500">Estimated recipe cost</p><p className="mt-2 text-4xl font-black">₹{recipeCost.toFixed(2)}</p><p className="mt-2 text-sm text-slate-500">Per menu-item yield</p></div>
            <div className="rounded-3xl bg-white p-6 shadow-sm"><p className="text-sm font-bold text-slate-500">Food cost percentage</p><p className={`mt-2 text-4xl font-black ${foodCostPercent > 35 ? "text-red-600" : "text-emerald-600"}`}>{foodCostPercent.toFixed(1)}%</p><p className="mt-2 text-sm text-slate-500">Target generally stays within your chosen profitability policy.</p></div>
            <div className="rounded-3xl bg-white p-6 shadow-sm"><p className="text-sm font-bold text-emerald-600">Recipes configured</p><p className="mt-2 text-4xl font-black">{recipes.length}</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4"><option value="">Select {label.toLowerCase()}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
