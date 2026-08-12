"use client";

import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type InventoryItem = { id: string; name: string; sku: string | null; unit: string; current_stock: number; average_cost: number; reorder_level: number };
type ImportResult = { success: boolean; sourceOnly?: boolean; posted?: number; unmatched?: number; message?: string; results?: { item: string; quantity: number; rate: number; status: string }[] };

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}
function auth(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }
function money(value: number) { return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }

export default function PurchasesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => { void loadLocations(); }, []);
  useEffect(() => { if (locationId) void loadInventory(locationId); }, [locationId]);

  async function loadLocations() {
    try {
      const { url, key } = cfg();
      const response = await fetch(`${url}/rest/v1/locations?select=id,name,code&order=name.asc`, { headers: auth(key), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const rows = await response.json() as Location[];
      setLocations(rows); setLocationId(rows[0]?.id || "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load locations."); }
  }

  async function loadInventory(id: string) {
    try {
      const { url, key } = cfg();
      const response = await fetch(`${url}/rest/v1/inventory_items?location_id=eq.${encodeURIComponent(id)}&select=id,name,sku,unit,current_stock,average_cost,reorder_level&order=name.asc`, { headers: auth(key), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      setInventory(await response.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load inventory."); }
  }

  async function upload() {
    if (!locationId || !file) return setMessage("Select a location and purchase bill first.");
    setBusy(true); setMessage(""); setResult(null);
    try {
      const form = new FormData(); form.append("locationId", locationId); form.append("file", file);
      const response = await fetch("/api/inventory/purchase-upload", { method: "POST", body: form });
      const data = await response.json() as ImportResult;
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to import purchase bill.");
      setResult(data); setMessage(data.message || "Purchase bill processed."); setFile(null); await loadInventory(locationId);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to import purchase bill."); }
    finally { setBusy(false); }
  }

  const stockValue = useMemo(() => inventory.reduce((sum, item) => sum + Number(item.current_stock) * Number(item.average_cost), 0), [inventory]);
  const lowStock = useMemo(() => inventory.filter((item) => Number(item.current_stock) <= Number(item.reorder_level)).length, [inventory]);

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Purchases & Inventory Costing</p><h1 className="mt-2 text-3xl font-black">Purchase bill upload</h1><p className="mt-2 text-sm text-slate-300">Excel/CSV automatically increases stock and recalculates weighted-average ingredient cost. PDF is preserved as the source bill for reference.</p></header>
    <section className="grid gap-4 md:grid-cols-3"><Stat label="Inventory value" value={money(stockValue)} /><Stat label="Ingredients" value={String(inventory.length)} /><Stat label="Low stock" value={String(lowStock)} /></section>
    <section className="rounded-3xl bg-white p-6 shadow-sm"><div className="grid gap-4 md:grid-cols-[1fr_1.5fr_auto]"><select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-12 rounded-xl border px-4">{locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}</select><label className="flex h-12 cursor-pointer items-center rounded-xl border border-dashed px-4 text-sm font-bold"><span className="truncate">{file ? file.name : "Choose Excel / CSV / PDF purchase bill"}</span><input type="file" accept=".xlsx,.xls,.csv,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label><button onClick={() => void upload()} disabled={busy || !file} className="h-12 rounded-xl bg-emerald-500 px-6 font-black disabled:opacity-40">{busy ? "Processing..." : "Upload & Post"}</button></div><p className="mt-3 text-xs text-slate-500">Excel columns supported: Item/Ingredient/Product, SKU/Code, Qty/Quantity, Rate/Unit Cost/Price. Matching is by SKU first, then ingredient name.</p>{message ? <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900">{message}</p> : null}</section>
    {result?.results?.length ? <section className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-black">Import result</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-slate-950 text-white"><tr><th className="p-3 text-left">Ingredient</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{result.results.map((row, index) => <tr key={`${row.item}-${index}`} className="border-b"><td className="p-3 font-bold">{row.item}</td><td className="p-3 text-right">{row.quantity}</td><td className="p-3 text-right">{money(row.rate)}</td><td className={`p-3 font-bold ${row.status === "Posted" ? "text-emerald-700" : "text-red-600"}`}>{row.status}</td></tr>)}</tbody></table></div></section> : null}
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-black">Current stock & average cost</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-3">Ingredient</th><th className="p-3">SKU</th><th className="p-3 text-right">Stock</th><th className="p-3 text-right">Avg cost / unit</th><th className="p-3 text-right">Stock value</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.id} className="border-b"><td className="p-3 font-bold">{item.name}</td><td className="p-3">{item.sku || "—"}</td><td className="p-3 text-right">{Number(item.current_stock).toFixed(3)} {item.unit}</td><td className="p-3 text-right">{money(item.average_cost)}</td><td className="p-3 text-right font-bold">{money(Number(item.current_stock) * Number(item.average_cost))}</td></tr>)}</tbody></table></div></section>
  </div></main>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
