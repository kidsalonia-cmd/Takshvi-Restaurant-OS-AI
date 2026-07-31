"use client";

import { useEffect, useState } from "react";

type LocationType = "cloud_kitchen" | "physical_store" | "hybrid";

type LocationRecord = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  is_active: boolean;
  location_type: LocationType;
};

const typeLabels: Record<LocationType, string> = {
  cloud_kitchen: "Cloud Kitchen",
  physical_store: "Physical Store",
  hybrid: "Hybrid: Store + Cloud Kitchen",
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

export default function LocationTypePage() {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadLocations() {
    const { url, key } = config();
    const response = await fetch(
      `${url}/rest/v1/locations?select=id,name,code,city,is_active,location_type&order=created_at.asc`,
      { headers: requestHeaders(key), cache: "no-store" },
    );
    if (!response.ok) throw new Error(await response.text());
    setLocations((await response.json()) as LocationRecord[]);
  }

  useEffect(() => {
    async function load() {
      try {
        await loadLocations();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load locations.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function updateType(id: string, locationType: LocationType) {
    setSavingId(id);
    setMessage("");
    setError("");

    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/locations?id=eq.${id}`, {
        method: "PATCH",
        headers: requestHeaders(key, "return=minimal"),
        body: JSON.stringify({
          location_type: locationType,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      setLocations((current) =>
        current.map((location) =>
          location.id === id ? { ...location, location_type: locationType } : location,
        ),
      );
      setMessage("Location operating type updated successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update location type.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <a href="/setup/location" className="text-sm font-bold text-emerald-600">
              ← Back to locations
            </a>
            <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-emerald-600">
              Location classification
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Mark each operating model</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Select whether the location operates only as a cloud kitchen, as a customer-facing physical store, or as both.
            </p>
          </div>
          <a
            href="/setup/location"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-black text-white"
          >
            Manage Locations
          </a>
        </div>

        {loading ? (
          <div className="mt-8 rounded-3xl bg-white p-10 text-center font-bold text-slate-500 shadow-sm">
            Loading locations...
          </div>
        ) : null}

        {!loading && locations.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-black">No locations found</p>
            <p className="mt-2 text-sm text-slate-500">Create your first location before setting its operating type.</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {locations.map((location) => (
            <article key={location.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">{location.code}</p>
                  <h2 className="mt-1 text-xl font-black">{location.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{location.city || "City not added"}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    location.is_active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {location.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <label className="mt-6 block">
                <span className="mb-2 block text-sm font-bold">Operating model</span>
                <select
                  value={location.location_type || "cloud_kitchen"}
                  disabled={savingId === location.id}
                  onChange={(event) => updateType(location.id, event.target.value as LocationType)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
                >
                  <option value="cloud_kitchen">Cloud Kitchen</option>
                  <option value="physical_store">Physical Store</option>
                  <option value="hybrid">Hybrid: Store + Cloud Kitchen</option>
                </select>
              </label>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Current classification</p>
                <p className="mt-1 font-black">{typeLabels[location.location_type || "cloud_kitchen"]}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {location.location_type === "physical_store"
                    ? "Customer-facing outlet with walk-in or dine-in operations."
                    : location.location_type === "hybrid"
                      ? "Customer-facing outlet that also runs delivery-only cloud-kitchen brands."
                      : "Delivery and takeaway operation without a customer-facing storefront."}
                </p>
              </div>
            </article>
          ))}
        </div>

        {message ? (
          <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>
        ) : null}
      </div>
    </main>
  );
}
