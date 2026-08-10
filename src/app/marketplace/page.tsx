"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Platform = "Zomato" | "Swiggy" | "Petpooja";
type Status = "pending" | "uploaded" | "not_applicable";
type OutletBreakdown = { outlet: string; platform: string; orders: number; sales: number; payout: number; discount: number; commission: number; aov: number; payoutRatio: number };
type Summary = OutletBreakdown & { rows: number; outlets?: number; breakdown?: OutletBreakdown[] };
type UploadResult = { success: boolean; message?: string; marketplace?: string; restaurantName?: string | null; periodStart?: string; periodEnd?: string; summary?: Summary; breakdown?: OutletBreakdown[] };
type UploadRow = { id: string; locationId: string; locationName: string; brandId: string; brandName: string; platform: Platform; slot: "petpooja_orders" | "petpooja_items" | "zomato_payout" | "swiggy_payout"; level: "Location" | "Brand" };
type AnalysisRow = { key: string; locationName: string; restaurant: string; platform: string; periodStart: string; periodEnd: string; sales: number; orders: number; payout: number; discount: number; commission: number; aov: number; payoutRatio: number; pendingPayout: number; deductionRate: number; status: string };
type SavedReport = { id: string; marketplace: string; report_type: UploadRow["slot"]; restaurant_name: string | null; location_id: string | null; brand_id: string | null; period_start: string | null; period_end: string | null; summary: Summary | null };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
}
function money(value = 0) { return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }
function platformLabel(value: string) {
  const normalized = normalize(value);
  if (normalized.includes("zomato")) return "Zomato";
  if (normalized.includes("swiggy")) return "Swiggy";
  if (normalized.includes("online other")) return "Online - Platform Unmapped";
  return value.replaceAll("_", " ");
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
function shiftIsoDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
function validFiles(files: FileList | File[]) { return Array.from(files).filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name)); }
function prettyDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MarketplacePage() {
  const week = currentWeek();
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationFilter, setLocationFilter] = useState("all");
  const [periodStart, setPeriodStart] = useState(week.start);
  const [periodEnd, setPeriodEnd] = useState(week.end);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [results, setResults] = useState<Record<string, UploadResult>>({});
  const [inputKeys, setInputKeys] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { void loadMasters(); }, []);

  const visibleLocations = useMemo(
    () => locationFilter === "all" ? locations : locations.filter((location) => location.id === locationFilter),
    [locations, locationFilter],
  );

  const rows = useMemo<UploadRow[]>(() => visibleLocations.flatMap((location) => {
    const locationRows: UploadRow[] = [
      { id: `petpooja-orders:${location.id}`, locationId: location.id, locationName: location.name, brandId: "", brandName: "Consolidated Online Sales", platform: "Petpooja", slot: "petpooja_orders", level: "Location" },
      { id: `petpooja-items:${location.id}`, locationId: location.id, locationName: location.name, brandId: "", brandName: "Consolidated Item Sales", platform: "Petpooja", slot: "petpooja_items", level: "Location" },
    ];
    const brandRows = brands.filter((brand) => brand.location_id === location.id).flatMap((brand) => [
      { id: `zomato:${brand.id}`, locationId: location.id, locationName: location.name, brandId: brand.id, brandName: brand.name, platform: "Zomato" as Platform, slot: "zomato_payout" as const, level: "Brand" as const },
      { id: `swiggy:${brand.id}`, locationId: location.id, locationName: location.name, brandId: brand.id, brandName: brand.name, platform: "Swiggy" as Platform, slot: "swiggy_payout" as const, level: "Brand" as const },
    ]);
    return [...locationRows, ...brandRows];
  }), [visibleLocations, brands]);

  const storageKey = `marketplace-matrix:${locationFilter}:${periodStart}:${periodEnd}`;
  const resultStorageKey = `${storageKey}:results`;

  useEffect(() => {
    try { setStatuses(JSON.parse(localStorage.getItem(storageKey) || "{}")); } catch { setStatuses({}); }
    try { setResults(JSON.parse(localStorage.getItem(resultStorageKey) || "{}")); } catch { setResults({}); }
  }, [storageKey, resultStorageKey]);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(statuses)); }, [storageKey, statuses]);
  useEffect(() => { localStorage.setItem(resultStorageKey, JSON.stringify(results)); }, [resultStorageKey, results]);

  useEffect(() => {
    if (locations.length && rows.length) void loadSavedWeek();
  }, [periodStart, periodEnd, locationFilter, locations.length, brands.length, rows.length]);

  async function loadMasters() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Supabase environment variables are missing.");
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const [locationResponse, brandResponse] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
      ]);
      if (!locationResponse.ok) throw new Error(await locationResponse.text());
      if (!brandResponse.ok) throw new Error(await brandResponse.text());
      setLocations(await locationResponse.json());
      setBrands(await brandResponse.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load setup data."); }
  }

  async function loadSavedWeek() {
    setLoadingSaved(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Supabase environment variables are missing.");
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const response = await fetch(
        `${url}/rest/v1/marketplace_reports?select=id,marketplace,report_type,restaurant_name,location_id,brand_id,period_start,period_end,summary&period_start=eq.${encodeURIComponent(periodStart)}&period_end=eq.${encodeURIComponent(periodEnd)}&order=created_at.desc`,
        { headers, cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      const saved = (await response.json()) as SavedReport[];
      const visibleLocationIds = new Set(visibleLocations.map((location) => location.id));
      const restoredResults: Record<string, UploadResult> = {};
      const restoredStatuses: Record<string, Status> = {};
      for (const report of saved) {
        if (!report.location_id || !visibleLocationIds.has(report.location_id)) continue;
        let rowId = "";
        if (report.report_type === "petpooja_orders") rowId = `petpooja-orders:${report.location_id}`;
        else if (report.report_type === "petpooja_items") rowId = `petpooja-items:${report.location_id}`;
        else if (report.report_type === "zomato_payout" && report.brand_id) rowId = `zomato:${report.brand_id}`;
        else if (report.report_type === "swiggy_payout" && report.brand_id) rowId = `swiggy:${report.brand_id}`;
        if (!rowId || restoredResults[rowId]) continue;
        restoredStatuses[rowId] = "uploaded";
        restoredResults[rowId] = {
          success: true,
          marketplace: report.marketplace,
          restaurantName: report.restaurant_name,
          periodStart: report.period_start || periodStart,
          periodEnd: report.period_end || periodEnd,
          summary: report.summary || undefined,
          breakdown: report.summary?.breakdown || [],
        };
      }
      setStatuses((current) => ({ ...current, ...restoredStatuses }));
      setResults((current) => ({ ...current, ...restoredResults }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to restore saved week data.");
    } finally { setLoadingSaved(false); }
  }

  function moveWeek(offset: number) {
    setFiles({});
    setPeriodStart((value) => shiftIsoDate(value, offset * 7));
    setPeriodEnd((value) => shiftIsoDate(value, offset * 7));
    setMessage("");
  }
  function showCurrentWeek() {
    const current = currentWeek();
    setFiles({});
    setPeriodStart(current.start);
    setPeriodEnd(current.end);
    setMessage("");
  }
  function attach(rowId: string, selected: File[]) {
    const accepted = validFiles(selected);
    if (!accepted.length) return setMessage("Only XLSX, XLS and CSV files are supported.");
    setFiles((current) => ({ ...current, [rowId]: accepted[0] }));
    setStatuses((current) => ({ ...current, [rowId]: "pending" }));
    setMessage("");
  }
  function drop(event: DragEvent<HTMLLabelElement>, rowId: string) {
    event.preventDefault(); setDragging(null); attach(rowId, Array.from(event.dataTransfer.files));
  }

  async function upload(row: UploadRow) {
    const file = files[row.id];
    if (!file) return setMessage("Attach a report file first.");
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setMessage("Select a valid week.");
    setBusy(row.id); setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("locationId", row.locationId);
      formData.append("brandId", row.level === "Brand" ? row.brandId : "");
      formData.append("uploadSlot", row.slot);
      formData.append("periodStart", periodStart);
      formData.append("periodEnd", periodEnd);
      const response = await fetch("/api/marketplace/upload", { method: "POST", body: formData });
      const data = (await response.json()) as UploadResult;
      if (!response.ok || !data.success) throw new Error(data.message || "Upload failed.");
      setResults((current) => ({ ...current, [row.id]: data }));
      setStatuses((current) => ({ ...current, [row.id]: "uploaded" }));
      setFiles((current) => ({ ...current, [row.id]: undefined }));
      setInputKeys((current) => ({ ...current, [row.id]: (current[row.id] || 0) + 1 }));
      const count = data.breakdown?.length || data.summary?.outlets || 1;
      setMessage(row.level === "Location" ? `${row.locationName}: Petpooja report split into ${count} online outlet analyses.` : `${row.brandName} ${row.platform} payout analysed.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to upload report."); }
    finally { setBusy(null); }
  }

  function clearRow(row: UploadRow) {
    setFiles((current) => ({ ...current, [row.id]: undefined }));
    setResults((current) => { const next = { ...current }; delete next[row.id]; return next; });
    setStatuses((current) => ({ ...current, [row.id]: "pending" }));
    setInputKeys((current) => ({ ...current, [row.id]: Date.now() }));
  }

  async function clearWeek() {
    if (!locations.length) return setMessage("No locations found.");
    const targets = locationFilter === "all" ? locations : locations.filter((location) => location.id === locationFilter);
    if (!confirm(`Clear marketplace data for ${targets.length} location(s), ${periodStart} to ${periodEnd}?`)) return;
    setClearing(true);
    try {
      for (const location of targets) {
        const response = await fetch("/api/marketplace/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: location.id, brandId: "", periodStart, periodEnd, clearAllBrands: true }) });
        const data = (await response.json()) as { success: boolean; message?: string };
        if (!response.ok || !data.success) throw new Error(`${location.name}: ${data.message || "Unable to clear week."}`);
      }
      localStorage.removeItem(storageKey); localStorage.removeItem(resultStorageKey);
      setStatuses({}); setFiles({}); setResults({}); setInputKeys({});
      setMessage(`Week data cleared for ${targets.length} location(s).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to clear week data."); }
    finally { setClearing(false); }
  }

  const completed = rows.filter((row) => statuses[row.id] === "uploaded" || statuses[row.id] === "not_applicable").length;
  const progress = rows.length ? Math.round((completed / rows.length) * 100) : 0;

  const analysedRows = useMemo<AnalysisRow[]>(() => {
    const grouped = new Map<string, Omit<AnalysisRow, "key" | "aov" | "payoutRatio" | "pendingPayout" | "deductionRate" | "status">>();
    for (const row of rows) {
      const result = results[row.id];
      if (!result?.summary) continue;
      const breakdown = result.breakdown || result.summary.breakdown || [];
      const items = breakdown.length ? breakdown : [{ outlet: result.restaurantName || row.brandName, platform: result.marketplace || row.platform, orders: result.summary.orders, sales: result.summary.sales, payout: result.summary.payout, discount: result.summary.discount, commission: result.summary.commission, aov: result.summary.aov, payoutRatio: result.summary.payoutRatio }];
      for (const item of items) {
        const platform = platformLabel(item.platform);
        const key = `${row.locationId}|${normalize(item.outlet)}|${normalize(platform)}`;
        const existing = grouped.get(key) || { locationName: row.locationName, restaurant: item.outlet, platform, periodStart: result.periodStart || periodStart, periodEnd: result.periodEnd || periodEnd, sales: 0, orders: 0, payout: 0, discount: 0, commission: 0 };
        const isPayout = row.slot === "zomato_payout" || row.slot === "swiggy_payout";
        if (isPayout) {
          existing.payout = Math.max(existing.payout, item.payout);
          existing.discount = Math.max(existing.discount, item.discount);
          existing.commission = Math.max(existing.commission, item.commission);
          if (!existing.sales) existing.sales = item.sales;
          if (!existing.orders) existing.orders = item.orders;
        } else {
          existing.sales = Math.max(existing.sales, item.sales);
          existing.orders = Math.max(existing.orders, item.orders);
        }
        grouped.set(key, existing);
      }
    }
    return Array.from(grouped.entries()).map(([key, item]) => {
      const aov = item.orders ? item.sales / item.orders : 0;
      const payoutRatio = item.sales ? (item.payout / item.sales) * 100 : 0;
      const pendingPayout = Math.max(item.sales - item.payout - item.discount - item.commission, 0);
      const deductionRate = item.sales ? ((item.sales - item.payout) / item.sales) * 100 : 0;
      const status = !item.sales ? "Missing sales" : !item.payout ? "Payout pending" : payoutRatio < 60 ? "High deduction" : "Healthy";
      return { key, ...item, aov, payoutRatio, pendingPayout, deductionRate, status };
    }).sort((a, b) => b.sales - a.sales);
  }, [rows, results, periodStart, periodEnd]);

  const totals = analysedRows.reduce((acc, row) => ({ sales: acc.sales + row.sales, orders: acc.orders + row.orders, payout: acc.payout + row.payout, pending: acc.pending + row.pendingPayout }), { sales: 0, orders: 0, payout: 0, pending: 0 });
  const totalAov = totals.orders ? totals.sales / totals.orders : 0;
  const totalPayoutPercent = totals.sales ? (totals.payout / totals.sales) * 100 : 0;
  const isCurrentWeek = periodStart === week.start && periodEnd === week.end;

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1900px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><h1 className="text-3xl font-black">Weekly Marketplace Upload Matrix</h1><p className="mt-2 text-sm text-slate-300">Petpooja sales plus separate Zomato and Swiggy payout uploads for every brand.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/marketplace/files" className="rounded-xl bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-900">Source Files</Link><Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link><Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link></div>
          </div>
        </header>

        <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => moveWeek(-1)} className="rounded-xl border px-4 py-2 text-sm font-black">← Previous Week</button>
            <button onClick={showCurrentWeek} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Current Week</button>
            <button onClick={() => moveWeek(1)} className="rounded-xl border px-4 py-2 text-sm font-black">Next Week →</button>
            <button onClick={() => void loadSavedWeek()} disabled={loadingSaved} className="rounded-xl bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800 disabled:opacity-50">{loadingSaved ? "Loading saved data..." : "Reload Saved Week"}</button>
            <div className="ml-0 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-5 py-2 lg:ml-auto">
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Data week being considered{isCurrentWeek ? " · Current Week" : ""}</p>
              <p className="mt-1 text-base font-black text-slate-950">{prettyDate(periodStart)} → {prettyDate(periodEnd)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <select value={locationFilter} onChange={(event) => { setLocationFilter(event.target.value); setFiles({}); }} className="h-12 rounded-xl border px-3"><option value="all">All Locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select>
            <label className="text-xs font-bold text-slate-500">Week start<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label>
            <label className="text-xs font-bold text-slate-500">Week end<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-slate-950" /></label>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{completed}/{rows.length}</b> reports complete<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div></div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">{visibleLocations.length} locations · Zomato + Swiggy enabled</div>
            <button onClick={() => void clearWeek()} disabled={clearing || !locations.length} className="h-12 rounded-xl bg-red-50 px-4 font-black text-red-700 disabled:opacity-50">{clearing ? "Clearing..." : locationFilter === "all" ? "Clear All Locations" : "Clear Location Week"}</button>
          </div>
        </section>

        {analysedRows.length ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"><Metric label="Total Online Sales" value={money(totals.sales)} /><Metric label="Total Orders" value={String(totals.orders)} /><Metric label="Total Payout" value={money(totals.payout)} /><Metric label="Payout %" value={`${totalPayoutPercent.toFixed(1)}%`} /><Metric label="Overall AOV" value={money(totalAov)} /><Metric label="Pending / Gap" value={money(totals.pending)} /></section> : null}

        <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="text-xl font-black">Weekly report uploads</h2><p className="mt-1 text-sm text-slate-500">Each brand now has both a Zomato and a Swiggy payout row. Mark unused platforms as N/A.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1550px] text-left text-sm"><thead className="bg-slate-950 text-white"><tr>{["Location","Café ID / Brand","Platform","Week Start","Week End","Attach File","Selected File","Status","Action"].map((heading) => <th key={heading} className="p-4 font-black">{heading}</th>)}</tr></thead>
            <tbody>{rows.map((row) => { const file = files[row.id]; const status = statuses[row.id] || "pending"; return <tr key={row.id} className="border-b align-middle">
              <td className="p-4 font-bold">{row.locationName}</td><td className="p-4"><p className="font-black">{row.brandName}</p><p className="text-xs text-slate-500">{row.level === "Location" ? "One consolidated upload for location" : "Brand-wise payout report"}</p></td>
              <td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${row.platform === "Zomato" ? "bg-red-100 text-red-700" : row.platform === "Swiggy" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>{row.platform}</span></td>
              <td className="p-4 whitespace-nowrap">{periodStart}</td><td className="p-4 whitespace-nowrap">{periodEnd}</td>
              <td className="p-4"><label onDragEnter={(event) => { event.preventDefault(); setDragging(row.id); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(null)} onDrop={(event) => drop(event, row.id)} className={`block min-w-56 cursor-pointer rounded-xl border-2 border-dashed p-3 text-center text-xs font-bold ${dragging === row.id ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}>Drop file or click to browse<input key={`${row.id}-${inputKeys[row.id] || 0}`} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(event) => attach(row.id, Array.from(event.target.files || []))} /></label></td>
              <td className="max-w-72 p-4">{file ? <p className="truncate text-xs font-bold">{file.name}</p> : status === "uploaded" ? <span className="text-xs font-bold text-emerald-700">Saved and analysed</span> : <span className="text-xs text-slate-400">No file selected</span>}</td>
              <td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${status === "uploaded" ? "bg-emerald-100 text-emerald-700" : status === "not_applicable" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700"}`}>{status === "uploaded" ? "Analysed" : status === "not_applicable" ? "Not Applicable" : "Pending"}</span></td>
              <td className="p-4"><div className="flex gap-2"><button onClick={() => void upload(row)} disabled={busy !== null || !file} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy === row.id ? "Saving..." : "Save & Analyse"}</button><button onClick={() => setStatuses((current) => ({ ...current, [row.id]: "not_applicable" }))} className="rounded-lg border px-3 py-2 text-xs font-bold">N/A</button><button onClick={() => clearRow(row)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Clear Row</button></div></td>
            </tr>; })}</tbody></table></div>
        </section>

        <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="text-xl font-black">Live outlet performance</h2><p className="mt-1 text-sm text-slate-500">Showing data for {prettyDate(periodStart)} to {prettyDate(periodEnd)}.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1650px] text-left text-sm"><thead className="bg-emerald-500"><tr>{["Location","Restaurant","Platform","Sales","Orders","Payout","AOV","Payout %","Pending / Gap","Status","Week"].map((heading) => <th key={heading} className="p-4 font-black">{heading}</th>)}</tr></thead>
            <tbody>{analysedRows.length ? <>{analysedRows.map((row) => <tr key={row.key} className="border-b"><td className="p-4 font-bold">{row.locationName}</td><td className="p-4 font-bold">{row.restaurant}</td><td className="p-4 font-black">{row.platform}</td><td className="p-4">{money(row.sales)}</td><td className="p-4">{row.orders}</td><td className="p-4">{money(row.payout)}</td><td className="p-4">{money(row.aov)}</td><td className="p-4">{row.payoutRatio.toFixed(1)}%</td><td className="p-4">{money(row.pendingPayout)}</td><td className="p-4">{row.status}</td><td className="p-4 whitespace-nowrap">{row.periodStart} to {row.periodEnd}</td></tr>)}<tr className="bg-slate-950 text-white"><td className="p-4 font-black" colSpan={3}>TOTAL ONLINE</td><td className="p-4 font-black">{money(totals.sales)}</td><td className="p-4 font-black">{totals.orders}</td><td className="p-4 font-black">{money(totals.payout)}</td><td className="p-4 font-black">{money(totalAov)}</td><td className="p-4 font-black">{totalPayoutPercent.toFixed(1)}%</td><td className="p-4 font-black">{money(totals.pending)}</td><td className="p-4 font-black">Combined</td><td className="p-4 whitespace-nowrap">{periodStart} to {periodEnd}</td></tr></> : <tr><td colSpan={11} className="p-8 text-center text-slate-500">No saved reports found for this selected week yet.</td></tr>}</tbody>
          </table></div>
        </section>

        {message ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p> : null}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}
