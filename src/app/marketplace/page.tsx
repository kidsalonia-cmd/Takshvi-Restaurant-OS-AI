"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Platform = "Zomato" | "Swiggy" | "Petpooja";
type Status = "pending" | "uploaded" | "not_applicable";
type OutletBreakdown = { outlet: string; platform: string; orders: number; sales: number; payout: number; discount: number; commission: number; aov: number; payoutRatio: number };
type Summary = { rows: number; orders: number; sales: number; payout: number; discount: number; commission: number; aov: number; payoutRatio: number; outlets?: number; excludedOfflineRows?: number; breakdown?: OutletBreakdown[] };
type UploadResult = { success: boolean; message?: string; marketplace?: string; reportType?: string; restaurantName?: string | null; periodStart?: string; periodEnd?: string; summary?: Summary; breakdown?: OutletBreakdown[] };
type UploadRow = { id: string; locationId: string; locationName: string; brandId: string; brandName: string; platform: Platform; slot: "petpooja_orders" | "petpooja_items" | "zomato_payout" | "swiggy_payout"; level: "Location" | "Brand" };
type AnalysisRow = { key: string; locationName: string; restaurant: string; platform: string; periodStart: string; periodEnd: string; summary: OutletBreakdown };

const PLATFORM_BY_BRAND: Record<string, Platform> = {
  "wafflelicious": "Zomato", "takshvi cafe delight": "Zomato", "bowlzaa": "Zomato", "sip and snack cafe": "Zomato", "sip snack cafe": "Zomato", "honeyman": "Zomato", "checkmate cheers": "Zomato", "honeyman 49": "Swiggy", "coffee and chill cafe": "Swiggy", "cafe honey delight": "Swiggy", "cafe honeyman cpfv": "Zomato", "cafe honeyman dhunela": "Swiggy",
};

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").toLowerCase().replace(/\s+/g, " ").trim(); }
function inferPlatform(brandName: string): Platform { return PLATFORM_BY_BRAND[normalize(brandName)] || "Zomato"; }
function currentWeek() {
  const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const iso = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); return { start: iso(monday), end: iso(sunday) };
}
function money(value = 0) { return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }
function validFiles(files: FileList | File[]) { return Array.from(files).filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name)); }

export default function MarketplacePage() {
  const week = currentWeek();
  const [locations, setLocations] = useState<Location[]>([]); const [brands, setBrands] = useState<Brand[]>([]); const [locationId, setLocationId] = useState("");
  const [periodStart, setPeriodStart] = useState(week.start); const [periodEnd, setPeriodEnd] = useState(week.end);
  const [files, setFiles] = useState<Record<string, File | undefined>>({}); const [statuses, setStatuses] = useState<Record<string, Status>>({}); const [results, setResults] = useState<Record<string, UploadResult>>({});
  const [inputKeys, setInputKeys] = useState<Record<string, number>>({}); const [dragging, setDragging] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null); const [clearing, setClearing] = useState(false); const [message, setMessage] = useState("");

  useEffect(() => { void loadMasters(); }, []);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const locationBrands = useMemo(() => brands.filter((brand) => brand.location_id === locationId), [brands, locationId]);
  const rows = useMemo<UploadRow[]>(() => {
    if (!selectedLocation) return [];
    const petpoojaRows: UploadRow[] = [
      { id: `petpooja-orders:${locationId}`, locationId, locationName: selectedLocation.name, brandId: "", brandName: "Consolidated Online Sales", platform: "Petpooja", slot: "petpooja_orders", level: "Location" },
      { id: `petpooja-items:${locationId}`, locationId, locationName: selectedLocation.name, brandId: "", brandName: "Consolidated Item Sales", platform: "Petpooja", slot: "petpooja_items", level: "Location" },
    ];
    const brandRows = locationBrands.map((brand) => {
      const platform = inferPlatform(brand.name);
      return { id: `${platform.toLowerCase()}:${brand.id}`, locationId, locationName: selectedLocation.name, brandId: brand.id, brandName: brand.name, platform, slot: platform === "Swiggy" ? "swiggy_payout" : "zomato_payout", level: "Brand" } as UploadRow;
    });
    return [...petpoojaRows, ...brandRows];
  }, [selectedLocation, locationBrands, locationId]);
  const storageKey = locationId ? `marketplace-matrix:${locationId}:${periodStart}:${periodEnd}` : "";
  useEffect(() => { if (!storageKey) return setStatuses({}); try { setStatuses(JSON.parse(localStorage.getItem(storageKey) || "{}")); } catch { setStatuses({}); } }, [storageKey]);
  useEffect(() => { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(statuses)); }, [storageKey, statuses]);

  async function loadMasters() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if (!url || !key) throw new Error("Supabase environment variables are missing.");
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const [locationResponse, brandResponse] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
      ]);
      if (!locationResponse.ok) throw new Error(await locationResponse.text()); if (!brandResponse.ok) throw new Error(await brandResponse.text());
      setLocations(await locationResponse.json()); setBrands(await brandResponse.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load setup data."); }
  }
  function attach(rowId: string, selected: File[]) {
    const accepted = validFiles(selected); if (!accepted.length) return setMessage("Only XLSX, XLS and CSV files are supported.");
    setFiles((current) => ({ ...current, [rowId]: accepted[0] })); setStatuses((current) => ({ ...current, [rowId]: "pending" })); setMessage("");
  }
  function drop(event: DragEvent<HTMLLabelElement>, rowId: string) { event.preventDefault(); setDragging(null); attach(rowId, Array.from(event.dataTransfer.files)); }
  async function upload(row: UploadRow) {
    const file = files[row.id]; if (!file) return setMessage("Attach a report file first."); if (!periodStart || !periodEnd || periodEnd < periodStart) return setMessage("Select a valid week.");
    setBusy(row.id); setMessage("");
    try {
      const formData = new FormData(); formData.append("file", file); formData.append("locationId", row.locationId); formData.append("brandId", row.level === "Brand" ? row.brandId : ""); formData.append("uploadSlot", row.slot); formData.append("periodStart", periodStart); formData.append("periodEnd", periodEnd);
      const response = await fetch("/api/marketplace/upload", { method: "POST", body: formData }); const data = await response.json() as UploadResult; if (!response.ok || !data.success) throw new Error(data.message || "Upload failed.");
      setResults((current) => ({ ...current, [row.id]: data })); setStatuses((current) => ({ ...current, [row.id]: "uploaded" })); setFiles((current) => ({ ...current, [row.id]: undefined })); setInputKeys((current) => ({ ...current, [row.id]: (current[row.id] || 0) + 1 }));
      const outletCount = data.breakdown?.length || data.summary?.outlets || 1;
      setMessage(row.level === "Location" ? `${row.platform} report split into ${outletCount} online outlet analyses.` : `${row.brandName} ${row.platform} report uploaded and analysed.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to upload report."); } finally { setBusy(null); }
  }
  function clearRow(row: UploadRow) {
    setFiles((current) => ({ ...current, [row.id]: undefined })); setResults((current) => { const next = { ...current }; delete next[row.id]; return next; }); setStatuses((current) => ({ ...current, [row.id]: "pending" })); setInputKeys((current) => ({ ...current, [row.id]: Date.now() }));
  }
  async function clearWeek() {
    if (!locationId) return setMessage("Select a location first."); if (!confirm(`Clear all marketplace data for ${periodStart} to ${periodEnd}?`)) return; setClearing(true);
    try {
      const response = await fetch("/api/marketplace/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId, brandId: "", periodStart, periodEnd, clearAllBrands: true }) });
      const data = await response.json() as { success: boolean; message?: string }; if (!response.ok || !data.success) throw new Error(data.message || "Unable to clear week.");
      if (storageKey) localStorage.removeItem(storageKey); setStatuses({}); setFiles({}); setResults({}); setInputKeys({}); setMessage(data.message || "Week data cleared.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to clear week data."); } finally { setClearing(false); }
  }

  const completed = rows.filter((row) => statuses[row.id] === "uploaded" || statuses[row.id] === "not_applicable").length;
  const progress = rows.length ? Math.round((completed / rows.length) * 100) : 0;
  const analysedRows = useMemo<AnalysisRow[]>(() => rows.flatMap((row) => {
    const result = results[row.id]; if (!result?.summary) return [];
    const breakdown = result.breakdown || result.summary.breakdown || [];
    if (breakdown.length) return breakdown.map((item, index) => ({ key: `${row.id}:${index}:${item.outlet}:${item.platform}`, locationName: row.locationName, restaurant: item.outlet, platform: item.platform, periodStart: result.periodStart || periodStart, periodEnd: result.periodEnd || periodEnd, summary: item }));
    return [{ key: row.id, locationName: row.locationName, restaurant: result.restaurantName || row.brandName, platform: result.marketplace || row.platform, periodStart: result.periodStart || periodStart, periodEnd: result.periodEnd || periodEnd, summary: { outlet: result.restaurantName || row.brandName, platform: result.marketplace || row.platform, orders: result.summary.orders, sales: result.summary.sales, payout: result.summary.payout, discount: result.summary.discount, commission: result.summary.commission, aov: result.summary.aov, payoutRatio: result.summary.payoutRatio } }];
  }), [rows, results, periodStart, periodEnd]);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7"><div className="mx-auto max-w-[1900px] space-y-5">
      <header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black">Weekly Marketplace Upload Matrix</h1><p className="mt-2 text-sm text-slate-300">One Petpooja upload automatically splits online sales outlet-wise and platform-wise.</p></div><div className="flex gap-2"><Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link><Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link></div></div></header>
      <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-6"><select value={locationId} onChange={(e) => { setLocationId(e.target.value); setFiles({}); setResults({}); }} className="h-12 rounded-xl border px-3"><option value="">Select location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select><label className="text-xs font-bold text-slate-500">Week start<input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setResults({}); }} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label><label className="text-xs font-bold text-slate-500">Week end<input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setResults({}); }} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label><div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{completed}/{rows.length}</b> reports complete<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div></div><div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">{progress}% weekly progress</div><button onClick={() => void clearWeek()} disabled={clearing || !locationId} className="h-12 rounded-xl bg-red-50 px-4 font-black text-red-700 disabled:opacity-50">{clearing ? "Clearing..." : "Clear Entire Week"}</button></section>
      <section className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-black">Weekly report uploads</h2><p className="mt-1 text-sm text-slate-500">Upload one Petpooja consolidated report per location; upload payout files brand-wise.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1550px] text-left text-sm"><thead className="bg-slate-950 text-white"><tr>{["Location","Café ID / Brand","Platform","Week Start","Week End","Attach File","Selected File","Status","Action"].map((heading) => <th key={heading} className="p-4 font-black">{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => { const file = files[row.id]; const status = statuses[row.id] || "pending"; return <tr key={row.id} className="border-b align-middle last:border-0"><td className="p-4 font-bold">{row.locationName}</td><td className="p-4"><p className="font-black">{row.brandName}</p><p className="text-xs text-slate-500">{row.level === "Location" ? "Automatically split by online outlet" : "Upload once for this brand"}</p></td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${row.platform === "Zomato" ? "bg-red-100 text-red-700" : row.platform === "Swiggy" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>{row.platform}</span></td><td className="p-4 whitespace-nowrap">{periodStart}</td><td className="p-4 whitespace-nowrap">{periodEnd}</td><td className="p-4"><label onDragEnter={(e) => { e.preventDefault(); setDragging(row.id); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(null)} onDrop={(e) => drop(e, row.id)} className={`block min-w-56 cursor-pointer rounded-xl border-2 border-dashed p-3 text-center text-xs font-bold ${dragging === row.id ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}>Drop file or click to browse<input key={`${row.id}-${inputKeys[row.id] || 0}`} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => attach(row.id, Array.from(e.target.files || []))} /></label></td><td className="max-w-72 p-4">{file ? <p className="truncate text-xs font-bold">{file.name}</p> : status === "uploaded" ? <span className="text-xs font-bold text-emerald-700">Saved and analysed</span> : <span className="text-xs text-slate-400">No file selected</span>}</td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${status === "uploaded" ? "bg-emerald-100 text-emerald-700" : status === "not_applicable" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700"}`}>{status === "uploaded" ? "Analysed" : status === "not_applicable" ? "Not Applicable" : "Pending"}</span></td><td className="p-4"><div className="flex gap-2"><button onClick={() => void upload(row)} disabled={busy !== null || !file} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy === row.id ? "Saving..." : "Save & Analyse"}</button><button onClick={() => setStatuses((current) => ({ ...current, [row.id]: "not_applicable" }))} className="rounded-lg border px-3 py-2 text-xs font-bold">N/A</button><button onClick={() => clearRow(row)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Clear Row</button></div></td></tr>; }) : <tr><td colSpan={9} className="p-10 text-center text-slate-500">Select a location to load the upload matrix.</td></tr>}</tbody></table></div></section>
      <section className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-black">Outlet-wise online sales analysis</h2><p className="mt-1 text-sm text-slate-500">Petpooja consolidated reports are automatically separated by virtual brand, area and platform. Dine-in and offline orders are excluded.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-left text-sm"><thead className="bg-emerald-500 text-slate-950"><tr>{["Location","Restaurant / Virtual Brand","Platform","Sales","Orders","Payout","AOV","Payout %","Discount","Commission","Week"].map((heading) => <th key={heading} className="p-4 font-black">{heading}</th>)}</tr></thead><tbody>{analysedRows.length ? analysedRows.map((row) => <tr key={row.key} className="border-b last:border-0"><td className="p-4 font-bold">{row.locationName}</td><td className="p-4 font-bold">{row.restaurant}</td><td className="p-4 font-black uppercase">{row.platform.replaceAll("_", " ")}</td><td className="p-4">{money(row.summary.sales)}</td><td className="p-4">{row.summary.orders}</td><td className="p-4">{money(row.summary.payout)}</td><td className="p-4">{money(row.summary.aov)}</td><td className="p-4">{row.summary.payoutRatio.toFixed(1)}%</td><td className="p-4">{money(row.summary.discount)}</td><td className="p-4">{money(row.summary.commission)}</td><td className="p-4 whitespace-nowrap">{row.periodStart} to {row.periodEnd}</td></tr>) : <tr><td colSpan={11} className="p-8 text-center text-slate-500">Upload a Petpooja report to generate automatic outlet-wise analysis.</td></tr>}</tbody></table></div></section>
      {message ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p> : null}
    </div></main>
  );
}
