"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type SlotKey = "zomato_payout" | "swiggy_payout" | "petpooja_orders" | "petpooja_items" | "petpooja_sales" | "other_report";
type SlotStatus = "pending" | "uploaded" | "not_applicable";
type Summary = { rows: number; orders: number; sales: number; payout: number; discount: number; commission: number; aov: number; payoutRatio: number };
type UploadResult = { success: boolean; message?: string; marketplace?: string; reportType?: string; restaurantName?: string | null; periodStart?: string; periodEnd?: string; summary?: Summary };
type SlotConfig = { title: string; note: string; badge: string; locationLevel?: boolean };

const SLOT_CONFIG: Record<SlotKey, SlotConfig> = {
  zomato_payout: { title: "Zomato Payout Reports", note: "Weekly settlement, payout and deduction reports", badge: "ZOMATO" },
  swiggy_payout: { title: "Swiggy Payout Reports", note: "Weekly settlement, payout and deduction reports", badge: "SWIGGY" },
  petpooja_orders: { title: "Petpooja Order Details", note: "Customer order detail report for online channel analysis", badge: "PETPOOJA" },
  petpooja_items: { title: "Petpooja Consolidated Item Report", note: "Location-wise consolidated item and brand sales report", badge: "LOCATION REPORT", locationLevel: true },
  petpooja_sales: { title: "Petpooja Sales Reports", note: "Daily sales, payment, GST and category reports", badge: "PETPOOJA" },
  other_report: { title: "Other Marketplace Reports", note: "Additional Zomato, Swiggy or marketplace reports", badge: "OTHER" },
};
const SLOT_KEYS = Object.keys(SLOT_CONFIG) as SlotKey[];
const LOCATION_SLOT: SlotKey = "petpooja_items";

function freshStatuses(): Record<SlotKey, SlotStatus> {
  return SLOT_KEYS.reduce((acc, slot) => ({ ...acc, [slot]: "pending" }), {} as Record<SlotKey, SlotStatus>);
}
function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}
function headers(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }
function money(value = 0) { return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }
function isoDate(date: Date) { return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function currentWeek() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: isoDate(monday), end: isoDate(sunday) };
}
function acceptedFiles(files: FileList | File[]) { return Array.from(files).filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name)); }

export default function MarketplacePage() {
  const week = currentWeek();
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [periodStart, setPeriodStart] = useState(week.start);
  const [periodEnd, setPeriodEnd] = useState(week.end);
  const [files, setFiles] = useState<Partial<Record<SlotKey, File[]>>>({});
  const [statuses, setStatuses] = useState<Record<SlotKey, SlotStatus>>(freshStatuses());
  const [inputKeys, setInputKeys] = useState<Record<SlotKey, number>>(SLOT_KEYS.reduce((acc, slot) => ({ ...acc, [slot]: 0 }), {} as Record<SlotKey, number>));
  const [draggingSlot, setDraggingSlot] = useState<SlotKey | null>(null);
  const [busySlot, setBusySlot] = useState<SlotKey | null>(null);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { void loadMasters(); }, []);
  const visibleBrands = useMemo(() => brands.filter((brand) => !locationId || brand.location_id === locationId), [brands, locationId]);
  const visibleSlots = useMemo<SlotKey[]>(() => !locationId ? [] : !brandId ? [LOCATION_SLOT] : SLOT_KEYS, [locationId, brandId]);
  const storageKey = useMemo(() => !locationId ? "" : `${locationId}:${brandId || "location"}:${periodStart}:${periodEnd}`, [locationId, brandId, periodStart, periodEnd]);

  useEffect(() => {
    if (!storageKey) return setStatuses(freshStatuses());
    try {
      const saved = localStorage.getItem(`marketplace-report-status:${storageKey}`);
      setStatuses(saved ? { ...freshStatuses(), ...(JSON.parse(saved).statuses || {}) } : freshStatuses());
    } catch { setStatuses(freshStatuses()); }
  }, [storageKey]);
  useEffect(() => {
    if (storageKey) localStorage.setItem(`marketplace-report-status:${storageKey}`, JSON.stringify({ statuses }));
  }, [statuses, storageKey]);

  async function loadMasters() {
    try {
      const { url, key } = config();
      const [locationRes, brandRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      setLocations(await locationRes.json());
      setBrands(await brandRes.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load setup data."); }
  }

  function chooseFiles(slot: SlotKey, selected: File[]) {
    const valid = acceptedFiles(selected);
    if (!valid.length) return setMessage("Only XLSX, XLS and CSV reports are supported.");
    setFiles((current) => ({ ...current, [slot]: valid }));
    setStatuses((current) => ({ ...current, [slot]: "pending" }));
    setMessage("");
  }
  function handleDrop(event: DragEvent<HTMLLabelElement>, slot: SlotKey) {
    event.preventDefault();
    setDraggingSlot(null);
    chooseFiles(slot, Array.from(event.dataTransfer.files));
  }

  async function upload(slot: SlotKey) {
    const selectedFiles = files[slot] || [];
    const locationLevel = Boolean(SLOT_CONFIG[slot].locationLevel);
    if (!locationId) return setMessage("Select location first.");
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setMessage("Select a valid week.");
    if (!locationLevel && !brandId) return setMessage("Select brand first.");
    if (!selectedFiles.length) return setMessage("Attach at least one report file.");
    setBusySlot(slot);
    setMessage("");
    let completed = 0;
    const failed: string[] = [];
    let latest: UploadResult | null = null;
    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("locationId", locationId);
        formData.append("brandId", locationLevel ? "" : brandId);
        formData.append("uploadSlot", slot);
        formData.append("periodStart", periodStart);
        formData.append("periodEnd", periodEnd);
        const response = await fetch("/api/marketplace/upload", { method: "POST", body: formData });
        const data = await response.json() as UploadResult;
        if (!response.ok || !data.success) failed.push(`${file.name}: ${data.message || "Upload failed"}`);
        else { completed += 1; latest = data; }
      }
      if (latest) setResult(latest);
      if (completed) {
        setFiles((current) => ({ ...current, [slot]: [] }));
        setInputKeys((current) => ({ ...current, [slot]: current[slot] + 1 }));
        setStatuses((current) => ({ ...current, [slot]: "uploaded" }));
      }
      setMessage(failed.length ? `${completed} saved. ${failed.join(" | ")}` : `${completed} report${completed === 1 ? "" : "s"} uploaded and analysed.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to process reports."); }
    finally { setBusySlot(null); }
  }

  async function clearWeekData() {
    if (!locationId || !periodStart || !periodEnd) return setMessage("Select location and week first.");
    if (!confirm(`Clear saved data for ${periodStart} to ${periodEnd}?`)) return;
    setClearing(true);
    try {
      const response = await fetch("/api/marketplace/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId, brandId, periodStart, periodEnd }) });
      const data = await response.json() as { success: boolean; message?: string };
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to clear data.");
      if (storageKey) localStorage.removeItem(`marketplace-report-status:${storageKey}`);
      setStatuses(freshStatuses()); setFiles({}); setResult(null);
      setInputKeys(SLOT_KEYS.reduce((acc, slot) => ({ ...acc, [slot]: Date.now() }), {} as Record<SlotKey, number>));
      setMessage(data.message || "Selected week data cleared.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to clear data."); }
    finally { setClearing(false); }
  }

  const resolvedCount = visibleSlots.filter((slot) => statuses[slot] !== "pending").length;

  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7"><div className="mx-auto max-w-[1800px] space-y-5">
    <header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black">Marketplace Report Center</h1><p className="mt-2 text-sm text-slate-300">Upload reports and review the detailed result at the top.</p></div><div className="flex gap-2"><Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link><Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link></div></div></header>

    <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-6">
      <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setBrandId(""); setFiles({}); setResult(null); }} className="h-12 rounded-xl border px-3"><option value="">Select location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select>
      <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setFiles({}); setResult(null); }} disabled={!locationId} className="h-12 rounded-xl border px-3 disabled:bg-slate-100"><option value="">Location-level Petpooja</option>{visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
      <label className="text-xs font-bold text-slate-500">Week start<input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setResult(null); }} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label>
      <label className="text-xs font-bold text-slate-500">Week end<input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setResult(null); }} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label>
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{resolvedCount}/{visibleSlots.length}</b> reports completed</div>
      <button onClick={() => void clearWeekData()} disabled={clearing || !locationId} className="h-12 rounded-xl bg-red-50 px-4 font-black text-red-700 disabled:opacity-50">{clearing ? "Clearing..." : "Clear Week Data"}</button>
    </section>

    <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="flex items-center justify-between bg-slate-950 px-6 py-5 text-white"><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-400">Detailed Report</p><h2 className="mt-1 text-2xl font-black">Latest Uploaded Report</h2></div>{result?.summary ? <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">LIVE</span> : null}</div>
      <div className="overflow-x-auto">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Restaurant name</th><th className="px-5 py-4">Platform</th><th className="px-5 py-4">Sales</th><th className="px-5 py-4">Orders</th><th className="px-5 py-4">Payout</th><th className="px-5 py-4">AOV</th><th className="px-5 py-4">Payout %</th><th className="px-5 py-4">Discount</th><th className="px-5 py-4">Commission</th><th className="px-5 py-4">Week</th></tr></thead>
          <tbody>{result?.summary ? <tr className="border-t"><td className="px-5 py-5 font-black">{result.restaurantName || "Restaurant not detected"}</td><td className="px-5 py-5 font-bold uppercase">{result.marketplace || "Unknown"}</td><td className="px-5 py-5 font-black">{money(result.summary.sales)}</td><td className="px-5 py-5 font-black">{result.summary.orders}</td><td className="px-5 py-5 font-black">{money(result.summary.payout)}</td><td className="px-5 py-5 font-black">{money(result.summary.aov)}</td><td className="px-5 py-5 font-black">{result.summary.payoutRatio.toFixed(1)}%</td><td className="px-5 py-5 font-black">{money(result.summary.discount)}</td><td className="px-5 py-5 font-black">{money(result.summary.commission)}</td><td className="px-5 py-5 font-bold">{result.periodStart || periodStart}<br />to {result.periodEnd || periodEnd}</td></tr> : <tr><td colSpan={10} className="px-6 py-10 text-center text-slate-500">Upload and save a report. The detailed result will appear here immediately.</td></tr>}</tbody>
        </table>
      </div>
    </section>

    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visibleSlots.map((slot) => {
      const selectedFiles = files[slot] || []; const status = statuses[slot]; const cfg = SLOT_CONFIG[slot];
      return <article key={slot} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{cfg.title}</h2><p className="mt-1 text-sm text-slate-500">{cfg.note}</p><p className="mt-3 text-xs font-bold text-emerald-700">Week: {periodStart} to {periodEnd}</p></div><div className="text-right"><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600">{cfg.badge}</span><p className={`mt-2 text-xs font-black ${status === "uploaded" ? "text-emerald-700" : status === "not_applicable" ? "text-slate-500" : "text-amber-700"}`}>{status === "uploaded" ? "Uploaded" : status === "not_applicable" ? "Not applicable" : "Pending"}</p></div></div>
        <label onDragEnter={(e) => { e.preventDefault(); setDraggingSlot(slot); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDraggingSlot(null)} onDrop={(e) => handleDrop(e, slot)} className={`mt-4 block cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center ${draggingSlot === slot ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}><span className="block text-3xl">⇧</span><span className="mt-2 block text-sm font-black">Drag & drop reports here</span><span className="mt-1 block text-xs text-slate-500">or click to browse · XLSX, XLS or CSV</span><input key={`${slot}-${inputKeys[slot]}`} type="file" multiple accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => chooseFiles(slot, Array.from(e.target.files || []))} /></label>
        <div className="mt-3 min-h-20 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{selectedFiles.length ? selectedFiles.map((file) => <p key={`${file.name}-${file.lastModified}`} className="truncate">• {file.name}</p>) : status === "uploaded" ? "Saved successfully. Upload area is clear." : "No report attached."}</div>
        <button type="button" onClick={() => void upload(slot)} disabled={busySlot !== null || !selectedFiles.length} className="mt-3 h-11 w-full rounded-xl bg-slate-950 font-black text-white disabled:opacity-50">{busySlot === slot ? "Saving and analysing..." : `Save Uploaded Reports (${selectedFiles.length})`}</button>
        <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setStatuses((current) => ({ ...current, [slot]: "not_applicable" }))} className="h-10 rounded-xl border font-bold">Not Applicable</button><button onClick={() => setStatuses((current) => ({ ...current, [slot]: "pending" }))} className="h-10 rounded-xl border font-bold">Reset Pending</button></div>
      </article>;
    })}</section>

    {message ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p> : null}
  </div></main>;
}
