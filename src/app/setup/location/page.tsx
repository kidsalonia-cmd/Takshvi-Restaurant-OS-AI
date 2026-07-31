"use client";

import { FormEvent, useEffect, useState } from "react";

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
};

const emptyLocation = {
  name: "Location 1",
  code: "LOC-001",
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

function headers(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export default function LocationSetupPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [location, setLocation] = useState(emptyLocation);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const { url, key } = config();
        const companyResponse = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, {
          headers: headers(key),
          cache: "no-store",
        });
        if (!companyResponse.ok) throw new Error(await companyResponse.text());
        const companies = (await companyResponse.json()) as Company[];
        if (!companies[0]) throw new Error("Save the company profile before creating a location.");
        setCompany(companies[0]);

        const locationResponse = await fetch(
          `${url}/rest/v1/locations?company_id=eq.${companies[0].id}&select=*&order=created_at.asc&limit=1`,
          { headers: headers(key), cache: "no-store" },
        );
        if (!locationResponse.ok) throw new Error(await locationResponse.text());
        const locations = (await locationResponse.json()) as LocationRecord[];
        if (locations[0]) {
          const saved = locations[0];
          setLocationId(saved.id);
          setLocation({
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
          });
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load location setup.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update(field: keyof typeof location, value: string | boolean) {
    setMessage("");
    setError("");
    setLocation((current) => ({ ...current, [field]: value }));
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

      const endpoint = locationId
        ? `${url}/rest/v1/locations?id=eq.${locationId}`
        : `${url}/rest/v1/locations`;
      const response = await fetch(endpoint, {
        method: locationId ? "PATCH" : "POST",
        headers: headers(key, "return=representation"),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());
      const rows = (await response.json()) as LocationRecord[];
      if (rows[0]?.id) setLocationId(rows[0].id);
      setMessage(locationId ? "Location updated successfully." : "First location created successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save location.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-5xl">
        <a href="/setup" className="text-sm font-bold text-emerald-600">← Back to setup</a>
        <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm md:p-9">
          <div className="border-b border-slate-200 pb-6">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600">Step 2</p>
            <h1 className="mt-2 text-3xl font-black">First restaurant location</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {company ? `This location will belong to ${company.name}.` : "Loading company information..."}
            </p>
          </div>

          {loading ? <p className="mt-7 font-bold text-slate-500">Loading...</p> : null}
          {!loading ? (
            <form onSubmit={submit} className="mt-7 space-y-7">
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

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-400">Repeated saves update the same location instead of creating duplicates.</p>
                <button disabled={saving || !company} className="h-12 shrink-0 rounded-xl bg-slate-950 px-6 font-black text-white transition hover:bg-emerald-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? "Saving..." : locationId ? "Update location" : "Create location"}
                </button>
              </div>

              {message ? <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
              {error ? <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
            </form>
          ) : null}
        </div>
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
