"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string };
type LocationRecord = {
  id: string;
  company_id: string;
  name: string;
  code: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  timezone: string;
  is_active: boolean;
  created_at?: string;
};

type LocationForm = {
  name: string;
  code: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  gstin: string;
  timezone: string;
  isActive: boolean;
};

const emptyLocation: LocationForm = {
  name: "",
  code: "",
  addressLine1: "",
  addressLine2: "",
  city: "Gurugram",
  state: "Haryana",
  postalCode: "",
  phone: "",
  email: "",
  gstin: "",
  timezone: "Asia/Kolkata",
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

function toForm(saved: LocationRecord): LocationForm {
  return {
    name: saved.name,
    code: saved.code,
    addressLine1: saved.address_line_1 ?? "",
    addressLine2: saved.address_line_2 ?? "",
    city: saved.city ?? "",
    state: saved.state ?? "",
    postalCode: saved.postal_code ?? "",
    phone: saved.phone ?? "",
    email: saved.email ?? "",
    gstin: saved.gstin ?? "",
    timezone: saved.timezone,
    isActive: saved.is_active,
  };
}

export default function LocationSetupPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationForm>(emptyLocation);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadLocations(companyId: string) {
    const { url, key } = config();
    const response = await fetch(
      `${url}/rest/v1/locations?company_id=eq.${companyId}&select=*&order=created_at.asc`,
      { headers: requestHeaders(key), cache: "no-store" },
    );
    if (!response.ok) throw new Error(await response.text());
    setLocations((await response.json()) as LocationRecord[]);
  }

  useEffect(() => {
    async function load() {
      try {
        const { url, key } = config();
        const companyResponse = await fetch(
          `${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`,
          { headers: requestHeaders(key), cache: "no-store" },
        );
        if (!companyResponse.ok) throw new Error(await companyResponse.text());
        const companies = (await companyResponse.json()) as Company[];
        if (!companies[0]) throw new Error("Save the company profile before creating a location.");
        setCompany(companies[0]);
        await loadLocations(companies[0].id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load locations.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredLocations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return locations;
    return locations.filter((item) =>
      [item.name, item.code, item.city, item.state, item.postal_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [locations, search]);

  function update(field: keyof LocationForm, value: string | boolean) {
    setMessage("");
    setError("");
    setLocation((current) => ({ ...current, [field]: value }));
  }

  function startNewLocation() {
    const nextNumber = locations.length + 1;
    setEditingId(null);
    setLocation({
      ...emptyLocation,
      name: `Location ${nextNumber}`,
      code: `LOC-${String(nextNumber).padStart(3, "0")}`,
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function startEdit(saved: LocationRecord) {
    setEditingId(saved.id);
    setLocation(toForm(saved));
    setMessage("");
    setError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setLocation(emptyLocation);
    setMessage("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company) return;
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { url, key } = config();
      const payload = {
        company_id: company.id,
        name: location.name.trim(),
        code: location.code.trim().toUpperCase(),
        address_line_1: location.addressLine1.trim() || null,
        address_line_2: location.addressLine2.trim() || null,
        city: location.city.trim() || null,
        state: location.state.trim() || null,
        postal_code: location.postalCode.trim() || null,
        phone: location.phone.trim() || null,
        email: location.email.trim() || null,
        gstin: location.gstin.trim().toUpperCase() || null,
        timezone: location.timezone,
        is_active: location.isActive,
        updated_at: new Date().toISOString(),
      };

      const endpoint = editingId
        ? `${url}/rest/v1/locations?id=eq.${editingId}`
        : `${url}/rest/v1/locations`;
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: requestHeaders(key, "return=representation"),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());

      await loadLocations(company.id);
      setMessage(editingId ? "Location updated successfully." : "New location created successfully.");
      setEditingId(null);
      setLocation(emptyLocation);
      setShowForm(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save location.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(saved: LocationRecord) {
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/locations?id=eq.${saved.id}`, {
        method: "PATCH",
        headers: requestHeaders(key, "return=minimal"),
        body: JSON.stringify({ is_active: !saved.is_active, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(await response.text());
      if (company) await loadLocations(company.id);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update status.");
    }
  }

  async function deleteLocation(saved: LocationRecord) {
    if (!window.confirm(`Delete ${saved.name}? This cannot be undone.`)) return;
    setDeletingId(saved.id);
    setError("");
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/locations?id=eq.${saved.id}`, {
        method: "DELETE",
        headers: requestHeaders(key),
      });
      if (!response.ok) throw new Error(await response.text());
      if (company) await loadLocations(company.id);
      setMessage("Location deleted successfully.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete location.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-7 text-slate-950 md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <a href="/setup" className="text-sm font-bold text-emerald-600">← Back to setup</a>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Location Management</h1>
            <p className="mt-2 text-sm text-slate-500">
              {company ? `Manage every operating location under ${company.name}.` : "Loading company information..."}
            </p>
          </div>
          <button onClick={startNewLocation} disabled={!company || loading} className="h-12 rounded-xl bg-slate-950 px-6 font-black text-white transition hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50">
            + Add New Location
          </button>
        </div>

        {showForm ? (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-600">{editingId ? "Edit location" : "New location"}</p>
                <h2 className="mt-2 text-2xl font-black">{editingId ? "Update operating location" : "Create another operating location"}</h2>
              </div>
              <button type="button" onClick={closeForm} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Close</button>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-7">
              <section className="grid gap-5 md:grid-cols-2">
                <Field label="Location name" value={location.name} onChange={(value) => update("name", value)} required />
                <Field label="Location code" value={location.code} onChange={(value) => update("code", value)} required />
                <Field label="Address line 1" value={location.addressLine1} onChange={(value) => update("addressLine1", value)} />
                <Field label="Address line 2" value={location.addressLine2} onChange={(value) => update("addressLine2", value)} />
                <Field label="City" value={location.city} onChange={(value) => update("city", value)} />
                <Field label="State" value={location.state} onChange={(value) => update("state", value)} />
                <Field label="PIN code" value={location.postalCode} onChange={(value) => update("postalCode", value)} />
                <Field label="Phone" value={location.phone} onChange={(value) => update("phone", value)} type="tel" />
                <Field label="Email" value={location.email} onChange={(value) => update("email", value)} type="email" />
                <Field label="Location GSTIN" value={location.gstin} onChange={(value) => update("gstin", value)} />
                <label className="block">
                  <span className="mb-2 block text-sm font-bold">Timezone</span>
                  <select value={location.timezone} onChange={(event) => update("timezone", event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100">
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <input type="checkbox" checked={location.isActive} onChange={(event) => update("isActive", event.target.checked)} className="h-5 w-5 accent-emerald-500" />
                  <span className="font-bold">Location is active</span>
                </label>
              </section>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
                <button type="button" onClick={closeForm} className="h-12 rounded-xl border border-slate-200 px-5 font-bold">Cancel</button>
                <button disabled={saving || !company} className="h-12 rounded-xl bg-slate-950 px-6 font-black text-white transition hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50">
                  {saving ? "Saving..." : editingId ? "Update location" : "Create location"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-600">{locations.length} total location{locations.length === 1 ? "" : "s"}</p>
              <h2 className="mt-1 text-xl font-black">All Locations</h2>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, code or city..." className="h-11 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 md:max-w-sm" />
          </div>

          {loading ? <p className="py-10 text-center font-bold text-slate-500">Loading locations...</p> : null}
          {!loading && filteredLocations.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg font-black">No locations found</p>
              <p className="mt-2 text-sm text-slate-500">Create a new location or change your search.</p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filteredLocations.map((saved) => (
              <article key={saved.id} className="rounded-2xl border border-slate-200 p-5 transition hover:border-emerald-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">{saved.code}</p>
                    <h3 className="mt-1 text-lg font-black">{saved.name}</h3>
                  </div>
                  <button onClick={() => toggleStatus(saved)} className={`rounded-full px-3 py-1 text-xs font-black ${saved.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {saved.is_active ? "Active" : "Inactive"}
                  </button>
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-500">
                  <p>{[saved.address_line_1, saved.city, saved.state, saved.postal_code].filter(Boolean).join(", ") || "Address not added"}</p>
                  <p>{saved.phone || "Phone not added"}</p>
                  <p>{saved.email || "Email not added"}</p>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                  <div className="rounded-xl bg-slate-50 p-2"><p className="text-xs text-slate-400">Brands</p><p className="font-black">0</p></div>
                  <div className="rounded-xl bg-slate-50 p-2"><p className="text-xs text-slate-400">Orders</p><p className="font-black">0</p></div>
                  <div className="rounded-xl bg-slate-50 p-2"><p className="text-xs text-slate-400">Inventory</p><p className="font-black">₹0</p></div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => startEdit(saved)} className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-bold transition hover:border-emerald-400 hover:text-emerald-700">Edit</button>
                  <button onClick={() => deleteLocation(saved)} disabled={deletingId === saved.id} className="h-10 rounded-xl border border-red-100 px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                    {deletingId === saved.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {message ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}{required ? " *" : ""}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" />
    </label>
  );
}
