"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type InventoryItem = {
  id: string;
  company_id: string;
  location_id: string;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  reorder_level: number;
  average_cost: number;
  is_active: boolean;
};

const emptyItem = {
  name: "",
  sku: "",
  unit: "g",
  currentStock: "0",
  reorderLevel: "0",
  averageCost: "0",
  isActive: true,
};

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

export default function InventoryPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [item, setItem] = useState(emptyItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadFoundation();
  }, []);

  useEffect(() => {
    if (selectedLocationId) void loadItems(selectedLocationId);
  }, [selectedLocationId]);

  async function loadFoundation() {
    setLoading(true);
    try {
      const { url, key } = config();
      const companyResponse = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, {
        headers: requestHeaders(key), cache: "no-store",
      });
      if (!companyResponse.ok) throw new Error(await companyResponse.text());
      const companies = (await companyResponse.json()) as Company[];
      if (!companies[0]) throw new Error("Create the company profile first.");
      setCompany(companies[0]);

      const locationResponse = await fetch(`${url}/rest/v1/locations?company_id=eq.${companies[0].id}&select=id,name,code&order=created_at.asc`, {
        headers: requestHeaders(key), cache: "no-store",
      });
      if (!locationResponse.ok) throw new Error(await locationResponse.text());
      const locationRows = (await locationResponse.json()) as Location[];
      setLocations(locationRows);
      if (locationRows[0]) setSelectedLocationId(locationRows[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load inventory setup.");
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(locationId: string) {
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/inventory_items?location_id=eq.${locationId}&select=*&order=name.asc`, {
        headers: requestHeaders(key), cache: "no-store",
      });
      if (!response.ok) throw new Error(await response.text());
      setItems((await response.json()) as InventoryItem[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load inventory items.");
    }
  }

  function update(field: keyof typeof item, value: string | boolean) {
    setItem((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  function startNew() {
    setEditingId(null);
    setItem(emptyItem);
    setMessage("");
    setError("");
  }

  function editItem(saved: InventoryItem) {
    setEditingId(saved.id);
    setItem({
      name: saved.name,
      sku: saved.sku ?? "",
      unit: saved.unit,
      currentStock: String(saved.current_stock),
      reorderLevel: String(saved.reorder_level),
      averageCost: String(saved.average_cost),
      isActive: saved.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company || !selectedLocationId) return;
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { url, key } = config();
      const payload = {
        company_id: company.id,
        location_id: selectedLocationId,
        name: item.name.trim(),
        sku: item.sku.trim() || null,
        unit: item.unit,
        current_stock: Number(item.currentStock || 0),
        reorder_level: Number(item.reorderLevel || 0),
        average_cost: Number(item.averageCost || 0),
        is_active: item.isActive,
        updated_at: new Date().toISOString(),
      };

      const endpoint = editingId ? `${url}/rest/v1/inventory_items?id=eq.${editingId}` : `${url}/rest/v1/inventory_items`;
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: requestHeaders(key, "return=representation"),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());

      setMessage(editingId ? "Inventory item updated successfully." : "Inventory item added successfully.");
      setEditingId(null);
      setItem(emptyItem);
      await loadItems(selectedLocationId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save inventory item.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(saved: InventoryItem) {
    if (!window.confirm(`Delete ${saved.name}?`)) return;
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/inventory_items?id=eq.${saved.id}`, {
        method: "DELETE", headers: requestHeaders(key),
      });
      if (!response.ok) throw new Error(await response.text());
      await loadItems(selectedLocationId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete inventory item.");
    }
  }

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((saved) => [saved.name, saved.sku, saved.unit].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [items, search]);

  const totalValue = items.reduce((sum, saved) => sum + Number(saved.current_stock) * Number(saved.average_cost), 0);
  const lowStock = items.filter((saved) => Number(saved.current_stock) <= Number(saved.reorder_level)).length;
  const selectedLocation = locations.find((saved) => saved.id === selectedLocationId);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-400">Shared stock across all brands</p>
          <h1 className="mt-2 text-3xl font-black">Central Inventory</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Manage ingredients location-wise. Orders from every brand at the selected location will consume this same central stock through recipes.</p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Location" value={selectedLocation?.name ?? "No location"} />
          <Stat label="Inventory items" value={String(items.length)} />
          <Stat label="Low stock" value={String(lowStock)} />
          <Stat label="Stock value" value={`₹${totalValue.toFixed(2)}`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <form onSubmit={saveItem} className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 pb-5">
              <div><p className="text-sm font-bold text-emerald-600">{editingId ? "EDIT ITEM" : "ADD ITEM"}</p><h2 className="text-xl font-black">Ingredient master</h2></div>
              <button type="button" onClick={startNew} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">New</button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-bold">Location *</span><select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4">{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select></label>
              <Field label="Ingredient name" value={item.name} onChange={(value) => update("name", value)} required />
              <Field label="SKU" value={item.sku} onChange={(value) => update("sku", value)} />
              <label className="block"><span className="mb-2 block text-sm font-bold">Unit *</span><select value={item.unit} onChange={(event) => update("unit", event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4">{["g","kg","ml","l","piece","pack","slice","portion"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
              <Field label="Current stock" value={item.currentStock} onChange={(value) => update("currentStock", value)} type="number" />
              <Field label="Reorder level" value={item.reorderLevel} onChange={(value) => update("reorderLevel", value)} type="number" />
              <Field label="Average cost per unit (₹)" value={item.averageCost} onChange={(value) => update("averageCost", value)} type="number" />
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={item.isActive} onChange={(event) => update("isActive", event.target.checked)} className="h-5 w-5 accent-emerald-500" /><span className="text-sm font-bold">Item is active</span></label>
              <button disabled={saving || !selectedLocationId} className="h-12 w-full rounded-xl bg-slate-950 font-black text-white transition hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50">{saving ? "Saving..." : editingId ? "Update item" : "Add inventory item"}</button>
              {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}
              {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
            </div>
          </form>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-emerald-600">LOCATION-WISE STOCK</p><h2 className="text-xl font-black">{selectedLocation?.name ?? "Inventory"}</h2></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ingredients..." className="h-11 rounded-xl border border-slate-200 px-4" /></div>
            {loading ? <p className="py-10 text-center font-bold text-slate-500">Loading inventory...</p> : null}
            {!loading && filteredItems.length === 0 ? <div className="py-12 text-center"><p className="text-lg font-black">No inventory items</p><p className="mt-2 text-sm text-slate-500">Add bread, cheese, milk, coffee, packaging and other ingredients.</p></div> : null}
            <div className="mt-5 space-y-3">{filteredItems.map((saved) => {
              const isLow = Number(saved.current_stock) <= Number(saved.reorder_level);
              return <article key={saved.id} className="grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{saved.name}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${isLow ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{isLow ? "Low stock" : "Healthy"}</span></div><p className="mt-1 text-xs font-bold text-slate-400">{saved.sku || "No SKU"} · ₹{Number(saved.average_cost).toFixed(2)} per {saved.unit}</p></div><div className="text-right"><p className="text-lg font-black">{Number(saved.current_stock).toFixed(3)} {saved.unit}</p><p className="text-xs text-slate-400">Reorder at {Number(saved.reorder_level).toFixed(3)}</p></div><div className="flex gap-2"><button onClick={() => editItem(saved)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Edit</button><button onClick={() => deleteItem(saved)} className="rounded-xl border border-red-100 px-4 py-2 text-sm font-bold text-red-600">Delete</button></div></article>;
            })}</div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}{required ? " *" : ""}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} step={type === "number" ? "0.001" : undefined} className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500" /></label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}
