"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type SlotKey = "petpooja_orders" | "petpooja_items" | "zomato_payout" | "swiggy_payout";
type SlotStatus = "pending" | "uploaded" | "not_applicable";
type Summary = { rows: number; orders: number; sales: number; payout: number; discount: number; commission: number; aov: number; payoutRatio: number };
type UploadResult = { success: boolean; message?: string; marketplace?: string; reportType?: string; restaurantName?: string | null; periodStart?: string; periodEnd?: string; summary?: Summary };
type SlotConfig = { title: string; platform: string; level: "Location" | "Brand"; note: string };

const SLOT_CONFIG: Record<SlotKey, SlotConfig> = {
  petpooja_orders: { title: "Petpooja Consolidated Order Report", platform: "PETPOOJA", level: "Location", note: "Upload once per location and week" },
  petpooja_items: { title: "Petpooja Consolidated Item Report", platform: "PETPOOJA", level: "Location", note: "Upload once per location and week" },
  zomato_payout: { title: "Zomato Payout Report", platform: "ZOMATO", level: "Brand", note: "Upload once per brand and week" },
  swiggy_payout: { title: "Swiggy Payout Report", platform: "SWIGGY", level: "Brand", note: "Upload once per brand and week" },
};

const SLOT_KEYS = Object.keys(SLOT_CONFIG) as SlotKey[];

function blankStatuses(): Record<SlotKey, SlotStatus> {
  return SLOT_KEYS.reduce((acc, slot) => ({ ...acc, [slot]: "pending" }), {} as Record<SlotKey, SlotStatus>);
}

function currentWeek() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return { start: iso(monday), end: iso(sunday) };
}

function money(value = 0) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function accepted(files: FileList | File[]) {
  return Array.from(files).filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name));
}

export default function MarketplacePage() {
  const week = currentWeek();
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [periodStart, setPeriodStart] = useState(week.start);
  const [periodEnd, setPeriodEnd] = useState(week.end);
  const [files, setFiles] = useState<Partial<Record<SlotKey, File[]>>>({});
  const [statuses, setStatuses] = useState<Record<SlotKey, SlotStatus>>(blankStatuses());
  const [inputKeys, setInputKeys] = useState<Record<SlotKey, number>>(SLOT_KEYS.reduce((a, s) => ({ ...a, [s]: 0 }), {} as Record<SlotKey, number>));
  const [dragging, setDragging] = useState<SlotKey | null>(null);
  const [busy, setBusy] = useState<SlotKey | null>(null);
  const [clearing, setClearing] = useState(false);
  const [results, setResults] = useState<Partial<Record<SlotKey, UploadResult>>>({});
  const [message, setMessage] = useState("");

  const visibleBrands = useMemo(() => brands.filter((b) => b.location_id === locationId), [brands, locationId]);
  const visibleSlots = useMemo(() => SLOT_KEYS.filter((slot) => SLOT_CONFIG[slot].level === "Location" || Boolean(brandId)), [brandId]);
  const statusKey = useMemo(() => locationId ? `marketplace-table:${locationId}:${brandId || "location"}:${periodStart}:${periodEnd}` : "", [locationId, brandId, periodStart, periodEnd]);

  useEffect(() => { void loadMasters(); }, []);

  useEffect(() => {
    if (!statusKey) return setStatuses(blankStatuses());
    const saved = localStorage.getItem(statusKey);
    if (!saved) return setStatuses(blankStatuses());
    try { setStatuses({ ...blankStatuses(), ...JSON.parse(saved) }); } catch { setStatuses(blankStatuses()); }
  }, [statusKey]);

  useEffect(() => {
    if (statusKey) localStorage.setItem(statusKey, JSON.stringify(statuses));
  }, [statusKey, statuses]);

  async function loadMasters() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Supabase environment variables are missing.");
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const [locationsResponse, brandsResponse] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
      ]);
      if (!locationsResponse.ok) throw new Error(await locationsResponse.text());
      if (!brandsResponse.ok) throw new Error(await brandsResponse.text());
      setLocations(await locationsResponse.json());
      setBrands(await brandsResponse.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load locations and brands.");
    }
  }

  function chooseFiles(slot: SlotKey, selected: File[]) {
    const valid = accepted(selected);
    if (!valid.length) return setMessage("Only XLSX, XLS and CSV files are supported.");
    setFiles((current) => ({ ...current, [slot]: valid }));
    setStatuses((current) => ({ ...current, [slot]: "pending" }));
    setMessage("");
  }

  function dropFile(event: DragEvent<HTMLLabelElement>, slot: SlotKey) {
    event.preventDefault();
    setDragging(null);
    chooseFiles(slot, Array.from(event.dataTransfer.files));
  }

  async function upload(slot: SlotKey) {
    const selected = files[slot] || [];
    const isLocationLevel = SLOT_CONFIG[slot].level === "Location";
    if (!locationId) return setMessage("Select a location first.");
    if (!isLocationLevel && !brandId) return setMessage("Select a brand for Zomato or Swiggy reports.");
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setMessage("Select a valid week.");
    if (!selected.length) return setMessage("Attach at least one file.");

    setBusy(slot);
    setMessage("");
    let latest: UploadResult | null = null;
    const failures: string[] = [];

    try {
      for (const file of selected) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("locationId", locationId);
        formData.append("brandId", isLocationLevel ? "" : brandId);
        formData.append("uploadSlot", slot);
        formData.append("periodStart", periodStart);
        formData.append("periodEnd", periodEnd);
        const response = await fetch("/api/marketplace/upload", { method: "POST", body: formData });
        const data = await response.json() as UploadResult;
        if (!response.ok || !data.success) failures.push(`${file.name}: ${data.message || "Upload failed"}`);
        else latest = data;
      }

      if (latest) {
        setResults((current) => ({ ...current, [slot]: latest! }));
        setStatuses((current) => ({ ...current, [slot]: "uploaded" }));
        setFiles((current) => ({ ...current, [slot]: [] }));
        setInputKeys((current) => ({ ...current, [slot]: current[slot] + 1 }));
      }
      setMessage(failures.length ? failures.join(" | ") : `${SLOT_CONFIG[slot].title} uploaded and analysed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload report.");
    } finally {
      setBusy(null);
    }
  }

  async function clearWeek() {
    if (!locationId) return setMessage("Select a location first.");
    if (!confirm(`Clear saved data for ${periodStart} to ${periodEnd}?`)) return;
    setClearing(true);
    try {
      const response = await fetch("/api/marketplace/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, brandId, periodStart, periodEnd }),
      });
      const data = await response.json() as { success: boolean; message?: string };
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to clear data.");
      if (statusKey) localStorage.removeItem(statusKey);
      setStatuses(blankStatuses());
      setFiles({});
      setResults({});
      setInputKeys(SLOT_KEYS.reduce((a, s) => ({ ...a, [s]: Date.now() }), {} as Record<SlotKey, number>));
      setMessage(data.message || "Week data cleared.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to clear week data.");
    } finally {
      setClearing(false);
    }
  }

  const analysedRows = visibleSlots.map((slot) => ({ slot, result: results[slot] })).filter((row) => row.result?.summary);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><h1 className="text-3xl font-black">Marketplace Weekly Upload Center</h1><p className="mt-2 text-sm text-slate-300">Petpooja is uploaded once per location. Zomato and Swiggy are uploaded brand-wise.</p></div>
            <div className="flex gap-2"><Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link><Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link></div>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-6">
          <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setBrandId(""); setResults({}); }} className="h-12 rounded-xl border px-3"><option value="">Select location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}</select>
          <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setResults({}); }} disabled={!locationId} className="h-12 rounded-xl border px-3 disabled:bg-slate-100"><option value="">Select brand for Zomato/Swiggy</option>{visibleBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <label className="text-xs font-bold text-slate-500">Week start<input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setResults({}); }} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label>
          <label className="text-xs font-bold text-slate-500">Week end<input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setResults({}); }} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{visibleSlots.filter((s) => statuses[s] !== "pending").length}/{visibleSlots.length}</b> reports completed</div>
          <button onClick={() => void clearWeek()} disabled={clearing || !locationId} className="h-12 rounded-xl bg-red-50 px-4 font-black text-red-700 disabled:opacity-50">{clearing ? "Clearing..." : "Clear Week Data"}</button>
        </section>

        <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="text-xl font-black">Weekly report uploads</h2><p className="mt-1 text-sm text-slate-500">Drag files directly into the correct row and save.</p></div>
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-slate-950 text-white"><tr><th className="p-4">Report</th><th className="p-4">Level</th><th className="p-4">Status</th><th className="p-4">Attach file</th><th className="p-4">Selected file</th><th className="p-4">Action</th></tr></thead>
              <tbody>
                {visibleSlots.map((slot) => {
                  const cfg = SLOT_CONFIG[slot];
                  const selected = files[slot] || [];
                  const disabled = cfg.level === "Brand" && !brandId;
                  return <tr key={slot} className="border-b align-middle last:border-0">
                    <td className="p-4"><p className="font-black">{cfg.title}</p><p className="mt-1 text-xs text-slate-500">{cfg.note}</p></td>
                    <td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${cfg.level === "Location" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>{cfg.level}</span></td>
                    <td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${statuses[slot] === "uploaded" ? "bg-emerald-100 text-emerald-700" : statuses[slot] === "not_applicable" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700"}`}>{statuses[slot] === "uploaded" ? "Uploaded" : statuses[slot] === "not_applicable" ? "Not Applicable" : "Pending"}</span></td>
                    <td className="p-4">
                      <label onDragEnter={(e) => { e.preventDefault(); setDragging(slot); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(null)} onDrop={(e) => dropFile(e, slot)} className={`block min-w-56 cursor-pointer rounded-xl border-2 border-dashed p-3 text-center text-xs font-bold ${dragging === slot ? "border-emerald-500 bg-emerald-50" : "border-slate-300"} ${disabled ? "pointer-events-none opacity-40" : ""}`}>
                        Drop file or click to browse
                        <input key={`${slot}-${inputKeys[slot]}`} type="file" multiple accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => chooseFiles(slot, Array.from(e.target.files || []))} />
                      </label>
                    </td>
                    <td className="max-w-72 p-4">{selected.length ? selected.map((f) => <p key={`${f.name}-${f.lastModified}`} className="truncate text-xs">{f.name}</p>) : statuses[slot] === "uploaded" ? <span className="text-xs font-bold text-emerald-700">Saved and ready for analysis</span> : <span className="text-xs text-slate-400">No file selected</span>}</td>
                    <td className="p-4"><div className="flex gap-2"><button onClick={() => void upload(slot)} disabled={busy !== null || !selected.length || disabled} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy === slot ? "Saving..." : "Save & Analyse"}</button><button onClick={() => setStatuses((c) => ({ ...c, [slot]: "not_applicable" }))} className="rounded-lg border px-3 py-2 text-xs font-bold">N/A</button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="text-xl font-black">Detailed live analysis</h2><p className="mt-1 text-sm text-slate-500">Latest uploaded report results appear here immediately.</p></div>
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-emerald-500 text-slate-950"><tr>{["Restaurant","Platform","Sales","Orders","Payout","AOV","Payout %","Discount","Commission","Week"].map((h) => <th key={h} className="p-4 font-black">{h}</th>)}</tr></thead>
              <tbody>
                {analysedRows.length ? analysedRows.map(({ slot, result }) => <tr key={slot} className="border-b last:border-0"><td className="p-4 font-bold">{result?.restaurantName || "Not detected"}</td><td className="p-4 font-black uppercase">{result?.marketplace || SLOT_CONFIG[slot].platform}</td><td className="p-4">{money(result?.summary?.sales)}</td><td className="p-4">{result?.summary?.orders || 0}</td><td className="p-4">{money(result?.summary?.payout)}</td><td className="p-4">{money(result?.summary?.aov)}</td><td className="p-4">{(result?.summary?.payoutRatio || 0).toFixed(1)}%</td><td className="p-4">{money(result?.summary?.discount)}</td><td className="p-4">{money(result?.summary?.commission)}</td><td className="p-4 whitespace-nowrap">{result?.periodStart || periodStart} to {result?.periodEnd || periodEnd}</td></tr>) : <tr><td colSpan={10} className="p-8 text-center text-slate-500">Upload and analyse a report to populate this table.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {message ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p> : null}
      </div>
    </main>
  );
}
