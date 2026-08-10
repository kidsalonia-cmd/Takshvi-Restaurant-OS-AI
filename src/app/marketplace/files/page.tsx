"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Report = {
  id: string;
  marketplace: string;
  report_type: string;
  restaurant_name: string | null;
  location_id: string | null;
  brand_id: string | null;
  period_start: string | null;
  period_end: string | null;
  original_file_name: string;
  file_size_bytes: number | null;
  created_at: string;
};

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}
function authHeaders(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }
function formatBytes(value: number | null) {
  const bytes = Number(value || 0);
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() { return new Date().toISOString().slice(0, 10); }

export default function MarketplaceFilesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [locationId, setLocationId] = useState("all");
  const [brandId, setBrandId] = useState("all");
  const [startDate, setStartDate] = useState(currentMonthStart());
  const [endDate, setEndDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { void loadMasters(); }, []);
  useEffect(() => { void loadReports(); }, [locationId, brandId, startDate, endDate]);

  async function loadMasters() {
    try {
      const { url, key } = cfg();
      const [locationRes, brandRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&order=name.asc`, { headers: authHeaders(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&order=name.asc`, { headers: authHeaders(key), cache: "no-store" }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      setLocations(await locationRes.json());
      setBrands(await brandRes.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load setup data."); }
  }

  async function loadReports() {
    setBusy(true);
    setMessage("");
    try {
      const { url, key } = cfg();
      const filters = [
        "select=id,marketplace,report_type,restaurant_name,location_id,brand_id,period_start,period_end,original_file_name,file_size_bytes,created_at",
        "order=created_at.desc",
      ];
      if (locationId !== "all") filters.push(`location_id=eq.${encodeURIComponent(locationId)}`);
      if (brandId !== "all") filters.push(`brand_id=eq.${encodeURIComponent(brandId)}`);
      if (startDate) filters.push(`period_end=gte.${encodeURIComponent(startDate)}`);
      if (endDate) filters.push(`period_start=lte.${encodeURIComponent(endDate)}`);
      const response = await fetch(`${url}/rest/v1/marketplace_reports?${filters.join("&")}`, { headers: authHeaders(key), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      setReports(await response.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load source files."); }
    finally { setBusy(false); }
  }

  async function download(report: Report) {
    setDownloading(report.id);
    setMessage("");
    try {
      const response = await fetch(`/api/marketplace/download?reportId=${encodeURIComponent(report.id)}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(data.message || "Original file is not available.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = report.original_file_name || "marketplace-report.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage(`Downloaded ${report.original_file_name}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to download file."); }
    finally { setDownloading(null); }
  }

  const visibleBrands = useMemo(() => brands.filter((brand) => locationId === "all" || brand.location_id === locationId), [brands, locationId]);
  const locationName = (id: string | null) => locations.find((location) => location.id === id)?.name || "—";
  const brandName = (id: string | null) => id ? brands.find((brand) => brand.id === id)?.name || "Unknown brand" : "Location-level / Petpooja";

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Marketplace Audit</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><h1 className="text-3xl font-black">Source Files</h1><p className="mt-2 text-sm text-slate-300">Review and download the original Excel/CSV reports used for Marketplace calculations.</p></div>
            <Link href="/marketplace" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Back to Upload Center</Link>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-5">
          <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setBrandId("all"); }} className="h-12 rounded-xl border px-3"><option value="all">All Locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select>
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="h-12 rounded-xl border px-3"><option value="all">All Brands</option>{visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
          <label className="text-xs font-bold text-slate-500">From<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm" /></label>
          <label className="text-xs font-bold text-slate-500">To<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm" /></label>
          <button onClick={() => void loadReports()} disabled={busy} className="h-12 rounded-xl bg-emerald-500 font-black text-slate-950 disabled:opacity-50">{busy ? "Loading..." : `Refresh (${reports.length})`}</button>
        </section>

        {message ? <p className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">{message}</p> : null}

        <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="text-xl font-black">Uploaded source reports</h2><p className="mt-1 text-sm text-slate-500">Files uploaded before source-file storage was enabled will show their filename but cannot be downloaded; re-upload them once to preserve the original workbook.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-left text-sm">
              <thead className="bg-slate-950 text-white"><tr>{["Period", "Location", "Brand / Scope", "Platform", "Report Type", "Original File", "Size", "Uploaded", "Action"].map((heading) => <th key={heading} className="p-4 font-black">{heading}</th>)}</tr></thead>
              <tbody>{reports.length ? reports.map((report) => <tr key={report.id} className="border-b">
                <td className="p-4 whitespace-nowrap font-bold">{report.period_start || "—"} to {report.period_end || "—"}</td>
                <td className="p-4">{locationName(report.location_id)}</td>
                <td className="p-4 font-bold">{brandName(report.brand_id)}</td>
                <td className="p-4 uppercase font-black">{report.marketplace}</td>
                <td className="p-4">{report.report_type.replaceAll("_", " ")}</td>
                <td className="p-4 max-w-80"><span className="font-bold break-all">{report.original_file_name}</span></td>
                <td className="p-4 whitespace-nowrap">{formatBytes(report.file_size_bytes)}</td>
                <td className="p-4 whitespace-nowrap">{new Date(report.created_at).toLocaleString("en-IN")}</td>
                <td className="p-4"><button onClick={() => void download(report)} disabled={downloading === report.id} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{downloading === report.id ? "Downloading..." : "Download Original"}</button></td>
              </tr>) : <tr><td colSpan={9} className="p-8 text-center text-slate-500">No uploaded reports found for these filters.</td></tr>}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
