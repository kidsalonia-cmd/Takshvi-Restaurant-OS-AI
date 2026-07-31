"use client";

import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = {
  id: string;
  location_id: string;
  name: string;
  code: string;
  operating_model: "cloud_kitchen" | "physical_store" | "hybrid";
  is_active: boolean;
};

const modelLabels = {
  cloud_kitchen: "Cloud Kitchen",
  physical_store: "Physical Store",
  hybrid: "Physical Store + Cloud Kitchen",
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

export default function BrandOperatingModelPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadLocations();
  }, []);

  useEffect(() => {
    if (selectedLocationId) void loadBrands(selectedLocationId);
  }, [selectedLocationId]);

  async function loadLocations() {
    setLoading(true);
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/locations?select=id,name,code&order=created_at.asc`, {
        headers: headers(key),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await response.text());
      const rows = (await response.json()) as Location[];
      setLocations(rows);
      if (rows[0]) setSelectedLocationId(rows[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load locations.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBrands(locationId: string) {
    setLoading(true);
    setError("");
    try {
      const { url, key } = config();
      const response = await fetch(
        `${url}/rest/v1/brands?location_id=eq.${locationId}&select=id,location_id,name,code,operating_model,is_active&order=created_at.asc`,
        { headers: headers(key), cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      setBrands((await response.json()) as Brand[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load brands.");
    } finally {
      setLoading(false);
    }
  }

  async function updateModel(brand: Brand, operatingModel: Brand["operating_model"]) {
    setSavingId(brand.id);
    setMessage("");
    setError("");
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/brands?id=eq.${brand.id}`, {
        method: "PATCH",
        headers: headers(key, "return=minimal"),
        body: JSON.stringify({ operating_model: operatingModel, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(await response.text());
      setBrands((current) => current.map((item) => item.id === brand.id ? { ...item, operating_model: operatingModel } : item));
      setMessage(`${brand.name} marked as ${modelLabels[operatingModel]}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update brand type.");
    } finally {
      setSavingId(null);
    }
  }

  const filteredBrands = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return brands;
    return brands.filter((brand) =>
      [brand.name, brand.code, modelLabels[brand.operating_model]]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [brands, search]);

  const selectedLocation = locations.find((location) => location.id === selectedLocationId);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-400">Brand-wise operating model</p>
          <h1 className="mt-2 text-3xl font-black">Mark every brand separately</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            The location remains the physical operating address. Each brand can independently be marked as a cloud kitchen, physical store, or hybrid brand.
          </p>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Location</span>
              <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500">
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name} ({location.code})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Search brands</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Brand name or code" className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500" />
            </label>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="border-b border-slate-200 pb-5">
            <p className="text-sm font-bold text-emerald-600">{selectedLocation?.name ?? "Location"}</p>
            <h2 className="mt-1 text-xl font-black">Brand classification</h2>
          </div>

          {loading ? <p className="py-10 text-center font-bold text-slate-500">Loading brands...</p> : null}
          {!loading && filteredBrands.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg font-black">No brands found</p>
              <p className="mt-2 text-sm text-slate-500">Add brands first from Brand Management.</p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {filteredBrands.map((brand) => (
              <article key={brand.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{brand.name}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-400">{brand.code}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${brand.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {brand.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-sm font-bold">Brand type</span>
                  <select
                    value={brand.operating_model}
                    disabled={savingId === brand.id}
                    onChange={(event) => void updateModel(brand, event.target.value as Brand["operating_model"])}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value="cloud_kitchen">Cloud Kitchen</option>
                    <option value="physical_store">Physical Store</option>
                    <option value="hybrid">Physical Store + Cloud Kitchen</option>
                  </select>
                </label>
              </article>
            ))}
          </div>
        </section>

        {message ? <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}

        <div className="flex flex-wrap gap-3">
          <a href="/brands" className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Back to Brand Management</a>
          <a href="/setup/location" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black">Manage physical locations</a>
        </div>
      </div>
    </main>
  );
}
