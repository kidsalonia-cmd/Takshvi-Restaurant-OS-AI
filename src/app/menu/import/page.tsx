"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };

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

const requiredHeaders = ["Item Name", "SKU", "Base Price"];

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function requestHeaders(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["yes", "y", "true", "1", "active"].includes(normalized);
}

function itemTypeValue(value: unknown): "veg" | "non_veg" | "egg" {
  const normalized = String(value ?? "veg").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["nonveg", "non_veg", "nonvegetarian", "non_vegetarian"].includes(normalized)) return "non_veg";
  if (normalized === "egg") return "egg";
  return "veg";
}

export default function MenuExcelImportPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadFoundation();
  }, []);

  async function loadFoundation() {
    setLoading(true);
    try {
      const { url, key } = config();
      const companyResponse = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, {
        headers: requestHeaders(key),
        cache: "no-store",
      });
      if (!companyResponse.ok) throw new Error(await companyResponse.text());
      const companies = (await companyResponse.json()) as Company[];
      if (!companies[0]) throw new Error("Create the company profile first.");
      setCompany(companies[0]);

      const locationResponse = await fetch(
        `${url}/rest/v1/locations?company_id=eq.${companies[0].id}&select=id,name,code&is_active=eq.true&order=name.asc`,
        { headers: requestHeaders(key), cache: "no-store" },
      );
      if (!locationResponse.ok) throw new Error(await locationResponse.text());
      const locationRows = (await locationResponse.json()) as Location[];
      setLocations(locationRows);
      if (locationRows[0]) {
        setLocationId(locationRows[0].id);
        await loadBrands(locationRows[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load menu import setup.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBrands(selectedLocationId: string) {
    setLocationId(selectedLocationId);
    setBrandId("");
    setRows([]);
    setFileName("");
    try {
      const { url, key } = config();
      const response = await fetch(
        `${url}/rest/v1/brands?location_id=eq.${selectedLocationId}&select=id,name,location_id&is_active=eq.true&order=name.asc`,
        { headers: requestHeaders(key), cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      const brandRows = (await response.json()) as Brand[];
      setBrands(brandRows);
      setBrandId(brandRows[0]?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load brands.");
    }
  }

  async function readExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setError("");
    setFileName(file.name);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("The Excel file has no worksheet.");
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
      if (!records.length) throw new Error("The first worksheet is empty.");

      const availableHeaders = Object.keys(records[0]);
      const missing = requiredHeaders.filter((header) => !availableHeaders.includes(header));
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
      for (const row of parsed) {
        if (seen.has(row.sku)) row.error = [row.error, "Duplicate SKU in file"].filter(Boolean).join(", ");
        seen.add(row.sku);
      }
      setRows(parsed);
    } catch (readError) {
      setRows([]);
      setError(readError instanceof Error ? readError.message : "Unable to read the Excel file.");
    }
  }

  function downloadTemplate() {
    const template = [
      {
        "Item Name": "Cheese Grilled Sandwich",
        SKU: "HNY-SAND-001",
        Description: "Four-slice grilled sandwich with cheese and house sauce.",
        "Item Type": "veg",
        "Base Price": 199,
        "Packaging Charge": 20,
        "Tax Rate": 5,
        "Image URL": "",
        "POS Available": "Yes",
        "Zomato Available": "Yes",
        "Swiggy Available": "Yes",
        Active: "Yes",
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(template);
    worksheet["!cols"] = [
      { wch: 30 }, { wch: 18 }, { wch: 55 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
      { wch: 12 }, { wch: 35 }, { wch: 16 }, { wch: 19 }, { wch: 19 }, { wch: 12 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Menu Import");
    XLSX.writeFile(workbook, "Takshvi_Menu_Import_Template.xlsx");
  }

  async function importRows() {
    if (!company || !locationId || !brandId) {
      setError("Select a location and brand before importing.");
      return;
    }
    const validRows = rows.filter((row) => !row.error);
    if (!validRows.length) {
      setError("There are no valid rows to import.");
      return;
    }

    setImporting(true);
    setMessage("");
    setError("");
    try {
      const { url, key } = config();
      const payload = validRows.map((row) => ({
        company_id: company.id,
        location_id: locationId,
        brand_id: brandId,
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
        headers: requestHeaders(key, "resolution=merge-duplicates,return=representation"),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());
      const imported = (await response.json()) as unknown[];
      setMessage(`${imported.length} menu item${imported.length === 1 ? "" : "s"} imported or updated successfully.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import menu items.");
    } finally {
      setImporting(false);
    }
  }

  const validCount = useMemo(() => rows.filter((row) => !row.error).length, [rows]);
  const invalidCount = rows.length - validCount;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-7 text-slate-950 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white md:p-9">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">Bulk Menu Upload</p>
          <h1 className="mt-2 text-3xl font-black">Import menu from Excel</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Upload hundreds of menu items for one brand in a single Excel file. Existing SKUs are updated; new SKUs are created.
          </p>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Location *</span>
              <select value={locationId} onChange={(event) => void loadBrands(event.target.value)} disabled={loading} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4">
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Brand *</span>
              <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4">
                <option value="">Select brand</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-emerald-500">
              <span className="text-lg font-black">Choose Excel file</span>
              <span className="mt-2 text-sm text-slate-500">Supported: .xlsx, .xls and .csv</span>
              <span className="mt-2 text-sm font-bold text-emerald-700">{fileName || "No file selected"}</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={readExcel} className="hidden" />
            </label>
            <button type="button" onClick={downloadTemplate} className="min-h-16 rounded-2xl border border-slate-200 px-6 font-black hover:border-emerald-500 hover:text-emerald-700">
              Download Excel template
            </button>
          </div>
        </section>

        {rows.length ? (
          <section className="rounded-3xl bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black">Import preview</h2>
                <p className="mt-1 text-sm text-slate-500">{validCount} valid · {invalidCount} need correction</p>
              </div>
              <button onClick={importRows} disabled={importing || !validCount || !brandId} className="h-12 rounded-xl bg-slate-950 px-6 font-black text-white hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50">
                {importing ? "Importing..." : `Import ${validCount} items`}
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Row</th><th className="p-3">Item</th><th className="p-3">SKU</th><th className="p-3">Type</th><th className="p-3">Price</th><th className="p-3">Packing</th><th className="p-3">GST</th><th className="p-3">Channels</th><th className="p-3">Status</th></tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.sku}`} className={`border-b border-slate-100 ${row.error ? "bg-red-50" : ""}`}>
                    <td className="p-3 font-bold">{row.rowNumber}</td><td className="p-3"><p className="font-bold">{row.name || "—"}</p><p className="max-w-xs truncate text-xs text-slate-500">{row.description}</p></td><td className="p-3 font-mono text-xs">{row.sku || "—"}</td><td className="p-3">{row.itemType}</td><td className="p-3">₹{Math.max(0, row.basePrice).toFixed(2)}</td><td className="p-3">₹{row.packagingCharge.toFixed(2)}</td><td className="p-3">{row.taxRate}%</td><td className="p-3 text-xs">{[row.availableOnPos && "POS", row.availableOnZomato && "Zomato", row.availableOnSwiggy && "Swiggy"].filter(Boolean).join(", ")}</td><td className="p-3">{row.error ? <span className="font-bold text-red-700">{row.error}</span> : <span className="font-bold text-emerald-700">Ready</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        ) : null}

        {message ? <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      </div>
    </main>
  );
}
