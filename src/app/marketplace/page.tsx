"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type GenericRow = Record<string, unknown>;
type ParsedReport = {
  marketplace: "zomato" | "swiggy" | "petpooja" | "unknown";
  reportType: "settlement" | "order_detail" | "item_summary" | "unknown";
  sheetName: string;
  rows: GenericRow[];
  columns: string[];
  restaurantName: string;
  periodStart: string;
  periodEnd: string;
  summary: {
    orders: number;
    grossSales: number;
    discount: number;
    tax: number;
    packaging: number;
    commission: number;
    deductions: number;
    payout: number;
    payoutRatio: number;
    aov: number;
    quantity: number;
  };
  topItems: { name: string; quantity: number; sales: number }[];
};

const EMPTY_SUMMARY = {
  orders: 0,
  grossSales: 0,
  discount: 0,
  tax: 0,
  packaging: 0,
  commission: 0,
  deductions: 0,
  payout: 0,
  payoutRatio: 0,
  aov: 0,
  quantity: 0,
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

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findKey(row: GenericRow, aliases: string[]) {
  const entries = Object.keys(row);
  return entries.find((key) => aliases.some((alias) => normalize(key).includes(normalize(alias))));
}

function text(row: GenericRow, aliases: string[]) {
  const key = findKey(row, aliases);
  return key ? String(row[key] ?? "").trim() : "";
}

function number(row: GenericRow, aliases: string[]) {
  const key = findKey(row, aliases);
  if (!key) return 0;
  const raw = String(row[key] ?? "").replace(/[₹,%()\s]/g, "").replace(/,/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: unknown) {
  if (!value) return "";
  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = raw.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function detectMarketplace(fileName: string, columns: string[], rows: GenericRow[]) {
  const haystack = `${fileName} ${columns.join(" ")} ${rows.slice(0, 20).map((row) => Object.values(row).join(" ")).join(" ")}`.toLowerCase();
  if (haystack.includes("zomato")) return "zomato" as const;
  if (haystack.includes("swiggy")) return "swiggy" as const;
  if (haystack.includes("petpooja") || haystack.includes("invoice no") || haystack.includes("order type")) return "petpooja" as const;
  return "unknown" as const;
}

function detectReportType(columns: string[]) {
  const joined = normalize(columns.join(" "));
  if (joined.includes("payout") || joined.includes("settlement") || joined.includes("service fee") || joined.includes("commission")) return "settlement" as const;
  if (joined.includes("invoice") && (joined.includes("order type") || joined.includes("payment type"))) return "order_detail" as const;
  if (joined.includes("item name") && joined.includes("quantity")) return "item_summary" as const;
  return "unknown" as const;
}

function analyse(fileName: string, sheetName: string, rows: GenericRow[]): ParsedReport {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const marketplace = detectMarketplace(fileName, columns, rows);
  const reportType = detectReportType(columns);
  const summary = { ...EMPTY_SUMMARY };
  const itemMap = new Map<string, { quantity: number; sales: number }>();
  const orderIds = new Set<string>();
  const dates: string[] = [];
  let restaurantName = "";

  rows.forEach((row) => {
    restaurantName ||= text(row, ["restaurant name", "restaurant", "outlet name", "store name"]);
    const date = isoDate(text(row, ["order date", "date", "invoice date", "settlement date"]));
    if (date) dates.push(date);
    const orderId = text(row, ["order id", "zomato order id", "swiggy order id", "invoice no", "invoice number"]);
    if (orderId) orderIds.add(orderId);

    const qty = number(row, ["quantity", "qty", "item quantity"]);
    const gross = number(row, ["gross sales", "gross order value", "items subtotal", "item subtotal", "final total", "total sales", "net order value"]);
    const discount = Math.abs(number(row, ["restaurant funded discount", "discount amount", "discount"]));
    const tax = Math.abs(number(row, ["gst", "tax amount", "tax"]));
    const packaging = number(row, ["packaging charges", "packing charges", "packaging amount"]);
    const commission = Math.abs(number(row, ["commission", "base service fee", "service fee"]));
    const deductions = Math.abs(number(row, ["total deductions", "net deductions", "other deductions"]));
    const payout = number(row, ["net payout", "order level payout", "payout amount", "settlement amount"]);

    summary.quantity += qty;
    summary.grossSales += gross;
    summary.discount += discount;
    summary.tax += tax;
    summary.packaging += packaging;
    summary.commission += commission;
    summary.deductions += deductions;
    summary.payout += payout;

    const itemName = text(row, ["item name", "product name", "menu item"]);
    if (itemName) {
      const current = itemMap.get(itemName) ?? { quantity: 0, sales: 0 };
      current.quantity += qty || 1;
      current.sales += gross;
      itemMap.set(itemName, current);
    }
  });

  summary.orders = orderIds.size || rows.length;
  summary.aov = summary.orders ? summary.grossSales / summary.orders : 0;
  summary.payoutRatio = summary.grossSales ? (summary.payout / summary.grossSales) * 100 : 0;
  dates.sort();

  return {
    marketplace,
    reportType,
    sheetName,
    rows,
    columns,
    restaurantName,
    periodStart: dates[0] || "",
    periodEnd: dates.at(-1) || "",
    summary,
    topItems: [...itemMap.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
  };
}

async function fileHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function MarketplacePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedReport | null>(null);
  const [busy, setBusy] = useState(false);
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
      setMessage(error instanceof Error ? error.message : "Unable to load locations and brands.");
    }
  }

  const visibleBrands = useMemo(() => brands.filter((brand) => !locationId || brand.location_id === locationId), [brands, locationId]);

  async function parseSelectedFile() {
    if (!file) return setMessage("Choose an XLSX, XLS or CSV report first.");
    setBusy(true);
    setMessage("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const candidates = workbook.SheetNames.map((sheetName) => {
        const rows = XLSX.utils.sheet_to_json<GenericRow>(workbook.Sheets[sheetName], { defval: "", raw: false });
        return { sheetName, rows };
      }).filter((candidate) => candidate.rows.length > 0);
      if (!candidates.length) throw new Error("No readable rows were found in the report.");
      const best = candidates.sort((a, b) => (Object.keys(b.rows[0] || {}).length * b.rows.length) - (Object.keys(a.rows[0] || {}).length * a.rows.length))[0];
      const result = analyse(file.name, best.sheetName, best.rows);
      setParsed(result);
      setMessage(`Detected ${result.marketplace.toUpperCase()} ${result.reportType.replace("_", " ")} report with ${result.rows.length} rows.`);
    } catch (error) {
      setParsed(null);
      setMessage(error instanceof Error ? error.message : "Unable to parse the report.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAnalysis() {
    if (!file || !parsed) return setMessage("Parse a report before saving it.");
    if (!locationId || !brandId) return setMessage("Select the matching location and brand.");
    setBusy(true);
    setMessage("");
    try {
      const { url, key } = config();
      const hash = await fileHash(file);
      const reportRes = await fetch(`${url}/rest/v1/marketplace_reports`, {
        method: "POST",
        headers: { ...authHeaders(key), "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          marketplace: parsed.marketplace,
          report_type: parsed.reportType,
          restaurant_name: parsed.restaurantName || null,
          location_id: locationId,
          brand_id: brandId,
          period_start: parsed.periodStart || null,
          period_end: parsed.periodEnd || null,
          original_file_name: file.name,
          file_size_bytes: file.size,
          file_hash: hash,
          processing_status: parsed.reportType === "unknown" ? "review_required" : "processed",
          detected_columns: parsed.columns,
          summary: parsed.summary,
        }),
      });
      if (!reportRes.ok) {
        const detail = await reportRes.text();
        if (detail.includes("marketplace_reports_file_hash_uidx")) throw new Error("This report has already been uploaded.");
        throw new Error(detail);
      }
      const [saved] = await reportRes.json();

      const itemFacts = parsed.topItems.map((item) => ({
        report_id: saved.id,
        marketplace: parsed.marketplace,
        restaurant_name: parsed.restaurantName || null,
        item_name: item.name,
        quantity: item.quantity,
        gross_sales: item.sales,
        final_total: item.sales,
      }));
      if (itemFacts.length) {
        const itemRes = await fetch(`${url}/rest/v1/marketplace_item_facts`, {
          method: "POST",
          headers: { ...authHeaders(key), "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(itemFacts),
        });
        if (!itemRes.ok) throw new Error(await itemRes.text());
      }

      setMessage("Report analysed and saved successfully. Marketplace history is now updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save marketplace analysis.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Marketplace Intelligence</h1>
              <p className="mt-2 text-sm text-slate-300">Upload Zomato, Swiggy or Petpooja reports and generate online sales, payout and item intelligence.</p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link>
              <Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Upload and analyse report</h2>
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setBrandId(""); }} className="h-12 rounded-xl border px-3">
                  <option value="">Select location</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                </select>
                <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="h-12 rounded-xl border px-3">
                  <option value="">Select brand</option>
                  {visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </div>
              <label className="block rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-emerald-500">
                <span className="block font-black">Choose marketplace report</span>
                <span className="mt-1 block text-sm text-slate-500">XLSX, XLS or CSV</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="mt-4 block w-full text-sm" onChange={(event) => { setFile(event.target.files?.[0] || null); setParsed(null); setMessage(""); }} />
              </label>
              {file ? <p className="rounded-xl bg-slate-50 p-3 text-sm"><b>{file.name}</b> · {(file.size / 1024 / 1024).toFixed(2)} MB</p> : null}
              <button onClick={() => void parseSelectedFile()} disabled={busy || !file} className="h-12 w-full rounded-xl bg-slate-950 font-black text-white disabled:opacity-50">{busy ? "Processing..." : "Analyse Report"}</button>
              {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{message}</p> : null}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Detected report</h2>
            {parsed ? <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Marketplace" value={parsed.marketplace.toUpperCase()} />
                <Metric label="Report type" value={parsed.reportType.replace("_", " ")} />
                <Metric label="Rows" value={String(parsed.rows.length)} />
                <Metric label="Sheet" value={parsed.sheetName} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Restaurant" value={parsed.restaurantName || "Not detected"} />
                <Metric label="Period" value={parsed.periodStart && parsed.periodEnd ? `${parsed.periodStart} to ${parsed.periodEnd}` : "Not detected"} />
              </div>
              <button onClick={() => void saveAnalysis()} disabled={busy} className="h-12 w-full rounded-xl bg-emerald-500 font-black text-slate-950 disabled:opacity-50">Save to Marketplace Dashboard</button>
            </div> : <p className="mt-5 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">Choose a report and click Analyse Report. Nothing is saved until you review the detected result.</p>}
          </div>
        </section>

        {parsed ? <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <Kpi label="Orders" value={String(parsed.summary.orders)} />
            <Kpi label="Gross Sales" value={money(parsed.summary.grossSales)} />
            <Kpi label="AOV" value={money(parsed.summary.aov)} />
            <Kpi label="Payout" value={money(parsed.summary.payout)} />
            <Kpi label="Payout Ratio" value={`${parsed.summary.payoutRatio.toFixed(1)}%`} />
            <Kpi label="Discount" value={money(parsed.summary.discount)} />
            <Kpi label="Commission" value={money(parsed.summary.commission)} />
            <Kpi label="Quantity" value={parsed.summary.quantity.toFixed(0)} />
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Financial realization</h2>
              <div className="mt-5 space-y-4">
                <Bar label="Gross sales" value={parsed.summary.grossSales} max={Math.max(parsed.summary.grossSales, 1)} />
                <Bar label="Payout" value={parsed.summary.payout} max={Math.max(parsed.summary.grossSales, 1)} />
                <Bar label="Discount" value={parsed.summary.discount} max={Math.max(parsed.summary.grossSales, 1)} />
                <Bar label="Commission" value={parsed.summary.commission} max={Math.max(parsed.summary.grossSales, 1)} />
                <Bar label="Other deductions" value={parsed.summary.deductions} max={Math.max(parsed.summary.grossSales, 1)} />
              </div>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Top online items</h2>
              <div className="mt-5 space-y-4">
                {parsed.topItems.length ? parsed.topItems.map((item, index) => <div key={item.name}>
                  <div className="mb-1 flex justify-between gap-3 text-sm"><b className="truncate">#{index + 1} {item.name}</b><span>{item.quantity.toFixed(0)} qty · {money(item.sales)}</span></div>
                  <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (item.quantity / Math.max(parsed.topItems[0]?.quantity || 1, 1)) * 100)}%` }} /></div>
                </div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">This report does not contain item-level rows.</p>}
              </div>
            </div>
          </section>
        </> : null}
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 font-black capitalize">{value}</p></div>;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return <div><div className="mb-2 flex justify-between text-sm"><b>{label}</b><span>{money(value)}</span></div><div className="h-4 rounded-full bg-slate-100"><div className="h-4 rounded-full bg-slate-900" style={{ width: `${Math.max(value ? 3 : 0, Math.min(100, (value / max) * 100))}%` }} /></div></div>;
}
