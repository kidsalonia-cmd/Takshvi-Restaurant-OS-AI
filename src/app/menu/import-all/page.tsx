"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Target = { locationId: string; brandId: string };
type ImportRow = {
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

function text(value: unknown) { return String(value ?? "").trim(); }
function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function boolValue(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["yes", "y", "true", "1", "active"].includes(String(value).trim().toLowerCase());
}
function itemTypeValue(value: unknown): "veg" | "non_veg" | "egg" {
  const normalized = text(value || "veg").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["nonveg", "non_veg", "nonvegetarian", "non_vegetarian"].includes(normalized)) return "non_veg";
  if (normalized === "egg") return "egg";
  return "veg";
}

export default function MultiLocationMenuImportPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void loadFoundation(); }, []);

  async function loadFoundation() {
    setLoading(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load locations and brands.");
    } finally {
      setLoading(false);
    }
  }

  function toggleTarget(locationId: string, brandId: string) {
    setMessage("");
    setError("");
    setTargets((current) => {
      const exists = current.some((item) => item.locationId === locationId && item.brandId === brandId);
      return exists
        ? current.filter((item) => !(item.locationId === locationId && item.brandId === brandId))
        : [...current, { locationId, brandId }];
    });
  }

  function selectAll() {
    setTargets(brands.map((brand) => ({ locationId: brand.location_id, brandId: brand.id })));
  }

  async function readExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(""); setError(""); setFileName(file.name);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The Excel file has no worksheet.");
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!records.length) throw new Error("The first worksheet is empty.");
      const availableHeaders = Object.keys(records[0]);
      const missing = ["Item Name", "SKU", "Base Price"].filter((header) => !availableHeaders.includes(header));
      if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

      const parsed = records.map((record, index): ImportRow => {
        const name = text(record["Item Name"]);
        const sku = text(record.SKU).toUpperCase();
        const basePrice = numberValue(record["Base Price"], -1);
        const problems: string[] = [];
        if (!name) problems.push("Item Name missing");
        if (!sku) problems.push("SKU missing");
        if (basePrice < 0) problems.push("Base Price invalid");
        return {
          rowNumber: index + 2,
          name,
          sku,
          description: text(record.Description),
          itemType: itemTypeValue(record["Item Type"]),
          basePrice,
          packagingCharge: Math.max(0, numberValue(record["Packaging Charge"], 0)),
          taxRate: Math.max(0, numberValue(record["Tax Rate"], 5)),
          imageUrl: text(record["Image URL"]),
          availableOnPos: boolValue(record["POS Available"], true),
          availableOnZomato: boolValue(record["Zomato Available"], true),
          availableOnSwiggy: boolValue(record["Swiggy Available"], true),
          isActive: boolValue(record.Active, true),
          error: problems.join(", ") || undefined,
        };
      });
      const seen = new Set<string>();
      parsed.forEach((row) => {
        if (seen.has(row.sku)) row.error = [row.error, "Duplicate SKU in file"].filter(Boolean).join(", ");
        seen.add(row.sku);
      });
      setRows(parsed);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Unable to read Excel file.");
    }
  }

  async function importRows() {
    if (!company) return;
    if (!targets.length) { setError("Select at least one location and brand target."); return; }
    const validRows = rows.filter((row) => !row.error);
    if (!validRows.length) { setError("There are no valid rows to import."); return; }
    setImporting(true); setMessage(""); setError("");
    try {
      const { url, key } = config();
      let total = 0;
      for (const target of targets) {
        const payload = validRows.map((row) => ({
          company_id: company.id,
          location_id: target.locationId,
          brand_id: target.brandId,
          name: row.name,
          sku: row.sku,
          description: row.description || null,
          item_type: row.itemType,
          base_price: row.basePrice,
          packaging_charge: row.packagingCharge,
          tax_rate: row.taxRate,
          image_url: row.imageUrl || null,
          available_on_pos: row.availableOnPos,
          available_on_zomato: row.availableOnZomato,
          available_on_swiggy: row.availableOnSwiggy,
          is_active: row.isActive,
          updated_at: new Date().toISOString(),
        }));
        const response = await fetch(`${url}/rest/v1/menu_items?on_conflict=brand_id,sku`, {
          method: "POST",
          headers: headers(key, "resolution=merge-duplicates,return=representation"),
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(await response.text());
        total += ((await response.json()) as unknown[]).length;
      }
      setMessage(`${validRows.length} menu items updated across ${targets.length} selected location/brand target${targets.length === 1 ? "" : "s"}. ${total} database rows processed.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to import menu.");
    } finally {
      setImporting(false);
    }
  }

  const validCount = useMemo(() => rows.filter((row) => !row.error).length, [rows]);

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">Multi-location menu control</p>
          <h1 className="mt-2 text-3xl font-black">Upload once, choose where to update</h1>
          <p className="mt-3 text-sm text-slate-300">Select the exact physical stores, cloud kitchens and brands that should receive this Excel menu.</p>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-black">1. Select destination kitchens and brands</h2><p className="mt-1 text-sm text-slate-500">Nothing is updated unless it is checked below.</p></div>
            <div className="flex gap-2"><button onClick={selectAll} className="rounded-xl border px-4 py-2 text-sm font-bold">Select all</button><button onClick={() => setTargets([])} className="rounded-xl border px-4 py-2 text-sm font-bold">Clear</button></div>
          </div>
          {loading ? <p className="py-8 font-bold text-slate-500">Loading...</p> : null}
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {locations.map((location) => {
              const locationBrands = brands.filter((brand) => brand.location_id === location.id);
              return <article key={location.id} className="rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-600">{location.code}</p>
                <h3 className="mt-1 text-lg font-black">{location.name}</h3>
                <div className="mt-4 space-y-2">
                  {locationBrands.length ? locationBrands.map((brand) => {
                    const checked = targets.some((item) => item.locationId === location.id && item.brandId === brand.id);
                    return <label key={brand.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTarget(location.id, brand.id)} className="h-5 w-5 accent-emerald-500" />
                      <span className="font-bold">{brand.name}</span>
                    </label>;
                  }) : <p className="text-sm text-slate-500">No active brand at this location.</p>}
                </div>
              </article>;
            })}
          </div>
          <p className="mt-5 rounded-xl bg-slate-100 p-4 text-sm font-bold">Selected targets: {targets.length}</p>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">2. Upload Excel menu</h2>
          <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-emerald-500">
            <span className="text-lg font-black">Choose Excel file</span><span className="mt-2 text-sm text-slate-500">.xlsx, .xls or .csv</span><span className="mt-2 text-sm font-bold text-emerald-700">{fileName || "No file selected"}</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={readExcel} className="hidden" />
          </label>
        </section>

        {rows.length ? <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-black">3. Review and update</h2><p className="text-sm text-slate-500">{validCount} valid of {rows.length} rows</p></div>
            <button onClick={importRows} disabled={importing || !validCount || !targets.length} className="h-12 rounded-xl bg-slate-950 px-6 font-black text-white disabled:opacity-50">{importing ? "Updating..." : `Update ${targets.length} selected target${targets.length === 1 ? "" : "s"}`}</button>
          </div>
          <div className="mt-5 max-h-96 overflow-auto rounded-xl border">
            <table className="w-full min-w-[700px] text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3">Row</th><th className="p-3">Item</th><th className="p-3">SKU</th><th className="p-3">Price</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber} className="border-t"><td className="p-3">{row.rowNumber}</td><td className="p-3 font-bold">{row.name}</td><td className="p-3">{row.sku}</td><td className="p-3">₹{row.basePrice}</td><td className={`p-3 font-bold ${row.error ? "text-red-600" : "text-emerald-600"}`}>{row.error || "Ready"}</td></tr>)}</tbody></table>
          </div>
        </section> : null}

        {message ? <p className="rounded-xl bg-emerald-50 p-4 font-bold text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}
      </div>
    </main>
  );
}
