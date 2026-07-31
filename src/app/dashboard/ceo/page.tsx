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
        fetch(`${url}/rest/v1/orders?select=id,order_number,location_id,brand_id,source,status,grand_total,tax_amount,discount_amount,platform_payout_amount,created_at&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&order=created_at.desc`, { headers: headers(key), cache: "no-store" }),
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
      } else {
        setItems([]);
      }
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
  }, {})).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

  const filteredInventory = inventory.filter((row) => locationId === "all" || row.location_id === locationId);
  const inventoryValue = filteredInventory.reduce((sum, row) => sum + Number(row.current_stock || 0) * Number(row.average_cost || 0), 0);
  const lowStock = filteredInventory.filter((row) => Number(row.current_stock) <= Number(row.reorder_level)).length;

  const platformRows = ["zomato", "swiggy"].map((platform) => {
    const rows = validOrders.filter((order) => order.source === platform);
    const value = rows.reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
    const paid = rows.reduce((sum, order) => sum + Number(order.platform_payout_amount ?? order.grand_total ?? 0), 0);
    return { platform, orders: rows.length, sales: value, payout: paid, aov: rows.length ? value / rows.length : 0 };
  });

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
              <h1 className="mt-2 text-3xl font-black">CEO Command Dashboard</h1>
              <p className="mt-2 text-sm text-slate-300">Connected to live orders, inventory and finance data. Auto-refresh every 8 seconds.</p>
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
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{locations.length}</b> active locations</div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{visibleBrands.length}</b> active brands</div>
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

        <section className="grid gap-5 xl:grid-cols-3">
          <Panel title="Marketplace Performance">
            <div className="space-y-3">
              {platformRows.map((row) => <div key={row.platform} className="rounded-2xl border p-4">
                <div className="flex items-center justify-between"><b className="capitalize">{row.platform}</b><span>{row.orders} orders</span></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Metric label="Sales" value={money(row.sales)} /><Metric label="Payout" value={money(row.payout)} /><Metric label="AOV" value={money(row.aov)} /></div>
              </div>)}
            </div>
          </Panel>

          <Panel title="Top Selling Items">
            <div className="space-y-3">
              {topItems.length ? topItems.map(([name, value], index) => <div key={name} className="flex items-center justify-between rounded-xl border p-3"><div><span className="mr-3 font-black text-slate-400">#{index + 1}</span><b>{name}</b></div><div className="text-right"><p className="font-black">{value.qty} qty</p><p className="text-xs text-slate-500">{money(value.revenue)}</p></div></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No item sales recorded today.</p>}
            </div>
          </Panel>

          <Panel title="Business Health">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="GST" value={money(tax)} />
              <Metric label="Discount" value={money(discount)} />
              <Metric label="Cancelled" value={String(cancelled)} />
              <Metric label="Inventory Value" value={money(inventoryValue)} />
            </div>
            <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">AI Attention</p>
              <p className="mt-2 text-sm leading-6">{lowStock > 0 ? `${lowStock} inventory items need replenishment.` : activeOrders > 5 ? `${activeOrders} orders are currently active; monitor kitchen load.` : cancelled > 0 ? `${cancelled} cancellation(s) recorded today; review reasons.` : "Operations look stable based on current data."}</p>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Quick Actions">
            <div className="grid gap-3 sm:grid-cols-2">
              <Quick href="/orders" title="Unified Orders" note="Manage all order sources" />
              <Quick href="/pos" title="POS Billing" note="Create bills and print KOT" />
              <Quick href="/inventory" title="Inventory" note="Review central stock" />
              <Quick href="/integrations/marketplaces" title="Marketplace Setup" note="Map Zomato and Swiggy" />
            </div>
          </Panel>
          <Panel title="Data Connection Status">
            <div className="space-y-3 text-sm">
              <Status label="Supabase database" value="Connected" ok />
              <Status label="POS orders" value="Connected" ok />
              <Status label="Inventory engine" value="Connected" ok />
              <Status label="Petpooja weekly reports" value="Ready for upload module" />
              <Status label="Petpooja live API" value="Waiting for official access" />
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
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-xl font-black">{title}</h2>{children}</section>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}
function Quick({ href, title, note }: { href: string; title: string; note: string }) {
  return <Link href={href} className="rounded-2xl border p-4 hover:border-emerald-500"><p className="font-black">{title}</p><p className="mt-1 text-xs text-slate-500">{note}</p></Link>;
}
function Status({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return <div className="flex items-center justify-between rounded-xl border p-3"><span>{label}</span><b className={ok ? "text-emerald-600" : "text-amber-600"}>{value}</b></div>;
}
