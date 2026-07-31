"use client";

import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Order = {
  id: string;
  order_number: string;
  platform_order_id: string | null;
  location_id: string;
  brand_id: string;
  source: string;
  status: string;
  customer_name: string | null;
  grand_total: number;
  payment_status: string;
  created_at: string;
};

const statusFlow = ["new", "accepted", "preparing", "ready", "completed"];

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export default function OrdersPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadFoundation();
  }, []);

  useEffect(() => {
    if (locationId) void loadOrders();
  }, [locationId]);

  async function loadFoundation() {
    setLoading(true);
    try {
      const { url, key } = config();
      const locationResponse = await fetch(`${url}/rest/v1/locations?select=id,name,code&order=created_at.asc`, {
        headers: headers(key),
        cache: "no-store",
      });
      if (!locationResponse.ok) throw new Error(await locationResponse.text());
      const locationRows = (await locationResponse.json()) as Location[];
      setLocations(locationRows);
      if (locationRows[0]) setLocationId(locationRows[0].id);

      const brandResponse = await fetch(`${url}/rest/v1/brands?select=id,name,location_id&order=name.asc`, {
        headers: headers(key),
        cache: "no-store",
      });
      if (!brandResponse.ok) throw new Error(await brandResponse.text());
      setBrands((await brandResponse.json()) as Brand[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    try {
      const { url, key } = config();
      const response = await fetch(
        `${url}/rest/v1/orders?location_id=eq.${locationId}&select=*&order=created_at.desc&limit=200`,
        { headers: headers(key), cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      setOrders((await response.json()) as Order[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load orders.");
    }
  }

  async function updateStatus(order: Order, nextStatus: string) {
    try {
      const { url, key } = config();
      const timestamps: Record<string, string> = {};
      const now = new Date().toISOString();
      if (nextStatus === "accepted") timestamps.accepted_at = now;
      if (nextStatus === "ready") timestamps.ready_at = now;
      if (nextStatus === "completed") timestamps.completed_at = now;
      if (nextStatus === "cancelled") timestamps.cancelled_at = now;

      const response = await fetch(`${url}/rest/v1/orders?id=eq.${order.id}`, {
        method: "PATCH",
        headers: headers(key, "return=minimal"),
        body: JSON.stringify({ status: nextStatus, updated_at: now, ...timestamps }),
      });
      if (!response.ok) throw new Error(await response.text());
      await loadOrders();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update order.");
    }
  }

  const filteredBrands = brands.filter((brand) => brand.location_id === locationId);
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesBrand = !brandId || order.brand_id === brandId;
      const matchesStatus = status === "all" || order.status === status;
      const matchesSearch = !term || [order.order_number, order.platform_order_id, order.customer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
      return matchesBrand && matchesStatus && matchesSearch;
    });
  }, [orders, brandId, status, search]);

  const sales = filteredOrders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
  const activeOrders = filteredOrders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const avgOrder = filteredOrders.length ? sales / filteredOrders.filter((order) => order.status !== "cancelled").length || 0 : 0;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-7 text-slate-950 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-400">Central order command</p>
          <h1 className="mt-2 text-3xl font-black">Live Orders</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            View every brand's Zomato, Swiggy, POS and direct orders from one physical location and move each order through preparation.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Visible orders" value={String(filteredOrders.length)} />
          <Stat label="Active orders" value={String(activeOrders)} />
          <Stat label="Order value" value={`₹${sales.toFixed(2)}`} note={`AOV ₹${avgOrder.toFixed(2)}`} />
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm md:p-7">
          <div className="grid gap-4 md:grid-cols-4">
            <Select label="Location" value={locationId} onChange={(value) => { setLocationId(value); setBrandId(""); }}>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
            </Select>
            <Select label="Brand" value={brandId} onChange={setBrandId}>
              <option value="">All brands</option>
              {filteredBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </Select>
            <Select label="Status" value={status} onChange={setStatus}>
              <option value="all">All statuses</option>
              {statusFlow.map((item) => <option key={item} value={item}>{label(item)}</option>)}
              <option value="cancelled">Cancelled</option>
            </Select>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Search</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order no. or customer" className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500" />
            </label>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm md:p-7">
          {loading ? <p className="py-12 text-center font-bold text-slate-500">Loading orders...</p> : null}
          {!loading && filteredOrders.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-xl font-black">No orders found</p>
              <p className="mt-2 text-sm text-slate-500">Orders will appear here after POS or platform integration starts.</p>
            </div>
          ) : null}

          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const brand = brands.find((item) => item.id === order.brand_id);
              const currentIndex = statusFlow.indexOf(order.status);
              const nextStatus = currentIndex >= 0 && currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;
              return (
                <article key={order.id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black">#{order.order_number}</h2>
                        <Badge text={order.source.toUpperCase()} />
                        <Badge text={label(order.status)} active={order.status !== "cancelled"} />
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{brand?.name ?? "Unknown brand"} · {order.customer_name || "Guest"}</p>
                      <p className="mt-1 text-xs text-slate-400">{new Date(order.created_at).toLocaleString("en-IN")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="mr-2 text-xl font-black">₹{Number(order.grand_total).toFixed(2)}</p>
                      {nextStatus ? (
                        <button onClick={() => updateStatus(order, nextStatus)} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-emerald-500 hover:text-slate-950">
                          Mark {label(nextStatus)}
                        </button>
                      ) : null}
                      {!['completed','cancelled'].includes(order.status) ? (
                        <button onClick={() => updateStatus(order, "cancelled")} className="h-10 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600 hover:bg-red-50">Cancel</button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}

function label(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p>{note ? <p className="mt-2 text-xs text-slate-400">{note}</p> : null}</div>;
}

function Badge({ text, active = true }: { text: string; active?: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{text}</span>;
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500">{children}</select></label>;
}
