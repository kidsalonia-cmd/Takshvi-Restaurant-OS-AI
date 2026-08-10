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
  processing_status: string;
  summary: Record<string, unknown> | null;
  created_at: string;
};
type ItemFact = {
  report_id: string;
  brand_name: string | null;
  item_name: string;
  quantity: number;
  final_total: number;
  gross_sales: number;
  marketplace: string;
};
type OrderFact = {
  report_id: string;
  brand_name: string | null;
  external_order_id: string | null;
  order_date: string | null;
  marketplace: string;
  gross_sales: number;
  payout_amount: number;
  discount_amount: number;
  commission_amount: number;
};

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isPetpoojaReport(report: Report) {
  return report.report_type.startsWith("petpooja");
}

function isPayoutReport(report: Report) {
  return report.report_type === "zomato_payout" || report.report_type === "swiggy_payout";
}

export default function OutletAnalysisPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [items, setItems] = useState<ItemFact[]>([]);
  const [orders, setOrders] = useState<OrderFact[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadMasters();
  }, []);

  useEffect(() => {
    if (locationId && brandId) void loadAnalysis();
    else {
      setReports([]);
      setItems([]);
      setOrders([]);
    }
  }, [locationId, brandId]);

  async function loadMasters() {
    try {
      const { url, key } = cfg();
      const [l, b] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
      ]);
      if (!l.ok) throw new Error(await l.text());
      if (!b.ok) throw new Error(await b.text());
      setLocations(await l.json());
      setBrands(await b.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load outlets.");
    }
  }

  async function loadAnalysis() {
    setBusy(true);
    setMessage("");
    try {
      const { url, key } = cfg();
      const reportUrl = `${url}/rest/v1/marketplace_reports?select=*&location_id=eq.${encodeURIComponent(locationId)}&or=(brand_id.eq.${encodeURIComponent(brandId)},brand_id.is.null)&order=period_end.desc.nullslast,created_at.desc`;
      const reportRes = await fetch(reportUrl, { headers: headers(key), cache: "no-store" });
      if (!reportRes.ok) throw new Error(await reportRes.text());
      const reportData = (await reportRes.json()) as Report[];
      setReports(reportData);

      const ids = reportData.map((r) => r.id);
      if (!ids.length) {
        setItems([]);
        setOrders([]);
        return;
      }

      const filter = `in.(${ids.join(",")})`;
      const [itemRes, orderRes] = await Promise.all([
        fetch(`${url}/rest/v1/marketplace_item_facts?select=report_id,brand_name,item_name,quantity,final_total,gross_sales,marketplace&report_id=${filter}`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/marketplace_order_facts?select=report_id,brand_name,external_order_id,order_date,marketplace,gross_sales,payout_amount,discount_amount,commission_amount&report_id=${filter}`, { headers: headers(key), cache: "no-store" }),
      ]);
      if (!itemRes.ok) throw new Error(await itemRes.text());
      if (!orderRes.ok) throw new Error(await orderRes.text());
      setItems(await itemRes.json());
      setOrders(await orderRes.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load outlet analysis.");
    } finally {
      setBusy(false);
    }
  }

  const visibleBrands = useMemo(() => brands.filter((b) => !locationId || b.location_id === locationId), [brands, locationId]);
  const outletName = locations.find((l) => l.id === locationId)?.name || "Outlet";
  const brandName = brands.find((b) => b.id === brandId)?.name || "Brand";
  const normalizedBrand = normalize(brandName);

  const reportById = useMemo(() => new Map(reports.map((report) => [report.id, report])), [reports]);

  const relevantOrders = useMemo(() => orders.filter((row) => {
    const report = reportById.get(row.report_id);
    if (!report) return false;
    if (report.brand_id === brandId) return true;
    return report.brand_id === null && normalize(row.brand_name) === normalizedBrand;
  }), [orders, reportById, brandId, normalizedBrand]);

  const relevantItems = useMemo(() => items.filter((row) => {
    const report = reportById.get(row.report_id);
    if (!report) return false;
    if (report.brand_id === brandId) return true;
    return report.brand_id === null && normalize(row.brand_name) === normalizedBrand;
  }), [items, reportById, brandId, normalizedBrand]);

  const totals = useMemo(() => {
    const petpoojaOrders = relevantOrders.filter((row) => {
      const report = reportById.get(row.report_id);
      return report ? isPetpoojaReport(report) : false;
    });
    const payoutOrders = relevantOrders.filter((row) => {
      const report = reportById.get(row.report_id);
      return report ? isPayoutReport(report) : false;
    });
    const salesSource = petpoojaOrders.length ? petpoojaOrders : payoutOrders;
    const uniqueOrders = new Set<string>();
    let sales = 0;
    for (const row of salesSource) {
      sales += n(row.gross_sales);
      uniqueOrders.add(row.external_order_id || `${row.report_id}:${row.order_date || uniqueOrders.size}`);
    }
    const payout = payoutOrders.reduce((sum, row) => sum + n(row.payout_amount), 0);
    const discount = payoutOrders.reduce((sum, row) => sum + n(row.discount_amount), 0);
    const commission = payoutOrders.reduce((sum, row) => sum + n(row.commission_amount), 0);
    const ordersCount = uniqueOrders.size;
    return {
      sales,
      payout,
      orders: ordersCount,
      discount,
      commission,
      aov: ordersCount ? sales / ordersCount : 0,
      payoutRatio: sales ? (payout / sales) * 100 : 0,
    };
  }, [relevantOrders, reportById]);

  const platform = useMemo(() => {
    const map = new Map<string, { sales: number; payout: number; orders: Set<string> }>();
    const petpoojaRows = relevantOrders.filter((row) => {
      const report = reportById.get(row.report_id);
      return report ? isPetpoojaReport(report) : false;
    });
    const payoutRows = relevantOrders.filter((row) => {
      const report = reportById.get(row.report_id);
      return report ? isPayoutReport(report) : false;
    });
    const salesRows = petpoojaRows.length ? petpoojaRows : payoutRows;
    salesRows.forEach((row) => {
      const key = row.marketplace || "unknown";
      const current = map.get(key) || { sales: 0, payout: 0, orders: new Set<string>() };
      current.sales += n(row.gross_sales);
      current.orders.add(row.external_order_id || `${row.report_id}:${current.orders.size}`);
      map.set(key, current);
    });
    payoutRows.forEach((row) => {
      const key = row.marketplace || "unknown";
      const current = map.get(key) || { sales: 0, payout: 0, orders: new Set<string>() };
      current.payout += n(row.payout_amount);
      map.set(key, current);
    });
    return [...map.entries()].map(([name, value]) => ({ name, sales: value.sales, payout: value.payout, orders: value.orders.size })).sort((a, b) => b.sales - a.sales);
  }, [relevantOrders, reportById]);

  const topItems = useMemo(() => {
    const preferred = relevantItems.filter((item) => reportById.get(item.report_id)?.report_type === "petpooja_items");
    const source = preferred.length ? preferred : relevantItems;
    const map = new Map<string, { qty: number; sales: number }>();
    source.forEach((item) => {
      const key = item.item_name || "Unknown";
      const current = map.get(key) || { qty: 0, sales: 0 };
      current.qty += n(item.quantity);
      current.sales += n(item.final_total || item.gross_sales);
      map.set(key, current);
    });
    return [...map.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.qty - a.qty).slice(0, 15);
  }, [relevantItems, reportById]);

  const weekly = useMemo(() => {
    const groups = new Map<string, { label: string; sales: number; payout: number; orders: Set<string> }>();
    relevantOrders.forEach((row) => {
      const report = reportById.get(row.report_id);
      if (!report) return;
      const label = report.period_start && report.period_end ? `${report.period_start} to ${report.period_end}` : new Date(report.created_at).toLocaleDateString("en-IN");
      const key = `${report.period_start || report.created_at}|${report.period_end || ""}`;
      const current = groups.get(key) || { label, sales: 0, payout: 0, orders: new Set<string>() };
      if (isPetpoojaReport(report)) {
        current.sales += n(row.gross_sales);
        current.orders.add(row.external_order_id || `${row.report_id}:${current.orders.size}`);
      }
      if (isPayoutReport(report)) current.payout += n(row.payout_amount);
      groups.set(key, current);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .map(([, row]) => ({ ...row, orders: row.orders.size, ratio: row.sales ? (row.payout / row.sales) * 100 : 0 }));
  }, [relevantOrders, reportById]);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Outlet Intelligence</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Outlet-wise Detailed Analysis</h1>
              <p className="mt-2 text-sm text-slate-300">Petpooja provides sales and order truth; Zomato/Swiggy reports provide payout and deductions.</p>
            </div>
            <Link href="/marketplace" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Back to Upload Center</Link>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setBrandId(""); }} className="h-12 rounded-xl border px-3">
            <option value="">Select outlet</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
          </select>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-12 rounded-xl border px-3">
            <option value="">Select brand</option>
            {visibleBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{reports.length}</b> source reports loaded</div>
          <button onClick={() => void loadAnalysis()} disabled={!locationId || !brandId || busy} className="h-12 rounded-xl bg-emerald-500 font-black text-slate-950 disabled:opacity-50">{busy ? "Refreshing..." : "Refresh Analysis"}</button>
        </section>

        {message ? <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800">{message}</p> : null}

        {locationId && brandId ? <>
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">{outletName} · {brandName}</h2>
            <p className="mt-1 text-sm text-slate-500">Matched location-level Petpooja rows to this brand and merged them with the brand payout report.</p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Kpi label="Sales" value={money(totals.sales)} />
            <Kpi label="Orders" value={String(totals.orders)} />
            <Kpi label="AOV" value={money(totals.aov)} />
            <Kpi label="Payout" value={money(totals.payout)} />
            <Kpi label="Payout Ratio" value={`${totals.payoutRatio.toFixed(1)}%`} />
            <Kpi label="Discount" value={money(totals.discount)} />
            <Kpi label="Commission" value={money(totals.commission)} />
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Platform comparison</h2>
              <div className="mt-5 space-y-4">
                {platform.length ? platform.map((p) => <div key={p.name}>
                  <div className="flex justify-between text-sm"><b className="uppercase">{p.name}</b><span>{p.orders} orders · {money(p.sales)} sales · {money(p.payout)} payout</span></div>
                  <div className="mt-2 h-4 rounded-full bg-slate-100"><div className="h-4 rounded-full bg-emerald-500" style={{ width: `${Math.max(3, totals.sales ? (p.sales / totals.sales) * 100 : 0)}%` }} /></div>
                </div>) : <Empty text="No platform data uploaded for this outlet." />}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Top-selling items</h2>
              <div className="mt-5 space-y-4">
                {topItems.length ? topItems.map((item, index) => <div key={item.name}>
                  <div className="flex justify-between gap-3 text-sm"><b className="truncate">#{index + 1} {item.name}</b><span>{item.qty.toFixed(0)} qty · {money(item.sales)}</span></div>
                  <div className="mt-2 h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-slate-950" style={{ width: `${Math.max(3, (item.qty / Math.max(topItems[0]?.qty || 1, 1)) * 100)}%` }} /></div>
                </div>) : <Empty text="Upload a Petpooja item report to generate top-item analysis." />}
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Weekly report history</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-3">Period</th><th className="p-3">Orders</th><th className="p-3">Sales</th><th className="p-3">Payout</th><th className="p-3">Ratio</th></tr></thead>
                <tbody>{weekly.map((row, index) => <tr key={`${row.label}-${index}`} className="border-b"><td className="p-3 font-bold">{row.label}</td><td className="p-3">{row.orders}</td><td className="p-3">{money(row.sales)}</td><td className="p-3">{money(row.payout)}</td><td className="p-3">{row.ratio.toFixed(1)}%</td></tr>)}</tbody>
              </table>
              {!weekly.length ? <Empty text="No report history found for this outlet and brand." /> : null}
            </div>
          </section>
        </> : <section className="rounded-3xl bg-white p-8 text-center shadow-sm"><p className="text-slate-500">Select an outlet and brand to open the detailed analysis.</p></section>}
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{text}</p>;
}
