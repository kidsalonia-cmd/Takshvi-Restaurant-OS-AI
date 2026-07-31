"use client";

import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type OrderItem = { id: string; order_id: string; item_name: string; sku: string | null; quantity: number; unit_price: number; line_total: number; notes: string | null };
type Order = {
  id: string;
  order_number: string;
  platform_order_id: string | null;
  location_id: string;
  brand_id: string;
  source: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  packaging_amount: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
};

const statusFlow = ["new", "accepted", "preparing", "ready", "completed"];
const sources = ["all", "zomato", "swiggy", "pos", "website", "phone", "walk_in", "takeaway"];

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string, prefer?: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}

function label(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function orderAge(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function printOrder(order: Order, items: OrderItem[], brandName: string, locationName: string, mode: "kot" | "bill") {
  const win = window.open("", "_blank", "width=420,height=760");
  if (!win) return;
  const rows = items.map((item) => mode === "kot"
    ? `<tr><td>${item.item_name}</td><td style='text-align:right'>${Number(item.quantity)}</td></tr>`
    : `<tr><td>${item.item_name}</td><td style='text-align:center'>${Number(item.quantity)}</td><td style='text-align:right'>₹${Number(item.line_total).toFixed(2)}</td></tr>`).join("");
  win.document.write(`<!doctype html><html><head><title>${mode.toUpperCase()} ${order.order_number}</title><style>@page{size:80mm auto;margin:4mm}body{font-family:Arial;width:72mm;margin:auto;font-size:12px}.c{text-align:center}.r{text-align:right}.b{font-weight:700}.line{border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse}td,th{padding:4px 2px}</style></head><body><h2 class='c'>${brandName}</h2><div class='c'>${locationName}</div><h3 class='c'>${mode === "kot" ? "KITCHEN ORDER TICKET" : "BILL"}</h3><div class='line'></div><div><b>Order:</b> ${order.order_number}</div><div><b>Source:</b> ${label(order.source)}</div><div><b>Date:</b> ${new Date(order.created_at).toLocaleString("en-IN")}</div><div class='line'></div><table><thead><tr><th>Item</th><th>${mode === "kot" ? "Qty" : "Qty"}</th>${mode === "bill" ? "<th class='r'>Amount</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>${mode === "bill" ? `<div class='line'></div><table><tr><td>Subtotal</td><td class='r'>₹${Number(order.subtotal).toFixed(2)}</td></tr><tr><td>Packaging</td><td class='r'>₹${Number(order.packaging_amount).toFixed(2)}</td></tr><tr><td>Tax</td><td class='r'>₹${Number(order.tax_amount).toFixed(2)}</td></tr><tr><td>Discount</td><td class='r'>-₹${Number(order.discount_amount).toFixed(2)}</td></tr><tr class='b'><td>Total</td><td class='r'>₹${Number(order.grand_total).toFixed(2)}</td></tr></table>` : ""}<script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`);
  win.document.close();
}

export default function OrdersPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [locationId, setLocationId] = useState("all");
  const [brandId, setBrandId] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { void loadFoundation(); }, []);
  useEffect(() => { void loadOrders(); }, [locationId]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void loadOrders(true), 8000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, locationId]);

  async function loadFoundation() {
    setLoading(true);
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
      await loadOrders();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load order setup."); }
    finally { setLoading(false); }
  }

  async function loadOrders(silent = false) {
    if (!silent) setLoading(true);
    try {
      const { url, key } = config();
      const locationFilter = locationId === "all" ? "" : `&location_id=eq.${locationId}`;
      const response = await fetch(`${url}/rest/v1/orders?select=*&order=created_at.desc&limit=300${locationFilter}`, { headers: headers(key), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const orderRows = (await response.json()) as Order[];
      setOrders(orderRows);
      const ids = orderRows.map((order) => order.id);
      if (ids.length) {
        const itemRes = await fetch(`${url}/rest/v1/order_items?order_id=in.(${ids.join(",")})&select=*&order=created_at.asc`, { headers: headers(key), cache: "no-store" });
        if (!itemRes.ok) throw new Error(await itemRes.text());
        setItems(await itemRes.json());
      } else setItems([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load orders."); }
    finally { if (!silent) setLoading(false); }
  }

  async function updateStatus(order: Order, nextStatus: string) {
    setError("");
    try {
      const { url, key } = config();
      const now = new Date().toISOString();
      const timestamps: Record<string, string> = {};
      if (nextStatus === "accepted") timestamps.accepted_at = now;
      if (nextStatus === "ready") timestamps.ready_at = now;
      if (nextStatus === "completed") timestamps.completed_at = now;
      if (nextStatus === "cancelled") timestamps.cancelled_at = now;
      const response = await fetch(`${url}/rest/v1/orders?id=eq.${order.id}`, { method: "PATCH", headers: headers(key, "return=minimal"), body: JSON.stringify({ status: nextStatus, updated_at: now, ...timestamps }) });
      if (!response.ok) throw new Error(await response.text());
      await loadOrders(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update order status."); }
  }

  const visibleBrands = brands.filter((brand) => locationId === "all" || brand.location_id === locationId);
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesBrand = !brandId || order.brand_id === brandId;
      const matchesStatus = status === "all" || order.status === status;
      const matchesSource = source === "all" || order.source === source;
      const matchesSearch = !q || [order.order_number, order.platform_order_id, order.customer_name, order.customer_phone].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
      return matchesBrand && matchesStatus && matchesSource && matchesSearch;
    });
  }, [orders, brandId, status, source, search]);

  const nonCancelled = filteredOrders.filter((order) => order.status !== "cancelled");
  const sales = nonCancelled.reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
  const active = filteredOrders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const late = filteredOrders.filter((order) => !["completed", "cancelled"].includes(order.status) && Date.now() - new Date(order.created_at).getTime() > 30 * 60000).length;
  const aov = nonCancelled.length ? sales / nonCancelled.length : 0;

  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7"><div className="mx-auto max-w-[1700px] space-y-5">
    <header className="rounded-3xl bg-slate-950 p-7 text-white"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p><h1 className="mt-2 text-3xl font-black">Unified Order Command Center</h1><p className="mt-2 text-sm text-slate-300">All brands, all kitchens and every order source in one live workflow.</p></div><div className="flex gap-3"><button onClick={() => void loadOrders()} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Refresh now</button><label className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Auto refresh every 8 sec</label></div></div></header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Stat label="Visible orders" value={String(filteredOrders.length)} /><Stat label="Active" value={String(active)} /><Stat label="Late >30 min" value={String(late)} danger={late > 0} /><Stat label="Sales value" value={`₹${sales.toFixed(0)}`} /><Stat label="AOV" value={`₹${aov.toFixed(0)}`} /><Stat label="Cancelled" value={String(filteredOrders.filter((o) => o.status === "cancelled").length)} /></section>

    <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Select value={locationId} onChange={(v) => { setLocationId(v); setBrandId(""); }}><option value="all">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}</Select><Select value={brandId} onChange={setBrandId}><option value="">All brands</option>{visibleBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select><Select value={status} onChange={setStatus}><option value="all">All statuses</option>{statusFlow.map((s) => <option key={s} value={s}>{label(s)}</option>)}<option value="cancelled">Cancelled</option></Select><Select value={source} onChange={setSource}>{sources.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order, customer or phone" className="h-12 rounded-xl border border-slate-200 px-4" /></div></section>

    <section className="grid gap-5 xl:grid-cols-[1fr_380px]"><div className="space-y-4">{loading ? <p className="rounded-2xl bg-white p-10 text-center font-bold text-slate-500">Loading live orders...</p> : null}{!loading && !filteredOrders.length ? <p className="rounded-2xl bg-white p-10 text-center font-bold text-slate-500">No orders found.</p> : null}{filteredOrders.map((order) => { const brand = brands.find((b) => b.id === order.brand_id); const location = locations.find((l) => l.id === order.location_id); const current = statusFlow.indexOf(order.status); const next = current >= 0 && current < statusFlow.length - 1 ? statusFlow[current + 1] : null; const orderItems = items.filter((i) => i.order_id === order.id); const ageMinutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000); return <article key={order.id} onClick={() => setSelectedOrderId(order.id)} className={`cursor-pointer rounded-3xl border bg-white p-5 shadow-sm ${selectedOrderId === order.id ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">#{order.order_number}</h2><Badge text={label(order.source)} tone="blue" /><Badge text={label(order.status)} tone={order.status === "cancelled" ? "red" : order.status === "ready" ? "green" : "amber"} />{ageMinutes > 30 && !["completed", "cancelled"].includes(order.status) ? <Badge text="Late" tone="red" /> : null}</div><p className="mt-2 text-sm font-bold">{brand?.name ?? "Unknown brand"} · {location?.name ?? "Unknown location"}</p><p className="mt-1 text-sm text-slate-500">{order.customer_name || "Guest"}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p><p className="mt-3 text-sm text-slate-600">{orderItems.length ? orderItems.map((item) => `${Number(item.quantity)}× ${item.item_name}`).join(" · ") : "Order items not loaded"}</p><p className="mt-2 text-xs font-bold text-slate-400">Received {orderAge(order.created_at)} ago · {new Date(order.created_at).toLocaleString("en-IN")}</p></div><div className="flex flex-col items-start gap-3 lg:items-end"><p className="text-2xl font-black">₹{Number(order.grand_total).toFixed(2)}</p><div className="flex flex-wrap gap-2">{next ? <button onClick={(e) => { e.stopPropagation(); void updateStatus(order, next); }} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Mark {label(next)}</button> : null}<button onClick={(e) => { e.stopPropagation(); printOrder(order, orderItems, brand?.name ?? "", location?.name ?? "", "kot"); }} className="rounded-xl border px-4 py-2 text-sm font-bold">Print KOT</button><button onClick={(e) => { e.stopPropagation(); printOrder(order, orderItems, brand?.name ?? "", location?.name ?? "", "bill"); }} className="rounded-xl border px-4 py-2 text-sm font-bold">Print Bill</button>{!["completed", "cancelled"].includes(order.status) ? <button onClick={(e) => { e.stopPropagation(); void updateStatus(order, "cancelled"); }} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600">Cancel</button> : null}</div></div></div></article>; })}</div>

    <aside className="h-fit rounded-3xl bg-white p-5 shadow-sm xl:sticky xl:top-5"><h2 className="text-xl font-black">Order details</h2>{(() => { const order = orders.find((o) => o.id === selectedOrderId); if (!order) return <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Select an order to view complete details.</p>; const brand = brands.find((b) => b.id === order.brand_id); const location = locations.find((l) => l.id === order.location_id); const orderItems = items.filter((i) => i.order_id === order.id); return <div className="mt-4 space-y-4"><div className="rounded-2xl bg-slate-950 p-4 text-white"><p className="text-xs text-slate-400">Order</p><p className="text-lg font-black">#{order.order_number}</p><p className="mt-1 text-sm">{brand?.name} · {location?.name}</p></div><div className="space-y-2">{orderItems.map((item) => <div key={item.id} className="flex justify-between rounded-xl border p-3"><div><p className="font-bold">{item.item_name}</p><p className="text-xs text-slate-500">{item.sku || "No SKU"}</p></div><div className="text-right"><p className="font-black">×{Number(item.quantity)}</p><p className="text-xs">₹{Number(item.line_total).toFixed(2)}</p></div></div>)}</div><div className="space-y-2 border-t pt-4 text-sm"><Row label="Subtotal" value={order.subtotal} /><Row label="Packaging" value={order.packaging_amount} /><Row label="Tax" value={order.tax_amount} /><Row label="Discount" value={-Number(order.discount_amount)} /><div className="flex justify-between pt-2 text-lg font-black"><span>Total</span><span>₹{Number(order.grand_total).toFixed(2)}</span></div></div><div className="rounded-xl bg-slate-50 p-4 text-sm"><p><b>Payment:</b> {label(order.payment_method || order.payment_status)}</p><p className="mt-1"><b>Platform ID:</b> {order.platform_order_id || "—"}</p><p className="mt-1"><b>Notes:</b> {order.notes || "—"}</p></div></div>; })()}</aside></section>{error ? <p className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}</div></main>;
}

function Stat({ label: title, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className={`rounded-2xl p-5 shadow-sm ${danger ? "bg-red-50" : "bg-white"}`}><p className="text-sm font-bold text-slate-500">{title}</p><p className={`mt-2 text-3xl font-black ${danger ? "text-red-600" : ""}`}>{value}</p></div>; }
function Badge({ text, tone }: { text: string; tone: "blue" | "green" | "amber" | "red" }) { const styles = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" }; return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[tone]}`}>{text}</span>; }
function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-4">{children}</select>; }
function Row({ label: title, value }: { label: string; value: number }) { return <div className="flex justify-between"><span>{title}</span><b>{value < 0 ? "-" : ""}₹{Math.abs(Number(value)).toFixed(2)}</b></div>; }
