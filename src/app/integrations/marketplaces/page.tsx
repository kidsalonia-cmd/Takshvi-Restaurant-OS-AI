"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Platform = "zomato" | "swiggy" | "petpooja";
type Integration = {
  id?: string;
  platform: Platform;
  location_id: string;
  brand_id: string;
  merchant_id: string;
  outlet_id: string;
  external_store_name: string;
  integration_mode: string;
  connection_method: "report_upload" | "official_api" | "webhook" | "partner_connector";
  status: string;
  credential_status: "not_provided" | "pending" | "verified" | "invalid";
  api_base_url?: string | null;
  webhook_url?: string | null;
  auto_accept_orders: boolean;
  auto_print_kot: boolean;
  sync_menu: boolean;
  sync_inventory: boolean;
  sync_payouts: boolean;
  last_order_sync_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
};

function cfg() {
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

function blank(platform: Platform, location_id = "", brand_id = ""): Integration {
  return {
    platform,
    location_id,
    brand_id,
    merchant_id: "",
    outlet_id: "",
    external_store_name: "",
    integration_mode: "report_upload",
    connection_method: "report_upload",
    status: "not_connected",
    credential_status: "not_provided",
    api_base_url: "",
    webhook_url: "",
    auto_accept_orders: false,
    auto_print_kot: false,
    sync_menu: true,
    sync_inventory: true,
    sync_payouts: true,
  };
}

export default function MarketplaceIntegrationsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [form, setForm] = useState<Integration>(blank("zomato"));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const { url, key } = cfg();
      const companyRes = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, {
        headers: headers(key),
        cache: "no-store",
      });
      if (!companyRes.ok) throw new Error(await companyRes.text());
      const companies = (await companyRes.json()) as Company[];
      if (!companies[0]) throw new Error("Create company first.");
      setCompany(companies[0]);

      const [locationRes, brandRes, integrationRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?company_id=eq.${companies[0].id}&is_active=eq.true&select=id,name,code&order=name.asc`, {
          headers: headers(key),
          cache: "no-store",
        }),
        fetch(`${url}/rest/v1/brands?company_id=eq.${companies[0].id}&is_active=eq.true&select=id,name,location_id&order=name.asc`, {
          headers: headers(key),
          cache: "no-store",
        }),
        fetch(`${url}/rest/v1/marketplace_integrations?company_id=eq.${companies[0].id}&select=*&order=platform.asc`, {
          headers: headers(key),
          cache: "no-store",
        }),
      ]);

      if (!locationRes.ok || !brandRes.ok || !integrationRes.ok) {
        throw new Error("Unable to load integration setup.");
      }

      const loadedLocations = (await locationRes.json()) as Location[];
      setLocations(loadedLocations);
      setBrands(await brandRes.json());
      setIntegrations(await integrationRes.json());
      setForm(blank("zomato", loadedLocations[0]?.id || "", ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load integrations.");
    }
  }

  const visibleBrands = useMemo(
    () => brands.filter((brand) => brand.location_id === form.location_id),
    [brands, form.location_id],
  );

  function edit(integration: Integration) {
    setForm({ ...blank(integration.platform), ...integration });
    setMessage("");
    setError("");
  }

  async function save() {
    if (!company || !form.location_id || !form.brand_id) {
      setError("Select location and brand.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { url, key } = cfg();
      const isReportMode = form.connection_method === "report_upload";
      const payload = {
        company_id: company.id,
        ...form,
        integration_mode: form.connection_method,
        status: isReportMode ? "connected" : form.status,
        credential_status: isReportMode ? "verified" : form.credential_status,
        updated_at: new Date().toISOString(),
      };

      const response = await fetch(
        `${url}/rest/v1/marketplace_integrations?on_conflict=platform,location_id,brand_id`,
        {
          method: "POST",
          headers: headers(key, "resolution=merge-duplicates,return=representation"),
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) throw new Error(await response.text());
      const saved = ((await response.json()) as Integration[])[0];
      setIntegrations((current) => [
        ...current.filter(
          (item) =>
            !(item.platform === saved.platform &&
              item.location_id === saved.location_id &&
              item.brand_id === saved.brand_id),
        ),
        saved,
      ]);
      setForm(blank(form.platform, form.location_id, ""));
      setMessage(
        isReportMode
          ? "Connected to the dashboard through report uploads. Live API sync will require official credentials."
          : "Connector settings saved. Add official credentials on the server before enabling live sync.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save integration.");
    } finally {
      setSaving(false);
    }
  }

  const connected = integrations.filter((item) => item.status === "connected").length;
  const reportConnected = integrations.filter((item) => item.connection_method === "report_upload").length;
  const liveConnected = integrations.filter(
    (item) => item.connection_method !== "report_upload" && item.status === "connected" && item.credential_status === "verified",
  ).length;

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Marketplace Control</p>
          <h1 className="mt-2 text-3xl font-black">Zomato, Swiggy & Petpooja Connectors</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            Connect every outlet to the Marketplace Dashboard through report uploads now, and switch to official API or webhook sync when credentials are approved.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/marketplace" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Upload Reports</Link>
            <Link href="/marketplace/outlets" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Outlet Analysis</Link>
            <Link href="/orders" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-black">Unified Orders</Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Card title="Configured connectors" value={String(integrations.length)} />
          <Card title="Dashboard connected" value={String(connected)} />
          <Card title="Report-upload mode" value={String(reportConnected)} />
          <Card title="Live API connected" value={String(liveConnected)} warning={liveConnected === 0} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Add or update connector</h2>
            <div className="mt-5 grid gap-3">
              <select
                value={form.platform}
                onChange={(event) => setForm(blank(event.target.value as Platform, form.location_id, form.brand_id))}
                className="h-12 rounded-xl border px-4"
              >
                <option value="zomato">Zomato</option>
                <option value="swiggy">Swiggy</option>
                <option value="petpooja">Petpooja</option>
              </select>

              <select
                value={form.location_id}
                onChange={(event) => setForm({ ...form, location_id: event.target.value, brand_id: "" })}
                className="h-12 rounded-xl border px-4"
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name} ({location.code})</option>
                ))}
              </select>

              <select
                value={form.brand_id}
                onChange={(event) => setForm({ ...form, brand_id: event.target.value })}
                className="h-12 rounded-xl border px-4"
              >
                <option value="">Select brand</option>
                {visibleBrands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>

              <select
                value={form.connection_method}
                onChange={(event) => {
                  const method = event.target.value as Integration["connection_method"];
                  setForm({
                    ...form,
                    connection_method: method,
                    integration_mode: method,
                    status: method === "report_upload" ? "connected" : "pending",
                    credential_status: method === "report_upload" ? "verified" : "pending",
                  });
                }}
                className="h-12 rounded-xl border px-4"
              >
                <option value="report_upload">Report Upload Connection</option>
                <option value="official_api">Official API</option>
                <option value="webhook">Webhook</option>
                <option value="partner_connector">Approved Partner Connector</option>
              </select>

              <input value={form.external_store_name} onChange={(e) => setForm({ ...form, external_store_name: e.target.value })} placeholder="Platform store name" className="h-12 rounded-xl border px-4" />
              <input value={form.merchant_id} onChange={(e) => setForm({ ...form, merchant_id: e.target.value })} placeholder="Merchant / Client ID" className="h-12 rounded-xl border px-4" />
              <input value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })} placeholder="Outlet / Restaurant ID" className="h-12 rounded-xl border px-4" />

              {form.connection_method !== "report_upload" ? (
                <>
                  <input value={form.api_base_url || ""} onChange={(e) => setForm({ ...form, api_base_url: e.target.value })} placeholder="Official API base URL" className="h-12 rounded-xl border px-4" />
                  <input value={form.webhook_url || ""} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} placeholder="Webhook URL" className="h-12 rounded-xl border px-4" />
                  <select value={form.credential_status} onChange={(e) => setForm({ ...form, credential_status: e.target.value as Integration["credential_status"] })} className="h-12 rounded-xl border px-4">
                    <option value="not_provided">Credentials not provided</option>
                    <option value="pending">Credentials pending</option>
                    <option value="verified">Credentials verified</option>
                    <option value="invalid">Credentials invalid</option>
                  </select>
                </>
              ) : null}

              {[
                ["auto_accept_orders", "Auto accept orders"],
                ["auto_print_kot", "Auto print KOT"],
                ["sync_menu", "Sync menu"],
                ["sync_inventory", "Sync stock availability"],
                ["sync_payouts", "Sync payouts"],
              ].map(([keyName, label]) => (
                <label key={keyName} className="flex items-center gap-3 rounded-xl border p-3">
                  <input
                    type="checkbox"
                    checked={Boolean(form[keyName as keyof Integration])}
                    onChange={(event) => setForm({ ...form, [keyName]: event.target.checked })}
                  />
                  <span className="font-bold">{label}</span>
                </label>
              ))}

              <button onClick={() => void save()} disabled={saving} className="h-12 rounded-xl bg-slate-950 font-black text-white disabled:opacity-50">
                {saving ? "Saving..." : "Connect to Dashboard"}
              </button>
            </div>

            {message ? <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</p> : null}
            {error ? <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Connected outlet mappings</h2>
            <div className="mt-5 space-y-3">
              {integrations.map((integration, index) => {
                const location = locations.find((item) => item.id === integration.location_id);
                const brand = brands.find((item) => item.id === integration.brand_id);
                const live = integration.connection_method !== "report_upload";
                return (
                  <button
                    key={`${integration.platform}-${integration.location_id}-${integration.brand_id}-${index}`}
                    onClick={() => edit(integration)}
                    className="flex w-full flex-col gap-3 rounded-2xl border p-5 text-left md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">{integration.platform.toUpperCase()}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${integration.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {integration.status.replaceAll("_", " ")}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                          {live ? integration.connection_method.replaceAll("_", " ") : "report upload"}
                        </span>
                      </div>
                      <p className="mt-2 font-black">{brand?.name || "Unknown brand"} · {location?.name || "Unknown location"}</p>
                      <p className="mt-1 text-sm text-slate-500">{integration.external_store_name || "Store name not added"} · Outlet ID {integration.outlet_id || "pending"}</p>
                    </div>
                    <div className="text-sm text-slate-500">
                      <p>Menu sync: <b>{integration.sync_menu ? "On" : "Off"}</b></p>
                      <p>Payout sync: <b>{integration.sync_payouts ? "On" : "Off"}</b></p>
                      <p>Credentials: <b>{integration.credential_status?.replaceAll("_", " ") || "not provided"}</b></p>
                    </div>
                  </button>
                );
              })}
              {!integrations.length ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No connector configured yet.</p> : null}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <b>Current working connection:</b> report-upload mode connects Zomato, Swiggy and Petpooja data to the dashboard immediately. Live orders, menu publishing and automatic payout sync will activate only after official API, webhook or approved partner credentials are provided.
        </section>
      </div>
    </main>
  );
}

function Card({ title, value, warning = false }: { title: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 shadow-sm ${warning ? "bg-amber-50" : "bg-white"}`}>
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
