"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Target = { locationId: string; brandId: string };
type MenuRow = {
  rowNumber: number;
  name: string;
  sku: string;
  description: string;
  itemType: "veg" | "non_veg" | "egg";
  basePrice: number;
  packagingCharge: number;
  taxRate: number;
  imageUrl: string;
  availableOnPos: boolean;
  availableOnZomato: boolean;
  availableOnSwiggy: boolean;
  isActive: boolean;
  error?: string;
};
type AddonRow = {
  rowNumber: number;
  menuSku: string;
  groupName: string;
  groupCode: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  addonName: string;
  addonSku: string;
  addonPrice: number;
  taxRate: number;
  isActive: boolean;
  error?: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}
function headers(key: string, prefer?: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function bool(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["yes", "y", "true", "1", "active", "required"].includes(String(value).trim().toLowerCase());
}
function itemType(value: unknown): "veg" | "non_veg" | "egg" {
  const normalized = text(value || "veg").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["nonveg", "non_veg", "nonvegetarian", "non_vegetarian"].includes(normalized)) return "non_veg";
  return normalized === "egg" ? "egg" : "veg";
}

export default function MenuAddonImportPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [menuRows, setMenuRows] = useState<MenuRow[]>([]);
  const [addonRows, setAddonRows] = useState<AddonRow[]>([]);
  const [menuFile, setMenuFile] = useState("");
  const [addonFile, setAddonFile] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void loadFoundation(); }, []);

  async function loadFoundation() {
    try {
      const { url, key } = config();
      const companyResponse = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, { headers: headers(key), cache: "no-store" });
      if (!companyResponse.ok) throw new Error(await companyResponse.text());
      const companies = (await companyResponse.json()) as Company[];
      if (!companies[0]) throw new Error("Create the company profile first.");
      setCompany(companies[0]);
      const [locationResponse, brandResponse] = await Promise.all([
        fetch(`${url}/rest/v1/locations?company_id=eq.${companies[0].id}&select=id,name,code&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?company_id=eq.${companies[0].id}&select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
      ]);
      if (!locationResponse.ok) throw new Error(await locationResponse.text());
      if (!brandResponse.ok) throw new Error(await brandResponse.text());
      setLocations((await locationResponse.json()) as Location[]);
      setBrands((await brandResponse.json()) as Brand[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load setup."); }
    finally { setLoading(false); }
  }

  function toggleTarget(locationId: string, brandId: string) {
    setTargets((current) => current.some((x) => x.locationId === locationId && x.brandId === brandId)
      ? current.filter((x) => !(x.locationId === locationId && x.brandId === brandId))
      : [...current, { locationId, brandId }]);
  }

  async function readWorkbook(file: File) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The Excel file has no worksheet.");
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }

  async function readMenu(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setMenuFile(file.name); setError(""); setMessage("");
    try {
      const records = await readWorkbook(file);
      if (!records.length) throw new Error("Menu file is empty.");
      const rows = records.map((r, index): MenuRow => {
        const name = text(r["Item Name"]); const sku = text(r.SKU).toUpperCase(); const basePrice = num(r["Base Price"], -1);
        const problems: string[] = [];
        if (!name) problems.push("Item Name missing"); if (!sku) problems.push("SKU missing"); if (basePrice < 0) problems.push("Base Price invalid");
        return { rowNumber: index + 2, name, sku, description: text(r.Description), itemType: itemType(r["Item Type"]), basePrice,
          packagingCharge: Math.max(0, num(r["Packaging Charge"])), taxRate: Math.max(0, num(r["Tax Rate"], 5)), imageUrl: text(r["Image URL"]),
          availableOnPos: bool(r["POS Available"]), availableOnZomato: bool(r["Zomato Available"]), availableOnSwiggy: bool(r["Swiggy Available"]),
          isActive: bool(r.Active), error: problems.join(", ") || undefined };
      });
      setMenuRows(rows);
    } catch (e) { setMenuRows([]); setError(e instanceof Error ? e.message : "Unable to read menu file."); }
  }

  async function readAddons(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setAddonFile(file.name); setError(""); setMessage("");
    try {
      const records = await readWorkbook(file);
      if (!records.length) throw new Error("Addon file is empty.");
      const rows = records.map((r, index): AddonRow => {
        const menuSku = text(r["Menu SKU"]).toUpperCase(); const groupName = text(r["Addon Group"]); const groupCode = text(r["Group Code"]).toUpperCase();
        const addonName = text(r["Addon Name"]); const addonSku = text(r["Addon SKU"]).toUpperCase(); const addonPrice = num(r["Addon Price"], -1);
        const problems: string[] = [];
        if (!menuSku) problems.push("Menu SKU missing"); if (!groupName) problems.push("Addon Group missing"); if (!groupCode) problems.push("Group Code missing");
        if (!addonName) problems.push("Addon Name missing"); if (!addonSku) problems.push("Addon SKU missing"); if (addonPrice < 0) problems.push("Addon Price invalid");
        return { rowNumber: index + 2, menuSku, groupName, groupCode, minSelect: Math.max(0, num(r["Min Select"])), maxSelect: Math.max(1, num(r["Max Select"], 1)),
          required: bool(r.Required, false), addonName, addonSku, addonPrice, taxRate: Math.max(0, num(r["Tax Rate"], 5)), isActive: bool(r.Active), error: problems.join(", ") || undefined };
      });
      setAddonRows(rows);
    } catch (e) { setAddonRows([]); setError(e instanceof Error ? e.message : "Unable to read addon file."); }
  }

  function menuTemplate() {
    return [{ "Item Name": "Cheese Grilled Sandwich", SKU: "HNY-SAND-001", Description: "Four-slice grilled sandwich", "Item Type": "veg", "Base Price": 199,
      "Packaging Charge": 20, "Tax Rate": 5, "Image URL": "", "POS Available": "Yes", "Zomato Available": "Yes", "Swiggy Available": "Yes", Active: "Yes" }];
  }
  function addonTemplate() {
    return [{ "Menu SKU": "HNY-SAND-001", "Addon Group": "Choose Extra", "Group Code": "EXTRA", "Min Select": 0, "Max Select": 3, Required: "No",
      "Addon Name": "Extra Cheese", "Addon SKU": "ADD-CHEESE-001", "Addon Price": 40, "Tax Rate": 5, Active: "Yes" }];
  }
  function downloadWorkbook(mode: "menu" | "addons" | "combined") {
    const workbook = XLSX.utils.book_new();
    if (mode !== "addons") XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(menuTemplate()), "Menu");
    if (mode !== "menu") XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(addonTemplate()), "Addons");
    XLSX.writeFile(workbook, mode === "combined" ? "Takshvi_Menu_and_Addons.xlsx" : mode === "menu" ? "Takshvi_Menu.xlsx" : "Takshvi_Addons.xlsx");
  }

  async function importAll() {
    if (!company || !targets.length) { setError("Select at least one location and brand."); return; }
    const validMenu = menuRows.filter((x) => !x.error); const validAddons = addonRows.filter((x) => !x.error);
    if (!validMenu.length && !validAddons.length) { setError("Upload at least one valid menu or addon file."); return; }
    setImporting(true); setError(""); setMessage("");
    try {
      const { url, key } = config();
      for (const target of targets) {
        if (validMenu.length) {
          const payload = validMenu.map((row) => ({ company_id: company.id, location_id: target.locationId, brand_id: target.brandId, name: row.name, sku: row.sku,
            description: row.description || null, item_type: row.itemType, base_price: row.basePrice, packaging_charge: row.packagingCharge, tax_rate: row.taxRate,
            image_url: row.imageUrl || null, available_on_pos: row.availableOnPos, available_on_zomato: row.availableOnZomato, available_on_swiggy: row.availableOnSwiggy,
            is_active: row.isActive, updated_at: new Date().toISOString() }));
          const response = await fetch(`${url}/rest/v1/menu_items?on_conflict=brand_id,sku`, { method: "POST", headers: headers(key, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(payload) });
          if (!response.ok) throw new Error(await response.text());
        }
        if (validAddons.length) {
          const menuResponse = await fetch(`${url}/rest/v1/menu_items?brand_id=eq.${target.brandId}&select=id,sku`, { headers: headers(key), cache: "no-store" });
          if (!menuResponse.ok) throw new Error(await menuResponse.text());
          const menuMap = new Map(((await menuResponse.json()) as { id: string; sku: string }[]).map((x) => [x.sku, x.id]));
          const groupKeys = [...new Map(validAddons.map((x) => [x.groupCode, x])).values()];
          const groupPayload = groupKeys.map((x) => ({ company_id: company.id, location_id: target.locationId, brand_id: target.brandId, name: x.groupName, code: x.groupCode,
            min_select: x.minSelect, max_select: x.maxSelect, is_required: x.required, is_active: true, updated_at: new Date().toISOString() }));
          const groupResponse = await fetch(`${url}/rest/v1/addon_groups?on_conflict=brand_id,code`, { method: "POST", headers: headers(key, "resolution=merge-duplicates,return=representation"), body: JSON.stringify(groupPayload) });
          if (!groupResponse.ok) throw new Error(await groupResponse.text());
          const groupMap = new Map(((await groupResponse.json()) as { id: string; code: string }[]).map((x) => [x.code, x.id]));
          const addonPayload = validAddons.map((x) => ({ company_id: company.id, location_id: target.locationId, brand_id: target.brandId, addon_group_id: groupMap.get(x.groupCode),
            name: x.addonName, sku: x.addonSku, price: x.addonPrice, tax_rate: x.taxRate, is_active: x.isActive, updated_at: new Date().toISOString() }));
          const addonResponse = await fetch(`${url}/rest/v1/addon_items?on_conflict=brand_id,sku`, { method: "POST", headers: headers(key, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(addonPayload) });
          if (!addonResponse.ok) throw new Error(await addonResponse.text());
          const links = [...new Map(validAddons.map((x) => [`${x.menuSku}|${x.groupCode}`, { menu_item_id: menuMap.get(x.menuSku), addon_group_id: groupMap.get(x.groupCode) }])).values()]
            .filter((x) => x.menu_item_id && x.addon_group_id);
          if (links.length) {
            const linkResponse = await fetch(`${url}/rest/v1/menu_item_addon_groups?on_conflict=menu_item_id,addon_group_id`, { method: "POST", headers: headers(key, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify(links) });
            if (!linkResponse.ok) throw new Error(await linkResponse.text());
          }
        }
      }
      setMessage(`Updated ${targets.length} selected target(s): ${validMenu.length} menu rows and ${validAddons.length} addon rows.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); }
    finally { setImporting(false); }
  }

  const integratedRows = useMemo(() => {
    const addonsByMenu = new Map<string, AddonRow[]>();
    addonRows.forEach((x) => addonsByMenu.set(x.menuSku, [...(addonsByMenu.get(x.menuSku) ?? []), x]));
    return menuRows.map((m) => ({ menu: m, addons: addonsByMenu.get(m.sku) ?? [] }));
  }, [menuRows, addonRows]);

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">Menu + Addon Control</p>
      <h1 className="mt-2 text-3xl font-black">Upload separately, manage together</h1><p className="mt-3 text-sm text-slate-300">Upload one menu file and one addon file for the same brand ID. Preview them in one integrated view.</p></header>

    <section className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-black">1. Select locations and brands</h2>
      <div className="flex gap-2"><button onClick={() => setTargets(brands.map((b) => ({ locationId: b.location_id, brandId: b.id })))} className="rounded-xl border px-4 py-2 font-bold">Select all</button><button onClick={() => setTargets([])} className="rounded-xl border px-4 py-2 font-bold">Clear</button></div></div>
      {loading ? <p className="py-5">Loading...</p> : <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{locations.map((location) => <article key={location.id} className="rounded-2xl border p-5"><p className="text-xs font-black text-emerald-600">{location.code}</p><h3 className="font-black">{location.name}</h3>
        <div className="mt-3 space-y-2">{brands.filter((b) => b.location_id === location.id).map((brand) => { const checked = targets.some((x) => x.locationId === location.id && x.brandId === brand.id); return <label key={brand.id} className={`flex gap-3 rounded-xl border p-3 ${checked ? "border-emerald-500 bg-emerald-50" : ""}`}><input type="checkbox" checked={checked} onChange={() => toggleTarget(location.id, brand.id)} /> <span className="font-bold">{brand.name}</span></label>; })}</div></article>)}</div>}
      <p className="mt-4 rounded-xl bg-slate-100 p-3 font-bold">Selected targets: {targets.length}</p></section>

    <section className="grid gap-5 md:grid-cols-2"><UploadCard title="2A. Upload Menu File" fileName={menuFile} onChange={readMenu} /><UploadCard title="2B. Upload Addon File" fileName={addonFile} onChange={readAddons} /></section>

    <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Download templates</h2><div className="mt-4 flex flex-wrap gap-3">
      <button onClick={() => downloadWorkbook("menu")} className="rounded-xl border px-4 py-3 font-bold">Download Menu Only</button>
      <button onClick={() => downloadWorkbook("addons")} className="rounded-xl border px-4 py-3 font-bold">Download Addons Only</button>
      <button onClick={() => downloadWorkbook("combined")} className="rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Download Combined Workbook</button></div></section>

    {(menuRows.length || addonRows.length) ? <section className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Integrated preview</h2><p className="text-sm text-slate-500">Menu items with linked addon groups below each item.</p></div>
      <button onClick={importAll} disabled={importing || !targets.length} className="rounded-xl bg-emerald-500 px-5 py-3 font-black disabled:opacity-50">{importing ? "Updating..." : "Update selected IDs"}</button></div>
      <div className="mt-5 space-y-3">{integratedRows.map(({ menu, addons }) => <article key={menu.rowNumber} className="rounded-2xl border p-4"><div className="flex justify-between"><div><p className="font-black">{menu.name}</p><p className="text-sm text-slate-500">{menu.sku} · ₹{menu.basePrice}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{addons.length} addons</span></div>
        {addons.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{addons.map((a) => <div key={`${a.rowNumber}-${a.addonSku}`} className="rounded-xl bg-slate-50 p-3"><p className="font-bold">{a.addonName} · ₹{a.addonPrice}</p><p className="text-xs text-slate-500">{a.groupName} ({a.groupCode}) · {a.addonSku}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-400">No addon linked in uploaded addon file.</p>}</article>)}</div></section> : null}

    {message ? <p className="rounded-xl bg-emerald-50 p-4 font-bold text-emerald-700">{message}</p> : null}{error ? <p className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}
  </div></main>;
}

function UploadCard({ title, fileName, onChange }: { title: string; fileName: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white p-6 text-center shadow-sm hover:border-emerald-500"><span className="text-xl font-black">{title}</span><span className="mt-2 text-sm text-slate-500">.xlsx, .xls or .csv</span><span className="mt-3 font-bold text-emerald-700">{fileName || "Choose file"}</span><input type="file" accept=".xlsx,.xls,.csv" onChange={onChange} className="hidden" /></label>;
}
