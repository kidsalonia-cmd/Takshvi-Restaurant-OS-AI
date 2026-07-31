"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Order = {
  id: string;
  location_id: string;
  brand_id: string;
  source: string;
  status: string;
  grand_total: number;
  platform_payout_amount: number | null;
  created_at: string;
};
type OrderItem = { order_id: string; item_name: string; quantity: number; line_total: number };
type PeriodKey = "week" | "two_weeks" | "last_month";

type Summary = {
  label: string;
  orders: number;
  sales: number;
  payout: number;
  ratio: number;
  aov: number;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function dateRanges() {
  const now = new Date();
  const weekStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const twoWeekStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13));
  const lastMonthStart = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
  return {
    week: { start: weekStart, end: endOfDay(now), label: "Last 7 Days" },
    two_weeks: { start: twoWeekStart, end: endOfDay(now), label: "Last 14 Days" },
    last_month: { start: lastMonthStart, end: lastMonthEnd, label: "Last Full Month" },
    fetchStart: lastMonthStart < twoWeekStart ? lastMonthStart : twoWeekStart,
  };
}

function summarize(rows: Order[], label: string): Summary {
  const valid = rows.filter((order) => order.status !== "cancelled" && order.source === "zomato");
  const sales = valid.reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
  const payout = valid.reduce((sum, order) => sum + Number(order.platform_payout_amount ?? order.grand_total ?? 0), 0);
  return {
    label,
    orders: valid.length,
    sales,
    payout,
    ratio: sales ? (payout / sales) * 100 : 0,
    aov: valid.length ? sales / valid.length : 0,
  };
}

export default function CeoDashboardPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [locationId, setLocationId] = useState("all");
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => void loadDashboard(true), 8000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadDashboard(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { url, key } = config();
      const ranges = dateRanges();
      const [locationRes, brandRes, orderRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/orders?select=id,location_id,brand_id,source,status,grand_total,platform_payout_amount,created_at&created_at=gte.${encodeURIComponent(ranges.fetchStart.toISOString())}&order=created_at.asc`, { headers: headers(key), cache: "no-store" }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      if (!orderRes.ok) throw new Error(await orderRes.text());

      const orderRows = (await orderRes.json()) as Order[];
      setLocations(await locationRes.json());
      setBrands(await brandRes.json());
      setOrders(orderRows);

      const ids = orderRows.map((order) => order.id);
      if (ids.length) {
        const itemRes = await fetch(`${url}/rest/v1/order_items?order_id=in.(${ids.join(",")})&select=order_id,item_name,quantity,line_total`, { headers: headers(key), cache: "no-store" });
        if (!itemRes.ok) throw new Error(await itemRes.text());
        setItems(await itemRes.json());
      } else setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load CEO dashboard.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const ranges = dateRanges();
  const visibleBrands = brands.filter((brand) => locationId === "all" || brand.location_id === locationId);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const locationMatch = locationId === "all" || order.location_id === locationId;
    const brandMatch = !brandId || order.brand_id === brandId;
    return locationMatch && brandMatch;
  }), [orders, locationId, brandId]);

  const periodOrders = (key: PeriodKey) => filteredOrders.filter((order) => {
    const created = new Date(order.created_at);
    const range = ranges[key];
    return created >= range.start && created <= range.end;
  });

  const weekly = summarize(periodOrders("week"), ranges.week.label);
  const twoWeeks = summarize(periodOrders("two_weeks"), ranges.two_weeks.label);
  const lastMonth = summarize(periodOrders("last_month"), ranges.last_month.label);
  const selectedSummary = period === "week" ? weekly : period === "two_weeks" ? twoWeeks : lastMonth;

  const selectedOrders = periodOrders(period).filter((order) => order.status !== "cancelled" && order.source === "zomato");
  const selectedOrderIds = new Set(selectedOrders.map((order) => order.id));
  const itemRows = Object.entries(items.filter((item) => selectedOrderIds.has(item.order_id)).reduce<Record<string, { qty: number; revenue: number; orders: Set<string> }>>((acc, item) => {
    acc[item.item_name] ??= { qty: 0, revenue: 0, orders: new Set<string>() };
    acc[item.item_name].qty += Number(item.quantity || 0);
    acc[item.item_name].revenue += Number(item.line_total || 0);
    acc[item.item_name].orders.add(item.order_id);
    return acc;
  }, {})).map(([name, value]) => ({
    name,
    qty: value.qty,
    revenue: value.revenue,
    orderCount: value.orders.size,
    revenueShare: selectedSummary.sales ? (value.revenue / selectedSummary.sales) * 100 : 0,
    avgPrice: value.qty ? value.revenue / value.qty : 0,
  })).sort((a, b) => b.qty - a.qty);

  const topItems = itemRows.slice(0, 10);
  const highestRevenueItem = [...itemRows].sort((a, b) => b.revenue - a.revenue)[0];
  const topItem = topItems[0];
  const maxQty = Math.max(1, ...topItems.map((item) => item.qty));
  const ratioMax = Math.max(100, weekly.ratio, twoWeeks.ratio, lastMonth.ratio);

  const trendMessage = weekly.ratio && lastMonth.ratio
    ? weekly.ratio > lastMonth.ratio
      ? `Current weekly payout ratio is ${(weekly.ratio - lastMonth.ratio).toFixed(1)} percentage points above last month.`
      : `Current weekly payout ratio is ${(lastMonth.ratio - weekly.ratio).toFixed(1)} percentage points below last month.`
    : "Upload weekly Zomato payout data to generate the payout trend.";

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
              <h1 className="mt-2 text-3xl font-black">Zomato Performance Intelligence</h1>
              <p className="mt-2 text-sm text-slate-300">Weekly, 14-day cumulative and last-month payout analysis with top-selling item intelligence.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/reports/daily" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Reports</Link>
              <button onClick={() => void loadDashboard()} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-black">Refresh</button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setBrandId(""); }} className="h-12 rounded-xl border px-4">
            <option value="all">All locations</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
          </select>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-12 rounded-xl border px-4">
            <option value="">All brands</option>
            {visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="h-12 rounded-xl border px-4">
            <option value="week">Last 7 Days</option>
            <option value="two_weeks">Last 14 Days Cumulative</option>
            <option value="last_month">Last Full Month</option>
          </select>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{selectedSummary.orders}</b> Zomato orders in selected period</div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Kpi title="Zomato Sales" value={money(selectedSummary.sales)} />
          <Kpi title="Payout" value={money(selectedSummary.payout)} />
          <Kpi title="Payout Ratio" value={`${selectedSummary.ratio.toFixed(1)}%`} />
          <Kpi title="AOV" value={money(selectedSummary.aov)} />
          <Kpi title="Top Item" value={topItem?.name || "—"} small />
          <Kpi title="Top Item Share" value={`${(topItem?.revenueShare || 0).toFixed(1)}%`} />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel title="Payout Ratio Comparison">
            <div className="space-y-5">
              {[weekly, twoWeeks, lastMonth].map((row) => <div key={row.label}>
                <div className="mb-2 flex items-center justify-between text-sm"><b>{row.label}</b><span>{row.ratio.toFixed(1)}%</span></div>
                <div className="h-4 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (row.ratio / ratioMax) * 100)}%` }} /></div>
                <div className="mt-2 flex justify-between text-xs text-slate-500"><span>Sales {money(row.sales)}</span><span>Payout {money(row.payout)}</span><span>AOV {money(row.aov)}</span></div>
              </div>)}
            </div>
          </Panel>

          <Panel title="Period Comparison">
            <div className="grid gap-3 sm:grid-cols-3">
              {[weekly, twoWeeks, lastMonth].map((row) => <div key={row.label} className="rounded-2xl border p-4">
                <p className="text-sm font-bold text-slate-500">{row.label}</p>
                <p className="mt-3 text-2xl font-black">{money(row.sales)}</p>
                <p className="mt-2 text-sm">{row.orders} orders · AOV {money(row.aov)}</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">{row.ratio.toFixed(1)}% realized</p>
              </div>)}
            </div>
            <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-white">{trendMessage}</div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
          <Panel title={`Top-Selling Items — ${selectedSummary.label}`}>
            <div className="space-y-4">
              {topItems.length ? topItems.map((item, index) => <div key={item.name}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div><span className="mr-2 font-black text-slate-400">#{index + 1}</span><b>{item.name}</b></div>
                  <div className="text-right"><b>{item.qty} qty</b><span className="ml-3 text-slate-500">{money(item.revenue)} · {item.revenueShare.toFixed(1)}%</span></div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${(item.qty / maxQty) * 100}%` }} /></div>
              </div>) : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No Zomato item data is available for this period.</p>}
            </div>
          </Panel>

          <Panel title="Top Item Analysis">
            <div className="space-y-3">
              <Metric label="Highest quantity" value={topItem ? `${topItem.name} (${topItem.qty})` : "—"} />
              <Metric label="Highest revenue" value={highestRevenueItem ? `${highestRevenueItem.name} · ${money(highestRevenueItem.revenue)}` : "—"} />
              <Metric label="Average selling price" value={topItem ? money(topItem.avgPrice) : "—"} />
              <Metric label="Orders containing top item" value={String(topItem?.orderCount || 0)} />
            </div>
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
              {topItem ? `${topItem.name} contributes ${topItem.revenueShare.toFixed(1)}% of selected-period Zomato sales. Use it as the hero item for combos, sponsored ads and addon upselling.` : "Import the weekly Zomato item report to generate item-level recommendations."}
            </div>
          </Panel>
        </section>

        {loading ? <p className="font-bold text-slate-500">Loading analytics...</p> : null}
        {error ? <p className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}
      </div>
    </main>
  );
}

function Kpi({ title, value, small = false }: { title: string; value: string; small?: boolean }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{title}</p><p className={`mt-2 font-black ${small ? "text-lg" : "text-2xl"}`}>{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="mb-5 text-xl font-black">{title}</h2>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div>;
}
