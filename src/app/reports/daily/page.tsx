"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Order = {
  id: string;
  order_number: string;
  location_id: string;
  brand_id: string;
  source: string;
  status: string;
  subtotal: number;
  packaging_amount: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  payment_status: string;
  payment_method: string | null;
  platform_gross_amount: number | null;
  platform_commission_amount: number;
  platform_other_deductions: number;
  platform_payout_amount: number | null;
  payout_status: string;
  created_at: string;
};
type OrderItem = {
  id: string;
  order_id: string;
  item_name: string;
  sku: string | null;
  quantity: number;
  line_total: number;
};

const ONLINE_SOURCES = ["zomato", "swiggy", "ondc", "website"];

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}
function headers(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }
function money(value: number) { return `₹${Number(value || 0).toFixed(2)}`; }
function localDate() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function startEnd(date: string) {
  return {
    start: new Date(`${date}T00:00:00+05:30`).toISOString(),
    end: new Date(`${date}T23:59:59.999+05:30`).toISOString(),
  };
}
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function DailyReportsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [date, setDate] = useState(localDate());
  const [locationId, setLocationId] = useState("all");
  const [brandId, setBrandId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { void loadSetup(); }, []);
  useEffect(() => { void loadOrders(); }, [date, locationId]);

  async function loadSetup() {
    try {
      const { url, key } = cfg();
      const [locationResponse, brandResponse] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers: headers(key) }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: headers(key) }),
      ]);
      if (!locationResponse.ok) throw new Error(await locationResponse.text());
      if (!brandResponse.ok) throw new Error(await brandResponse.text());
      setLocations(await locationResponse.json());
      setBrands(await brandResponse.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load report setup.");
    }
  }

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const { url, key } = cfg();
      const { start, end } = startEnd(date);
      const locationFilter = locationId === "all" ? "" : `&location_id=eq.${locationId}`;
      const orderResponse = await fetch(
        `${url}/rest/v1/orders?select=*&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}${locationFilter}&order=created_at.asc`,
        { headers: headers(key), cache: "no-store" },
      );
      if (!orderResponse.ok) throw new Error(await orderResponse.text());
      const orderRows = (await orderResponse.json()) as Order[];
      setOrders(orderRows);

      const ids = orderRows.map((order) => order.id);
      if (!ids.length) {
        setItems([]);
        return;
      }
      const itemResponse = await fetch(
        `${url}/rest/v1/order_items?order_id=in.(${ids.join(",")})&select=id,order_id,item_name,sku,quantity,line_total`,
        { headers: headers(key), cache: "no-store" },
      );
      if (!itemResponse.ok) throw new Error(await itemResponse.text());
      setItems(await itemResponse.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load daily report.");
    } finally {
      setLoading(false);
    }
  }

  const visibleBrands = brands.filter((brand) => locationId === "all" || brand.location_id === locationId);
  const filtered = useMemo(() => orders.filter((order) => !brandId || order.brand_id === brandId), [orders, brandId]);
  const valid = filtered.filter((order) => order.status !== "cancelled");
  const validOrderIds = new Set(valid.map((order) => order.id));
  const filteredItems = items.filter((item) => validOrderIds.has(item.order_id));

  const totals = {
    orders: valid.length,
    discount: valid.reduce((sum, order) => sum + Number(order.discount_amount), 0),
    tax: valid.reduce((sum, order) => sum + Number(order.tax_amount), 0),
    net: valid.reduce((sum, order) => sum + Number(order.grand_total), 0),
    cancelled: filtered.filter((order) => order.status === "cancelled").length,
  };
  const aov = totals.orders ? totals.net / totals.orders : 0;

  const onlineOrders = valid.filter((order) => ONLINE_SOURCES.includes(order.source));
  const onlineSales = onlineOrders.reduce((sum, order) => sum + Number(order.platform_gross_amount ?? order.grand_total), 0);
  const onlinePayout = onlineOrders.reduce((sum, order) => {
    const fallback = Number(order.platform_gross_amount ?? order.grand_total)
      - Number(order.platform_commission_amount || 0)
      - Number(order.platform_other_deductions || 0);
    return sum + Number(order.platform_payout_amount ?? Math.max(0, fallback));
  }, 0);
  const payoutRatio = onlineSales > 0 ? (onlinePayout / onlineSales) * 100 : 0;
  const onlineAov = onlineOrders.length ? onlineSales / onlineOrders.length : 0;

  const itemPerformance = Object.values(filteredItems.reduce<Record<string, { name: string; sku: string; qty: number; revenue: number }>>((acc, item) => {
    const key = item.sku || item.item_name;
    acc[key] ??= { name: item.item_name, sku: item.sku || "", qty: 0, revenue: 0 };
    acc[key].qty += Number(item.quantity || 0);
    acc[key].revenue += Number(item.line_total || 0);
    return acc;
  }, {})).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  const highestItem = itemPerformance[0];

  const paymentRows = Object.entries(valid.reduce<Record<string, { count: number; value: number }>>((acc, order) => {
    const key = order.payment_method || order.payment_status || "unknown";
    acc[key] ??= { count: 0, value: 0 };
    acc[key].count += 1;
    acc[key].value += Number(order.grand_total);
    return acc;
  }, {}));

  const platformRows = Object.entries(onlineOrders.reduce<Record<string, { orders: number; sales: number; payout: number }>>((acc, order) => {
    const gross = Number(order.platform_gross_amount ?? order.grand_total);
    const payout = Number(order.platform_payout_amount ?? Math.max(0, gross - Number(order.platform_commission_amount || 0) - Number(order.platform_other_deductions || 0)));
    acc[order.source] ??= { orders: 0, sales: 0, payout: 0 };
    acc[order.source].orders += 1;
    acc[order.source].sales += gross;
    acc[order.source].payout += payout;
    return acc;
  }, {}));

  const gstRows = Object.entries(valid.reduce<Record<string, { taxable: number; tax: number; count: number }>>((acc, order) => {
    const base = Number(order.subtotal) + Number(order.packaging_amount);
    const rate = Number(order.tax_amount) > 0 && base > 0 ? Math.round((Number(order.tax_amount) / base) * 100) : 0;
    const key = `${rate}%`;
    acc[key] ??= { taxable: 0, tax: 0, count: 0 };
    acc[key].taxable += base - Number(order.discount_amount);
    acc[key].tax += Number(order.tax_amount);
    acc[key].count += 1;
    return acc;
  }, {}));

  function exportExcel() {
    const workbook = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Orders", Value: totals.orders },
      { Metric: "Net Sales", Value: totals.net },
      { Metric: "Overall AOV", Value: aov },
      { Metric: "Online Orders", Value: onlineOrders.length },
      { Metric: "Online Sales", Value: onlineSales },
      { Metric: "Online Payout", Value: onlinePayout },
      { Metric: "Payout Ratio %", Value: payoutRatio },
      { Metric: "Online AOV", Value: onlineAov },
      { Metric: "Highest Selling Item", Value: highestItem?.name || "—" },
      { Metric: "Highest Item Qty", Value: highestItem?.qty || 0 },
      { Metric: "GST", Value: totals.tax },
      { Metric: "Discount", Value: totals.discount },
      { Metric: "Cancelled", Value: totals.cancelled },
    ]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    const orderRegisterSheet = XLSX.utils.json_to_sheet(filtered.map((order) => ({
      "Order No": order.order_number,
      Time: new Date(order.created_at).toLocaleString("en-IN"),
      Location: locations.find((location) => location.id === order.location_id)?.name || "",
      Brand: brands.find((brand) => brand.id === order.brand_id)?.name || "",
      Source: title(order.source),
      Payment: title(order.payment_method || order.payment_status),
      Status: title(order.status),
      "Online Gross": ONLINE_SOURCES.includes(order.source) ? Number(order.platform_gross_amount ?? order.grand_total) : 0,
      "Platform Payout": ONLINE_SOURCES.includes(order.source) ? Number(order.platform_payout_amount ?? 0) : 0,
      GST: Number(order.tax_amount),
      Total: Number(order.grand_total),
    })));
    XLSX.utils.book_append_sheet(workbook, orderRegisterSheet, "Order Register");

    const onlinePlatformsSheet = XLSX.utils.json_to_sheet(platformRows.map(([platform, value]) => ({
      Platform: title(platform),
      Orders: value.orders,
      Sales: value.sales,
      Payout: value.payout,
      "Payout Ratio %": value.sales ? (value.payout / value.sales) * 100 : 0,
      AOV: value.orders ? value.sales / value.orders : 0,
    })));
    XLSX.utils.book_append_sheet(workbook, onlinePlatformsSheet, "Online Platforms");

    const itemPerformanceSheet = XLSX.utils.json_to_sheet(itemPerformance.map((item, index) => ({
      Rank: index + 1,
      Item: item.name,
      SKU: item.sku,
      Quantity: item.qty,
      Revenue: item.revenue,
    })));
    XLSX.utils.book_append_sheet(workbook, itemPerformanceSheet, "Item Performance");

    XLSX.writeFile(workbook, `Takshvi_Daily_Report_${date}.xls`, { bookType: "biff8" });
  }

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Finance Reports</p><h1 className="mt-2 text-3xl font-black">Daily Sales, Payouts & GST</h1></header>

    <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-4">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl border px-4" />
      <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setBrandId(""); }} className="h-12 rounded-xl border px-4"><option value="all">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select>
      <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-12 rounded-xl border px-4"><option value="">All brands</option>{visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
      <button onClick={exportExcel} className="h-12 rounded-xl bg-slate-950 font-black text-white">Download Excel (.xls)</button>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card title="Net Sales" value={money(totals.net)} note={`${totals.orders} completed orders`} />
      <Card title="Overall AOV" value={money(aov)} />
      <Card title="Online Sales" value={money(onlineSales)} note={`${onlineOrders.length} online orders · AOV ${money(onlineAov)}`} />
      <Card title="Online Payout" value={money(onlinePayout)} note={`Payout ratio ${payoutRatio.toFixed(1)}%`} accent />
      <Card title="Highest Selling Item" value={highestItem?.name || "—"} note={highestItem ? `${highestItem.qty.toFixed(0)} qty · ${money(highestItem.revenue)}` : "No item sales"} />
      <Card title="GST" value={money(totals.tax)} />
      <Card title="Discount" value={money(totals.discount)} />
      <Card title="Cancelled" value={String(totals.cancelled)} danger={totals.cancelled > 0} />
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <Report title="Online Sales vs Payout"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Platform</th><th>Orders</th><th className="text-right">Sales</th><th className="text-right">Payout</th><th className="text-right">Ratio</th></tr></thead><tbody>{platformRows.map(([platform, value]) => <tr key={platform} className="border-b"><td className="p-3 font-bold">{title(platform)}</td><td className="text-center">{value.orders}</td><td className="text-right">{money(value.sales)}</td><td className="text-right font-black">{money(value.payout)}</td><td className="text-right font-bold">{value.sales ? ((value.payout / value.sales) * 100).toFixed(1) : "0.0"}%</td></tr>)}</tbody></table></Report>
      <Report title="Top Selling Items"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr></thead><tbody>{itemPerformance.slice(0, 10).map((item, index) => <tr key={`${item.sku}-${item.name}`} className="border-b"><td className="p-3 font-bold">#{index + 1} {item.name}</td><td className="text-right">{item.qty.toFixed(0)}</td><td className="text-right font-black">{money(item.revenue)}</td></tr>)}</tbody></table></Report>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <Report title="Payment Summary"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Method</th><th>Orders</th><th className="text-right">Amount</th></tr></thead><tbody>{paymentRows.map(([key, value]) => <tr key={key} className="border-b"><td className="p-3 font-bold">{title(key)}</td><td className="text-center">{value.count}</td><td className="text-right font-black">{money(value.value)}</td></tr>)}</tbody></table></Report>
      <Report title="GST Summary"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Rate</th><th>Orders</th><th className="text-right">Taxable</th><th className="text-right">GST</th></tr></thead><tbody>{gstRows.map(([key, value]) => <tr key={key} className="border-b"><td className="p-3 font-bold">{key}</td><td className="text-center">{value.count}</td><td className="text-right">{money(value.taxable)}</td><td className="text-right font-black">{money(value.tax)}</td></tr>)}</tbody></table></Report>
    </section>

    <Report title="Order Register"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Order</th><th>Time</th><th>Brand</th><th>Source</th><th>Payment</th><th>Status</th><th className="text-right">Online Gross</th><th className="text-right">Payout</th><th className="text-right">GST</th><th className="text-right">Total</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id} className="border-b"><td className="p-3 font-bold">{order.order_number}</td><td>{new Date(order.created_at).toLocaleTimeString("en-IN")}</td><td>{brands.find((brand) => brand.id === order.brand_id)?.name || "—"}</td><td>{title(order.source)}</td><td>{title(order.payment_method || order.payment_status)}</td><td className={order.status === "cancelled" ? "font-bold text-red-600" : ""}>{title(order.status)}</td><td className="text-right">{ONLINE_SOURCES.includes(order.source) ? money(Number(order.platform_gross_amount ?? order.grand_total)) : "—"}</td><td className="text-right">{ONLINE_SOURCES.includes(order.source) ? money(Number(order.platform_payout_amount ?? 0)) : "—"}</td><td className="text-right">{money(order.tax_amount)}</td><td className="text-right font-black">{money(order.grand_total)}</td></tr>)}</tbody></table></div></Report>

    {loading ? <p className="font-bold text-slate-500">Loading report...</p> : null}
    {error ? <p className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}
  </div></main>;
}

function Card({ title, value, note, danger = false, accent = false }: { title: string; value: string; note?: string; danger?: boolean; accent?: boolean }) {
  return <div className={`rounded-2xl p-5 shadow-sm ${danger ? "bg-red-50" : accent ? "bg-emerald-50" : "bg-white"}`}><p className="text-sm font-bold text-slate-500">{title}</p><p className={`mt-2 text-2xl font-black ${danger ? "text-red-600" : accent ? "text-emerald-700" : ""}`}>{value}</p>{note ? <p className="mt-2 text-xs font-bold text-slate-500">{note}</p> : null}</div>;
}
function Report({ title: heading, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-xl font-black">{heading}</h2>{children}</section>;
}
