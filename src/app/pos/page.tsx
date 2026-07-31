"use client";

import { useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type MenuItem = { id: string; name: string; sku: string; base_price: number; packaging_charge: number; tax_rate: number; brand_id: string; location_id: string };
type CartLine = MenuItem & { quantity: number };

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

export default function PosPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [orderType, setOrderType] = useState("walk_in");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void loadFoundation(); }, []);
  useEffect(() => { if (locationId) void loadBrands(locationId); }, [locationId]);
  useEffect(() => { if (locationId && brandId) void loadItems(locationId, brandId); }, [locationId, brandId]);

  async function loadFoundation() {
    try {
      const { url, key } = config();
      const companyRes = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, { headers: headers(key), cache: "no-store" });
      if (!companyRes.ok) throw new Error(await companyRes.text());
      const companies = (await companyRes.json()) as Company[];
      if (!companies[0]) throw new Error("Create company profile first.");
      setCompany(companies[0]);

      const locationRes = await fetch(`${url}/rest/v1/locations?company_id=eq.${companies[0].id}&is_active=eq.true&select=id,name,code&order=name.asc`, { headers: headers(key), cache: "no-store" });
      if (!locationRes.ok) throw new Error(await locationRes.text());
      const rows = (await locationRes.json()) as Location[];
      setLocations(rows);
      setLocationId(rows[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load POS setup.");
    }
  }

  async function loadBrands(id: string) {
    try {
      const { url, key } = config();
      const res = await fetch(`${url}/rest/v1/brands?location_id=eq.${id}&is_active=eq.true&select=id,name,location_id&order=name.asc`, { headers: headers(key), cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const rows = (await res.json()) as Brand[];
      setBrands(rows);
      setBrandId(rows[0]?.id ?? "");
      setCart([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load brands.");
    }
  }

  async function loadItems(location: string, brand: string) {
    try {
      const { url, key } = config();
      const res = await fetch(`${url}/rest/v1/menu_items?location_id=eq.${location}&brand_id=eq.${brand}&is_active=eq.true&available_on_pos=eq.true&select=id,name,sku,base_price,packaging_charge,tax_rate,brand_id,location_id&order=name.asc`, { headers: headers(key), cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setItems((await res.json()) as MenuItem[]);
      setCart([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load menu items.");
    }
  }

  function addItem(item: MenuItem) {
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      return existing
        ? current.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { ...item, quantity: 1 }];
    });
  }

  function changeQty(id: string, quantity: number) {
    setCart((current) => quantity <= 0 ? current.filter((line) => line.id !== id) : current.map((line) => line.id === id ? { ...line, quantity } : line));
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q));
  }, [items, search]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, line) => sum + Number(line.base_price) * line.quantity, 0);
    const packaging = cart.reduce((sum, line) => sum + Number(line.packaging_charge) * line.quantity, 0);
    const tax = cart.reduce((sum, line) => sum + ((Number(line.base_price) + Number(line.packaging_charge)) * line.quantity * Number(line.tax_rate)) / 100, 0);
    const grandTotal = Math.max(0, subtotal + packaging + tax - Number(discount || 0));
    return { subtotal, packaging, tax, grandTotal };
  }, [cart, discount]);

  async function createBill() {
    if (!company || !locationId || !brandId || !cart.length) {
      setError("Select a location, brand and at least one menu item.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { url, key } = config();
      const orderNumber = `POS-${Date.now().toString().slice(-10)}`;
      const orderRes = await fetch(`${url}/rest/v1/orders`, {
        method: "POST",
        headers: headers(key, "return=representation"),
        body: JSON.stringify({
          company_id: company.id,
          location_id: locationId,
          brand_id: brandId,
          order_number: orderNumber,
          source: orderType,
          status: "accepted",
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          subtotal: totals.subtotal,
          packaging_amount: totals.packaging,
          discount_amount: Number(discount || 0),
          tax_amount: totals.tax,
          delivery_charge: 0,
          grand_total: totals.grandTotal,
          payment_status: "paid",
          payment_method: paymentMethod,
          accepted_at: new Date().toISOString(),
        }),
      });
      if (!orderRes.ok) throw new Error(await orderRes.text());
      const order = ((await orderRes.json()) as { id: string }[])[0];
      if (!order) throw new Error("Order was not created.");

      const lines = cart.map((line) => ({
        order_id: order.id,
        menu_item_id: line.id,
        item_name: line.name,
        sku: line.sku,
        quantity: line.quantity,
        unit_price: Number(line.base_price),
        packaging_amount: Number(line.packaging_charge) * line.quantity,
        discount_amount: 0,
        tax_amount: ((Number(line.base_price) + Number(line.packaging_charge)) * line.quantity * Number(line.tax_rate)) / 100,
        line_total: (Number(line.base_price) + Number(line.packaging_charge)) * line.quantity * (1 + Number(line.tax_rate) / 100),
      }));
      const lineRes = await fetch(`${url}/rest/v1/order_items`, {
        method: "POST",
        headers: headers(key, "return=minimal"),
        body: JSON.stringify(lines),
      });
      if (!lineRes.ok) throw new Error(await lineRes.text());

      setMessage(`Bill ${orderNumber} created successfully for ₹${totals.grandTotal.toFixed(2)}.`);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create bill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="rounded-3xl bg-slate-950 p-6 text-white">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">Takshvi POS</p>
          <h1 className="mt-1 text-3xl font-black">Fast billing</h1>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-3">
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-12 rounded-xl border px-4">
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
              </select>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-12 rounded-xl border px-4">
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or SKU" className="h-12 rounded-xl border px-4" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <button key={item.id} onClick={() => addItem(item)} className="rounded-2xl bg-white p-5 text-left shadow-sm hover:ring-2 hover:ring-emerald-500">
                  <p className="text-xs font-bold text-slate-500">{item.sku}</p>
                  <h3 className="mt-1 font-black">{item.name}</h3>
                  <p className="mt-3 text-xl font-black text-emerald-700">₹{Number(item.base_price).toFixed(2)}</p>
                </button>
              ))}
              {!filteredItems.length && <p className="rounded-2xl bg-white p-6 text-slate-500">No POS menu items found for this brand.</p>}
            </div>
          </div>

          <aside className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Current bill</h2>
            <div className="mt-4 space-y-3">
              {cart.map((line) => (
                <div key={line.id} className="rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-black">{line.name}</p><p className="text-xs text-slate-500">₹{Number(line.base_price).toFixed(2)} each</p></div>
                    <p className="font-black">₹{(Number(line.base_price) * line.quantity).toFixed(2)}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => changeQty(line.id, line.quantity - 1)} className="h-9 w-9 rounded-lg border font-black">−</button>
                    <span className="min-w-10 text-center font-black">{line.quantity}</span>
                    <button onClick={() => changeQty(line.id, line.quantity + 1)} className="h-9 w-9 rounded-lg border font-black">+</button>
                  </div>
                </div>
              ))}
              {!cart.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Tap menu items to add them.</p>}
            </div>

            <div className="mt-5 grid gap-3">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" className="h-11 rounded-xl border px-3" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Customer phone" className="h-11 rounded-xl border px-3" />
              <div className="grid grid-cols-2 gap-3">
                <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="h-11 rounded-xl border px-3">
                  <option value="walk_in">Walk-in</option><option value="takeaway">Takeaway</option><option value="phone">Phone</option>
                </select>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-11 rounded-xl border px-3">
                  <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="mixed">Mixed</option>
                </select>
              </div>
              <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="Discount ₹" className="h-11 rounded-xl border px-3" />
            </div>

            <div className="mt-5 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><b>₹{totals.subtotal.toFixed(2)}</b></div>
              <div className="flex justify-between"><span>Packaging</span><b>₹{totals.packaging.toFixed(2)}</b></div>
              <div className="flex justify-between"><span>Tax</span><b>₹{totals.tax.toFixed(2)}</b></div>
              <div className="flex justify-between"><span>Discount</span><b>−₹{Number(discount || 0).toFixed(2)}</b></div>
              <div className="flex justify-between pt-2 text-xl"><span className="font-black">Total</span><b>₹{totals.grandTotal.toFixed(2)}</b></div>
            </div>

            <button onClick={createBill} disabled={saving || !cart.length} className="mt-5 h-14 w-full rounded-xl bg-slate-950 font-black text-white hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50">
              {saving ? "Creating bill..." : "Create bill"}
            </button>
            {message && <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</p>}
            {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
          </aside>
        </section>
      </div>
    </main>
  );
}
