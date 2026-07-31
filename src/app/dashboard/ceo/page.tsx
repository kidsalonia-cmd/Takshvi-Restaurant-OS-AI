"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Order = {
  id: string;
  order_number: string;
  location_id: string;
  brand_id: string;
  source: string;
  status: string;
  grand_total: number;
  tax_amount: number;
  discount_amount: number;
  platform_payout_amount: number | null;
  created_at: string;
};
type OrderItem = { order_id: string; item_name: string; quantity: number; line_total: number };
type Inventory = { id: string; location_id: string; name: string; current_stock: number; reorder_level: number; average_cost: number };

type ChartPoint = { label: string; value: number };

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CeoDashboardPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [locationId, setLocationId] = useState("all");
  const [brandId, setBrandId] = useState("");
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
      const { start, end } = todayRange();
      const [locationRes, brandRes, orderRes, inventoryRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/orders?select=id,order_number,location_id,brand_id,source,status,grand_total,tax_amount,discount_amount,platform_payout_amount,created_at&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&order=created_at.asc`, { headers: headers(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/inventory_items?select=id,location_id,name,current_stock,reorder_level,average_cost&is_active=eq.true`, { headers: headers(key), cache: "no-store" }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      if (!orderRes.ok) throw new Error(await orderRes.text());
      if (!inventoryRes.ok) throw new Error(await inventoryRes.text());

      const orderRows = (await orderRes.json()) as Order[];
      setLocations(await locationRes.json());
      setBrands(await brandRes.json());
      setOrders(orderRows);
      setInventory(await inventoryRes.json());

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

  const visibleBrands = brands.filter((brand) => locationId === "all" || brand.location_id === locationId);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const locationMatch = locationId === "all" || order.location_id === locationId;
    const brandMatch = !brandId || order.brand_id === brandId;
    return locationMatch && brandMatch;
  }), [orders, locationId, brandId]);

  const validOrders = filteredOrders.filter((order) => order.status !== "cancelled");
  const sales = validOrders.reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
  const tax = validOrders.reduce((sum, order) => sum + Number(order.tax_amount || 0), 0);
  const discount = validOrders.reduce((sum, order) => sum + Number(order.discount_amount || 0), 0);
  const aov = validOrders.length ? sales / validOrders.length : 0;
  const onlineOrders = validOrders.filter((order) => ["zomato", "swiggy"].includes(order.source));
  const onlineSales = onlineOrders.reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
  const payout = onlineOrders.reduce((sum, order) => sum + Number(order.platform_payout_amount ?? order.grand_total ?? 0), 0);
  const payoutRatio = onlineSales ? (payout / onlineSales) * 100 : 0;
  const activeOrders = filteredOrders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const cancelled = filteredOrders.filter((order) => order.status === "cancelled").length;

  const allowedOrderIds = new Set(filteredOrders.map((order) => order.id));
  const topItems = Object.entries(items.filter((item) => allowedOrderIds.has(item.order_id)).reduce<Record<string, { qty: number; revenue: number }>>((acc, item) => {
    acc[item.item_name] ??= { qty: 0, revenue: 0 };
    acc[item.item_name].qty += Number(item.quantity || 0);
    acc[item.item_name].revenue += Number(item.line_total || 0);
    return acc;
  }, {})).sort((a, b) => b[1].qty - a[1].qty).slice(0, 7);

  const filteredInventory = inventory.filter((row) => locationId === "all" || row.location_id === locationId);
  const inventoryValue = filteredInventory.reduce((sum, row) => sum + Number(row.current_stock || 0) * Number(row.average_cost || 0), 0);
  const lowStock = filteredInventory.filter((row) => Number(row.current_stock) <= Number(row.reorder_level)).length;

  const platformRows = ["zomato", "swiggy"].map((platform) => {
    const rows = validOrders.filter((order) => order.source === platform);
    const value = rows.reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
    const paid = rows.reduce((sum, order) => sum + Number(order.platform_payout_amount ?? order.grand_total ?? 0), 0);
    return { platform, orders: rows.length, sales: value, payout: paid, aov: rows.length ? value / rows.length : 0 };
  });

  const hourlySales: ChartPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    label: `${hour.toString().padStart(2, "0")}:00`,
    value: validOrders.filter((order) => new Date(order.created_at).getHours() === hour).reduce((sum, order) => sum + Number(order.grand_total || 0), 0),
  }));

  const sourceRows = Object.entries(validOrders.reduce<Record<string, number>>((acc, order) => {
    acc[order.source] = (acc[order.source] || 0) + Number(order.grand_total || 0);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  const statusRows = Object.entries(filteredOrders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  const locationRows = locations.map((location) => {
    const rows = validOrders.filter((order) => order.location_id === location.id);
    return { label: location.name, value: rows.reduce((sum, order) => sum + Number(order.grand_total || 0), 0) };
  }).filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
              <h1 className="mt-2 text-3xl font-black">CEO Visual Command Dashboard</h1>
              <p className="mt-2 text-sm text-slate-300">Graphical view of sales, orders, marketplaces, inventory and menu performance. Auto-refresh every 8 seconds.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/orders" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Live Orders</Link>
              <Link href="/reports/daily" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Daily Report</Link>
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
          <FilterStat label="Active locations" value={locations.length} />
          <FilterStat label="Active brands" value={visibleBrands.length} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
          <Kpi title="Sales" value={money(sales)} />
          <Kpi title="Orders" value={String(validOrders.length)} />
          <Kpi title="AOV" value={money(aov)} />
          <Kpi title="Online Sales" value={money(onlineSales)} />
          <Kpi title="Payout" value={money(payout)} />
          <Kpi title="Payout Ratio" value={`${payoutRatio.toFixed(1)}%`} />
          <Kpi title="Active Orders" value={String(activeOrders)} danger={activeOrders > 5} />
          <Kpi title="Low Stock" value={String(lowStock)} danger={lowStock > 0} />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel title="Hourly Sales Trend">
            <LineChart points={hourlySales} />
          </Panel>
          <Panel title="Sales by Order Source">
            <DonutChart rows={sourceRows} total={sales} />
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <Panel title="Sales vs Platform Payout">
            <GroupedBars rows={platformRows.map((row) => ({ label: label(row.platform), first: row.sales, second: row.payout }))} firstLabel="Sales" secondLabel="Payout" />
          </Panel>
          <Panel title="Top Selling Items">
            <HorizontalBars rows={topItems.map(([name, value]) => ({ label: name, value: value.qty, note: money(value.revenue) }))} />
          </Panel>
          <Panel title="Order Status Mix">
            <HorizontalBars rows={statusRows.map(([name, value]) => ({ label: label(name), value }))} />
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <Panel title="Location Performance">
            <HorizontalBars rows={locationRows.map((row) => ({ label: row.label, value: row.value, note: money(row.value) }))} moneyScale />
          </Panel>
          <Panel title="Business Health">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="GST" value={money(tax)} />
              <Metric label="Discount" value={money(discount)} />
              <Metric label="Cancelled" value={String(cancelled)} />
              <Metric label="Inventory Value" value={money(inventoryValue)} />
            </div>
            <Gauge value={payoutRatio} label="Online payout realization" />
          </Panel>
          <Panel title="AI Attention">
            <div className="rounded-2xl bg-slate-950 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Priority insight</p>
              <p className="mt-3 text-sm leading-6">{lowStock > 0 ? `${lowStock} inventory items need replenishment.` : activeOrders > 5 ? `${activeOrders} orders are active; monitor kitchen load.` : cancelled > 0 ? `${cancelled} cancellation(s) recorded today; review reasons.` : payoutRatio > 0 && payoutRatio < 65 ? `Online payout realization is only ${payoutRatio.toFixed(1)}%; review commissions and deductions.` : topItems[0] ? `${topItems[0][0]} is today's highest-selling item with ${topItems[0][1].qty} units.` : "Operations look stable based on current data."}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Quick href="/orders" title="Unified Orders" note="Live order control" />
              <Quick href="/inventory" title="Inventory" note="Stock and reorder" />
              <Quick href="/reports/daily" title="Reports" note="Sales and GST" />
              <Quick href="/integrations/marketplaces" title="Marketplace" note="Zomato and Swiggy" />
            </div>
          </Panel>
        </section>

        {loading ? <p className="font-bold text-slate-500">Loading dashboard...</p> : null}
        {error ? <p className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}
      </div>
    </main>
  );
}

function Kpi({ title, value, danger = false }: { title: string; value: string; danger?: boolean }) {
  return <div className={`rounded-2xl p-5 shadow-sm ${danger ? "bg-red-50" : "bg-white"}`}><p className="text-sm font-bold text-slate-500">{title}</p><p className={`mt-2 text-2xl font-black ${danger ? "text-red-600" : ""}`}>{value}</p></div>;
}

function FilterStat({ label: title, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{value}</b> {title}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-xl font-black">{title}</h2>{children}</section>;
}

function Metric({ label: title, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{title}</p><p className="mt-1 text-lg font-black">{value}</p></div>;
}

function Quick({ href, title, note }: { href: string; title: string; note: string }) {
  return <Link href={href} className="rounded-xl border p-3 hover:border-emerald-500 hover:bg-emerald-50"><p className="font-black">{title}</p><p className="mt-1 text-xs text-slate-500">{note}</p></Link>;
}

function LineChart({ points }: { points: ChartPoint[] }) {
  const width = 760;
  const height = 240;
  const pad = 28;
  const max = Math.max(...points.map((point) => point.value), 1);
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - (point.value / max) * (height - pad * 2);
    return { x, y, ...point };
  });
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const area = `${path} L${coords.at(-1)?.x ?? pad},${height - pad} L${coords[0]?.x ?? pad},${height - pad} Z`;
  return <div><svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Hourly sales line chart"><defs><linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.35"/><stop offset="100%" stopColor="#10b981" stopOpacity="0.03"/></linearGradient></defs>{[0,1,2,3,4].map((line) => <line key={line} x1={pad} x2={width-pad} y1={pad + line * ((height-pad*2)/4)} y2={pad + line * ((height-pad*2)/4)} stroke="#e2e8f0" />)}<path d={area} fill="url(#salesArea)"/><path d={path} fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{coords.filter((_, index) => index % 3 === 0).map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="4" fill="#059669"/><text x={point.x} y={height-7} textAnchor="middle" fontSize="10" fill="#64748b">{point.label.slice(0,2)}</text></g>)}</svg><p className="mt-2 text-sm text-slate-500">Peak hour: {coords.reduce((best, point) => point.value > best.value ? point : best, coords[0] || { label: "—", value: 0, x: 0, y: 0 }).label} · {money(Math.max(...points.map((point) => point.value), 0))}</p></div>;
}

function DonutChart({ rows, total }: { rows: [string, number][]; total: number }) {
  const colors = ["#059669", "#2563eb", "#f59e0b", "#7c3aed", "#e11d48", "#0f766e"];
  let offset = 0;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  return <div className="grid items-center gap-4 sm:grid-cols-[220px_1fr]"><svg viewBox="0 0 220 220" className="mx-auto w-full max-w-[220px]" role="img" aria-label="Sales by source donut chart"><circle cx="110" cy="110" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="26"/>{rows.map(([name, value], index) => { const pct = total ? value / total : 0; const dash = pct * circumference; const element = <circle key={name} cx="110" cy="110" r={radius} fill="none" stroke={colors[index % colors.length]} strokeWidth="26" strokeDasharray={`${dash} ${circumference-dash}`} strokeDashoffset={-offset} transform="rotate(-90 110 110)"/>; offset += dash; return element; })}<text x="110" y="104" textAnchor="middle" fontSize="13" fill="#64748b">Total Sales</text><text x="110" y="126" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0f172a">{money(total)}</text></svg><div className="space-y-3">{rows.length ? rows.map(([name, value], index) => <div key={name} className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="font-bold">{label(name)}</span></div><span>{money(value)} · {total ? ((value/total)*100).toFixed(0) : 0}%</span></div>) : <p className="text-sm text-slate-500">No sales data today.</p>}</div></div>;
}

function GroupedBars({ rows, firstLabel, secondLabel }: { rows: { label: string; first: number; second: number }[]; firstLabel: string; secondLabel: string }) {
  const max = Math.max(...rows.flatMap((row) => [row.first, row.second]), 1);
  return <div><div className="mb-4 flex gap-4 text-sm"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-900" />{firstLabel}</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-500" />{secondLabel}</span></div><div className="space-y-5">{rows.map((row) => <div key={row.label}><div className="mb-2 flex justify-between"><b>{row.label}</b><span className="text-sm text-slate-500">{money(row.first)} / {money(row.second)}</span></div><div className="space-y-2"><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-slate-900" style={{ width: `${(row.first/max)*100}%` }} /></div><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-emerald-500" style={{ width: `${(row.second/max)*100}%` }} /></div></div></div>)}</div></div>;
}

function HorizontalBars({ rows, moneyScale = false }: { rows: { label: string; value: number; note?: string }[]; moneyScale?: boolean }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <div className="space-y-4">{rows.length ? rows.map((row) => <div key={row.label}><div className="mb-1 flex items-center justify-between gap-3"><span className="truncate font-bold">{row.label}</span><span className="shrink-0 text-sm text-slate-500">{row.note ?? (moneyScale ? money(row.value) : row.value)}</span></div><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-emerald-500" style={{ width: `${(row.value/max)*100}%` }} /></div></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No data available today.</p>}</div>;
}

function Gauge({ value, label: title }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(value, 100));
  return <div className="mt-5"><div className="flex items-end justify-between"><div><p className="text-sm font-bold text-slate-500">{title}</p><p className="mt-1 text-3xl font-black">{safe.toFixed(1)}%</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${safe >= 75 ? "bg-emerald-100 text-emerald-700" : safe >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{safe >= 75 ? "Healthy" : safe >= 60 ? "Watch" : "Low"}</span></div><div className="mt-3 h-4 rounded-full bg-slate-100"><div className={`h-4 rounded-full ${safe >= 75 ? "bg-emerald-500" : safe >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${safe}%` }} /></div></div>;
}
