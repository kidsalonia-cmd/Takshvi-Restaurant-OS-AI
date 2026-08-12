"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type InventoryItem = { id: string; location_id: string; name: string; sku: string | null; unit: string; current_stock: number; average_cost: number; is_active: boolean };
type TransferResult = {
  success: boolean;
  transferNumber?: string;
  message?: string;
  quantity?: number;
  item?: { name: string; sku: string | null; unit: string };
  from?: { name: string; remainingStock: number };
  to?: { name: string; newStock: number; averageCost: number };
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

export default function StockTransferPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TransferResult | null>(null);

  useEffect(() => { void loadLocations(); }, []);
  useEffect(() => { if (fromLocationId) void loadItems(fromLocationId); }, [fromLocationId]);

  async function loadLocations() {
    setLoading(true);
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/locations?is_active=eq.true&select=id,name,code&order=name.asc`, { headers: headers(key), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const rows = await response.json() as Location[];
      setLocations(rows);
      setFromLocationId(rows[0]?.id || "");
      setToLocationId(rows.find((row) => row.id !== rows[0]?.id)?.id || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load locations."); }
    finally { setLoading(false); }
  }

  async function loadItems(locationId: string) {
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/inventory_items?location_id=eq.${encodeURIComponent(locationId)}&is_active=eq.true&select=id,location_id,name,sku,unit,current_stock,average_cost,is_active&order=name.asc`, { headers: headers(key), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const rows = await response.json() as InventoryItem[];
      setItems(rows);
      setInventoryItemId(rows[0]?.id || "");
      setQuantity("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load source stock."); }
  }

  const selectedItem = items.find((item) => item.id === inventoryItemId);
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.name} ${item.sku || ""}`.toLowerCase().includes(q));
  }, [items, search]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    const qty = Number(quantity);
    if (fromLocationId === toLocationId) return setError("Select a different destination location.");
    if (!selectedItem) return setError("Select an ingredient to transfer.");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Enter a valid transfer quantity.");
    if (qty > Number(selectedItem.current_stock)) return setError(`Only ${Number(selectedItem.current_stock).toFixed(3)} ${selectedItem.unit} is available.`);

    setPosting(true);
    try {
      const response = await fetch("/api/inventory/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromLocationId, toLocationId, inventoryItemId, quantity: qty, note }),
      });
      const data = await response.json() as TransferResult;
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to transfer stock.");
      setResult(data);
      setQuantity("");
      setNote("");
      await loadItems(fromLocationId);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to transfer stock."); }
    finally { setPosting(false); }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">Inventory movement</p>
              <h1 className="mt-1 text-3xl font-black">Stock Transfer</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">Move ingredients between locations. Source stock decreases and destination stock increases immediately.</p>
            </div>
            <Link href="/inventory" className="rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-black hover:bg-white hover:text-slate-950">← Inventory</Link>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <form onSubmit={submit} className="rounded-3xl bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-xl font-black">Create transfer</h2>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-bold">From location *</span><select value={fromLocationId} onChange={(e) => { setFromLocationId(e.target.value); if (e.target.value === toLocationId) setToLocationId(locations.find((l) => l.id !== e.target.value)?.id || ""); }} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4">{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select></label>
              <label className="block"><span className="mb-2 block text-sm font-bold">To location *</span><select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4">{locations.filter((l) => l.id !== fromLocationId).map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select></label>
              <label className="block"><span className="mb-2 block text-sm font-bold">Search ingredient</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" className="h-12 w-full rounded-xl border border-slate-200 px-4" /></label>
              <label className="block"><span className="mb-2 block text-sm font-bold">Ingredient *</span><select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4">{filteredItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.current_stock).toFixed(3)} {item.unit}</option>)}</select></label>
              {selectedItem ? <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-black uppercase text-emerald-700">Available stock</p><p className="mt-1 text-2xl font-black">{Number(selectedItem.current_stock).toFixed(3)} {selectedItem.unit}</p><p className="mt-1 text-xs font-bold text-slate-500">{selectedItem.sku || "No SKU"} · Average cost ₹{Number(selectedItem.average_cost).toFixed(2)} / {selectedItem.unit}</p></div> : null}
              <label className="block"><span className="mb-2 block text-sm font-bold">Transfer quantity *</span><div className="flex"><input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0.001" step="0.001" className="h-12 min-w-0 flex-1 rounded-l-xl border border-slate-200 px-4" /><span className="flex h-12 items-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-50 px-4 font-black">{selectedItem?.unit || "unit"}</span></div></label>
              <label className="block"><span className="mb-2 block text-sm font-bold">Note / reference</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional transfer reason" className="w-full rounded-xl border border-slate-200 p-4" /></label>
              <button disabled={posting || loading || !selectedItem || !toLocationId} className="h-12 w-full rounded-xl bg-emerald-500 font-black text-slate-950 disabled:opacity-50">{posting ? "Transferring..." : "Transfer & Update Inventory"}</button>
              {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
            </div>
          </form>

          <section className="rounded-3xl bg-white p-5 shadow-sm md:p-6">
            <p className="text-sm font-black uppercase text-emerald-600">Automatic update</p>
            <h2 className="mt-1 text-2xl font-black">How the transfer works</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Info title="Source location" text="Transfer quantity is deducted immediately. A transfer is blocked when stock is insufficient." />
              <Info title="Destination location" text="Existing SKU stock is increased automatically. If the ingredient is missing, it is created at the destination." />
              <Info title="Average cost" text="Transferred stock carries its source cost. Existing destination stock uses weighted-average costing." />
              <Info title="Safety" text="Same-location transfers are blocked and source stock uses an optimistic check to prevent stale-stock posting." />
            </div>

            {result?.success ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Transfer completed</p>
              <h3 className="mt-1 text-xl font-black">{result.transferNumber}</h3>
              <p className="mt-2 text-sm font-bold text-emerald-800">{result.message}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-4"><p className="text-xs font-bold text-slate-500">FROM · {result.from?.name}</p><p className="mt-1 text-lg font-black">Balance {Number(result.from?.remainingStock || 0).toFixed(3)} {result.item?.unit}</p></div>
                <div className="rounded-xl bg-white p-4"><p className="text-xs font-bold text-slate-500">TO · {result.to?.name}</p><p className="mt-1 text-lg font-black">Stock {Number(result.to?.newStock || 0).toFixed(3)} {result.item?.unit}</p></div>
              </div>
            </div> : null}
          </section>
        </section>
      </div>
    </main>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>;
}
