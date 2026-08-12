"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type MenuItem = { id: string; name: string; sku: string; base_price: number };
type Line = { menuItemId: string; quantity: number };

function today() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }

export default function DayCloseOnlineOrdersPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [platform, setPlatform] = useState("zomato");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [attachment, setAttachment] = useState<File | null>(null);
  const [lines, setLines] = useState<Line[]>([{ menuItemId: "", quantity: 1 }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void loadMasters(); }, []);
  useEffect(() => {
    const available = brands.filter((brand) => brand.location_id === locationId);
    setBrandId((current) => available.some((brand) => brand.id === current) ? current : available[0]?.id || "");
  }, [locationId, brands]);
  useEffect(() => { if (locationId && brandId) void loadItems(locationId, brandId); }, [locationId, brandId]);

  const visibleBrands = useMemo(() => brands.filter((brand) => brand.location_id === locationId), [brands, locationId]);

  async function loadMasters() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Supabase environment variables are missing.");
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const [locationRes, brandRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers, cache: "no-store" }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      const locationRows = await locationRes.json() as Location[];
      setLocations(locationRows);
      setBrands(await brandRes.json() as Brand[]);
      setLocationId(locationRows[0]?.id || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load setup."); }
  }

  async function loadItems(location: string, brand: string) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const response = await fetch(`${url}/rest/v1/menu_items?location_id=eq.${location}&brand_id=eq.${brand}&is_active=eq.true&available_on_pos=eq.true&select=id,name,sku,base_price&order=name.asc`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      setItems(await response.json() as MenuItem[]);
      setLines([{ menuItemId: "", quantity: 1 }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load menu items."); }
  }

  function updateLine(index: number, patch: Partial<Line>) { setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line)); }
  function addLine() { setLines((current) => [...current, { menuItemId: "", quantity: 1 }]); }
  function removeLine(index: number) { setLines((current) => current.length === 1 ? current : current.filter((_, i) => i !== index)); }

  async function submit() {
    setError(""); setMessage("");
    if (!attachment) return setError("Attach the online bill PDF or take a camera photo first.");
    if (!orderNumber.trim()) return setError("Enter the Zomato/Swiggy order number.");
    const sold = lines.filter((line) => line.menuItemId && Number(line.quantity) > 0);
    if (!sold.length) return setError("Add at least one sold menu item.");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("locationId", locationId);
      form.append("brandId", brandId);
      form.append("platform", platform);
      form.append("orderNumber", orderNumber.trim());
      form.append("orderDate", orderDate);
      form.append("lines", JSON.stringify(sold));
      form.append("attachment", attachment);
      const response = await fetch("/api/online-orders/day-close", { method: "POST", body: form });
      const data = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to post online order.");
      setMessage(data.message || "Online order posted and inventory reduced.");
      setOrderNumber(""); setAttachment(null); setLines([{ menuItemId: "", quantity: 1 }]);
      const input = document.getElementById("bill-attachment") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to post online order."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="rounded-3xl bg-slate-950 p-6 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">Day Close</p><h1 className="mt-1 text-3xl font-black">Zomato / Swiggy Orders</h1></div>
            <Link href="/marketplace" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-black">← Marketplace</Link>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">Upload the platform bill as PDF/photo, confirm the sold menu items, then post once. Inventory is reduced using the configured recipe and wastage.</p>
        </header>

        <section className="rounded-3xl bg-white p-5 shadow-sm md:p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-black">Location<select value={locationId} onChange={(e)=>setLocationId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-3">{locations.map((row)=><option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}</select></label>
            <label className="text-sm font-black">Brand<select value={brandId} onChange={(e)=>setBrandId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-3">{visibleBrands.map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="text-sm font-black">Platform<select value={platform} onChange={(e)=>setPlatform(e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-3"><option value="zomato">Zomato</option><option value="swiggy">Swiggy</option></select></label>
            <label className="text-sm font-black">Order date<input type="date" value={orderDate} onChange={(e)=>setOrderDate(e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-3" /></label>
            <label className="text-sm font-black md:col-span-2">Online order number<input value={orderNumber} onChange={(e)=>setOrderNumber(e.target.value)} placeholder="Enter exact Zomato/Swiggy order ID" className="mt-2 h-12 w-full rounded-xl border px-3" /></label>
          </div>

          <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-300 p-5">
            <p className="font-black">Bill attachment</p><p className="mt-1 text-sm text-slate-500">PDF, JPG, PNG or WEBP. On mobile, use Take Photo to open the rear camera.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl bg-slate-900 px-4 py-3 text-center font-black text-white">Upload PDF / Image<input id="bill-attachment" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e)=>setAttachment(e.target.files?.[0] || null)} className="hidden" /></label>
              <label className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-3 text-center font-black text-white">📷 Take Photo<input type="file" accept="image/*" capture="environment" onChange={(e)=>setAttachment(e.target.files?.[0] || null)} className="hidden" /></label>
            </div>
            {attachment ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Attached: {attachment.name || "Camera photo"}</p> : null}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Sold items</h2><p className="text-sm text-slate-500">Confirm items from the attached online bill.</p></div><button type="button" onClick={addLine} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black">+ Add item</button></div>
          <div className="mt-4 space-y-3">
            {lines.map((line,index)=><div key={index} className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-[1fr_120px_44px]"><select value={line.menuItemId} onChange={(e)=>updateLine(index,{menuItemId:e.target.value})} className="h-12 rounded-xl border px-3"><option value="">Select menu item</option>{items.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.sku} · ₹{Number(item.base_price).toFixed(0)}</option>)}</select><input type="number" min="1" step="1" value={line.quantity} onChange={(e)=>updateLine(index,{quantity:Math.max(1,Number(e.target.value)||1)})} className="h-12 rounded-xl border px-3" aria-label="Quantity"/><button type="button" onClick={()=>removeLine(index)} className="h-12 rounded-xl border font-black">×</button></div>)}
          </div>
        </section>

        {error ? <div className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-800">✓ {message}</div> : null}
        <button disabled={busy || !brandId} onClick={submit} className="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-lg font-black text-white disabled:bg-slate-400">{busy ? "Posting order…" : "Post Order & Reduce Inventory"}</button>
      </div>
    </main>
  );
}
