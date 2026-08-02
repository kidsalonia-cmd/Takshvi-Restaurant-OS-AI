"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type SlotKey = "zomato_settlement" | "swiggy_settlement" | "online_orders" | "item_report";
type UploadResult = {
  success: boolean;
  message?: string;
  marketplace?: string;
  reportType?: string;
  restaurantName?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  summary?: {
    rows: number;
    orders: number;
    sales: number;
    payout: number;
    discount: number;
    commission: number;
    tax: number;
    packaging: number;
    aov: number;
    payoutRatio: number;
  };
  topItems?: { item: string; quantity: number; sales: number }[];
};

const SLOT_CONFIG: Record<SlotKey, { title: string; note: string; accept: string }> = {
  zomato_settlement: {
    title: "Zomato Settlement",
    note: "Weekly settlement or payout report",
    accept: ".xlsx,.xls,.csv",
  },
  swiggy_settlement: {
    title: "Swiggy Settlement",
    note: "Weekly settlement or payout report",
    accept: ".xlsx,.xls,.csv",
  },
  online_orders: {
    title: "Online Order Details",
    note: "Petpooja order detail filtered for Zomato/Swiggy",
    accept: ".xlsx,.xls,.csv",
  },
  item_report: {
    title: "Online Item Report",
    note: "Item-wise online sales report",
    accept: ".xlsx,.xls,.csv",
  },
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function authHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function money(value = 0) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function MarketplacePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [busySlot, setBusySlot] = useState<SlotKey | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadMasters();
  }, []);

  async function loadMasters() {
    try {
      const { url, key } = config();
      const [locationRes, brandRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers: authHeaders(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: authHeaders(key), cache: "no-store" }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      setLocations(await locationRes.json());
      setBrands(await brandRes.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load location and brand data.");
    }
  }

  const visibleBrands = useMemo(
    () => brands.filter((brand) => !locationId || brand.location_id === locationId),
    [brands, locationId],
  );

  async function upload(slot: SlotKey) {
    const file = files[slot];
    if (!locationId || !brandId) return setMessage("Select location and brand first.");
    if (!file) return setMessage(`Choose the ${SLOT_CONFIG[slot].title} file first.`);

    setBusySlot(slot);
    setMessage("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("locationId", locationId);
      formData.append("brandId", brandId);
      formData.append("uploadSlot", slot);

      const response = await fetch("/api/marketplace/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadResult;
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to process report.");

      setResult(data);
      setMessage(`${SLOT_CONFIG[slot].title} analysed and saved successfully.`);
      setFiles((current) => ({ ...current, [slot]: undefined }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process report.");
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Marketplace Intelligence</h1>
              <p className="mt-2 text-sm text-slate-300">Upload Zomato, Swiggy and online order reports separately for correct analysis.</p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link>
              <Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setBrandId(""); }} className="h-12 rounded-xl border px-3">
            <option value="">Select location</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
          </select>
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="h-12 rounded-xl border px-3">
            <option value="">Select brand</option>
            {visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{locations.length}</b> active locations</div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{visibleBrands.length}</b> matching brands</div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(SLOT_CONFIG) as SlotKey[]).map((slot) => {
            const selected = files[slot];
            const config = SLOT_CONFIG[slot];
            return (
              <article key={slot} className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">{config.title}</h2>
                <p className="mt-1 min-h-10 text-sm text-slate-500">{config.note}</p>
                <label className="mt-4 block rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center hover:border-emerald-500">
                  <span className="block text-sm font-black">Choose file</span>
                  <span className="mt-1 block text-xs text-slate-500">XLSX, XLS or CSV</span>
                  <input
                    type="file"
                    accept={config.accept}
                    className="mt-4 block w-full text-xs"
                    onChange={(event) => {
                      const selectedFile = event.target.files?.[0];
                      setFiles((current) => ({ ...current, [slot]: selectedFile }));
                      setMessage("");
                    }}
                  />
                </label>
                <div className="mt-3 min-h-14 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  {selected ? <><b>{selected.name}</b><br />{(selected.size / 1024 / 1024).toFixed(2)} MB</> : "No file selected"}
                </div>
                <button
                  type="button"
                  onClick={() => void upload(slot)}
                  disabled={busySlot !== null || !selected}
                  className="mt-3 h-11 w-full rounded-xl bg-slate-950 font-black text-white disabled:opacity-50"
                >
                  {busySlot === slot ? "Processing..." : "Upload & Analyse"}
                </button>
              </article>
            );
          })}
        </section>

        {message ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p> : null}

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Latest detected report</h2>
          {result?.summary ? (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <Metric label="Marketplace" value={(result.marketplace || "unknown").toUpperCase()} />
                <Metric label="Report type" value={(result.reportType || "unknown").replaceAll("_", " ")} />
                <Metric label="Restaurant" value={result.restaurantName || "Not detected"} />
                <Metric label="Orders" value={String(result.summary.orders)} />
                <Metric label="Sales" value={money(result.summary.sales)} />
                <Metric label="Payout" value={money(result.summary.payout)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Kpi label="AOV" value={money(result.summary.aov)} />
                <Kpi label="Payout Ratio" value={`${result.summary.payoutRatio.toFixed(1)}%`} />
                <Kpi label="Discount" value={money(result.summary.discount)} />
                <Kpi label="Commission" value={money(result.summary.commission)} />
                <Kpi label="Rows Imported" value={String(result.summary.rows)} />
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Upload any report above to generate the analysis.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 truncate font-black capitalize">{value}</p></div>;
}
