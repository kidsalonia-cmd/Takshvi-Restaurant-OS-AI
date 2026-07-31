"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string; city: string | null };
type Brand = {
  id: string;
  company_id: string;
  location_id: string;
  name: string;
  code: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  zomato_restaurant_id: string | null;
  swiggy_restaurant_id: string | null;
  fssai_number: string | null;
  is_active: boolean;
  shares_location_inventory: boolean;
};

const emptyBrand = {
  name: "",
  code: "",
  description: "",
  logoUrl: "",
  primaryColor: "#10b981",
  zomatoRestaurantId: "",
  swiggyRestaurantId: "",
  fssaiNumber: "",
  isActive: true,
  sharesLocationInventory: true,
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

export default function BrandsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState(emptyBrand);
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
    if (selectedLocationId) void loadBrands(selectedLocationId);
  }, [selectedLocationId]);

  async function loadFoundation() {
    setLoading(true);
    try {
      const { url, key } = config();
      const companyResponse = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, {
        headers: requestHeaders(key),
        cache: "no-store",
      });
      if (!companyResponse.ok) throw new Error(await companyResponse.text());
      const companyRows = (await companyResponse.json()) as Company[];
      if (!companyRows[0]) throw new Error("Create the company profile first.");
      setCompany(companyRows[0]);

      const locationResponse = await fetch(
        `${url}/rest/v1/locations?company_id=eq.${companyRows[0].id}&select=id,name,code,city&order=created_at.asc`,
        { headers: requestHeaders(key), cache: "no-store" },
      );
      if (!locationResponse.ok) throw new Error(await locationResponse.text());
      const locationRows = (await locationResponse.json()) as Location[];
      setLocations(locationRows);
      if (locationRows[0]) setSelectedLocationId(locationRows[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load brand setup.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBrands(locationId: string) {
    try {
      const { url, key } = config();
      const response = await fetch(
        `${url}/rest/v1/brands?location_id=eq.${locationId}&select=*&order=created_at.asc`,
        { headers: requestHeaders(key), cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      setBrands((await response.json()) as Brand[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load brands.");
    }
  }

  function update(field: keyof typeof brand, value: string | boolean) {
    setMessage("");
    setError("");
    setBrand((current) => ({ ...current, [field]: value }));
  }

  function startNew() {
    setEditingId(null);
    setBrand({ ...emptyBrand, code: `BR-${String(brands.length + 1).padStart(3, "0")}` });
    setMessage("");
    setError("");
  }

  function editBrand(item: Brand) {
    setEditingId(item.id);
    setBrand({
      name: item.name,
      code: item.code,
      description: item.description ?? "",
      logoUrl: item.logo_url ?? "",
      primaryColor: item.primary_color ?? "#10b981",
      zomatoRestaurantId: item.zomato_restaurant_id ?? "",
      swiggyRestaurantId: item.swiggy_restaurant_id ?? "",
      fssaiNumber: item.fssai_number ?? "",
      isActive: item.is_active,
      sharesLocationInventory: item.shares_location_inventory,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
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
        name: brand.name.trim(),
        code: brand.code.trim().toUpperCase(),
        description: brand.description.trim() || null,
        logo_url: brand.logoUrl.trim() || null,
        primary_color: brand.primaryColor,
        zomato_restaurant_id: brand.zomatoRestaurantId.trim() || null,
        swiggy_restaurant_id: brand.swiggyRestaurantId.trim() || null,
        fssai_number: brand.fssaiNumber.trim().toUpperCase() || null,
        is_active: brand.isActive,
        shares_location_inventory: brand.sharesLocationInventory,
        updated_at: new Date().toISOString(),
      };

      const endpoint = editingId
        ? `${url}/rest/v1/brands?id=eq.${editingId}`
        : `${url}/rest/v1/brands`;
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: requestHeaders(key, "return=representation"),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());

      setMessage(editingId ? "Brand updated successfully." : "Cloud-kitchen brand added successfully.");
      setEditingId(null);
      setBrand(emptyBrand);
      await loadBrands(selectedLocationId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save brand.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBrand(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/brands?id=eq.${id}`, {
        method: "DELETE",
        headers: requestHeaders(key),
      });
      if (!response.ok) throw new Error(await response.text());
      await loadBrands(selectedLocationId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete brand.");
    }
  }

  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter((item) =>
      [item.name, item.code, item.zomato_restaurant_id, item.swiggy_restaurant_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [brands, search]);

  const selectedLocation = locations.find((item) => item.id === selectedLocationId);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-400">Multi-brand cloud kitchen</p>
            <h1 className="mt-2 text-3xl font-black">Brands by location</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Add multiple Zomato and Swiggy cloud-kitchen brands under one physical location. All brands can share that location's inventory.
            </p>
          </div>
          <a href="/setup/location" className="rounded-xl bg-white px-5 py-3 text-center text-sm font-black text-slate-950">Manage locations</a>
        </div>

        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <form onSubmit={saveBrand} className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
              <div>
                <p className="text-sm font-bold text-emerald-600">{editingId ? "EDIT BRAND" : "ADD BRAND"}</p>
                <h2 className="text-xl font-black">Cloud-kitchen profile</h2>
              </div>
              <button type="button" onClick={startNew} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">New</button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Physical location *</span>
                <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500">
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                </select>
              </label>
              <Field label="Brand name" value={brand.name} onChange={(value) => update("name", value)} required />
              <Field label="Brand code" value={brand.code} onChange={(value) => update("code", value)} required />
              <Field label="Zomato Restaurant ID" value={brand.zomatoRestaurantId} onChange={(value) => update("zomatoRestaurantId", value)} />
              <Field label="Swiggy Restaurant ID" value={brand.swiggyRestaurantId} onChange={(value) => update("swiggyRestaurantId", value)} />
              <Field label="FSSAI number" value={brand.fssaiNumber} onChange={(value) => update("fssaiNumber", value)} />
              <Field label="Logo URL" value={brand.logoUrl} onChange={(value) => update("logoUrl", value)} />
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Description</span>
                <textarea value={brand.description} onChange={(event) => update("description", event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500" />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                <input type="checkbox" checked={brand.sharesLocationInventory} onChange={(event) => update("sharesLocationInventory", event.target.checked)} className="h-5 w-5 accent-emerald-500" />
                <span className="text-sm font-bold">Share this location's central inventory</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                <input type="checkbox" checked={brand.isActive} onChange={(event) => update("isActive", event.target.checked)} className="h-5 w-5 accent-emerald-500" />
                <span className="text-sm font-bold">Brand is active</span>
              </label>
              <button disabled={saving || !selectedLocationId} className="h-12 w-full rounded-xl bg-slate-950 font-black text-white transition hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Update brand" : "Add brand to location"}
              </button>
              {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}
              {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
            </div>
          </form>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Selected location" value={selectedLocation?.name ?? "No location"} />
              <Stat label="Cloud-kitchen brands" value={String(brands.length)} />
              <Stat label="Shared inventory" value={String(brands.filter((item) => item.shares_location_inventory).length)} />
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-600">ONE LOCATION, MULTIPLE BRANDS</p>
                  <h2 className="text-xl font-black">{selectedLocation?.name ?? "Location"} brands</h2>
                </div>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search brands..." className="h-11 rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500" />
              </div>

              {loading ? <p className="py-8 font-bold text-slate-500">Loading...</p> : null}
              {!loading && filteredBrands.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-lg font-black">No brands added yet</p>
                  <p className="mt-2 text-sm text-slate-500">Use the form to add Cafe Honeyman and your other cloud-kitchen brands.</p>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {filteredBrands.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black text-white" style={{ backgroundColor: item.primary_color ?? "#10b981" }}>
                          {item.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-black">{item.name}</h3>
                          <p className="text-xs font-bold text-slate-400">{item.code}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p><strong>Zomato:</strong> {item.zomato_restaurant_id || "Not mapped"}</p>
                      <p><strong>Swiggy:</strong> {item.swiggy_restaurant_id || "Not mapped"}</p>
                      <p><strong>Inventory:</strong> {item.shares_location_inventory ? "Shared location stock" : "Separate stock"}</p>
                    </div>
                    <div className="mt-5 flex gap-2">
                      <button onClick={() => editBrand(item)} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black">Edit</button>
                      <button onClick={() => void deleteBrand(item.id, item.name)} className="rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-600">Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}{required ? " *" : ""}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500" />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>;
}
