"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Report = { id: string; location_id: string | null; brand_id: string | null };
type ItemFact = {
  item_name: string;
  category_name: string | null;
  quantity: number;
  final_total: number;
  gross_sales: number;
  marketplace: string;
};

type Suggestion = {
  name: string;
  category: string;
  quantity: number;
  sales: number;
  action: string;
  reason: string;
  description: string;
};

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function authHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildDescription(name: string, category: string, action: string) {
  const lower = name.toLowerCase();
  let detail = "freshly prepared with quality ingredients and balanced flavours";
  if (lower.includes("chai") || lower.includes("tea")) detail = "freshly brewed for a warm, comforting and aromatic experience";
  else if (lower.includes("coffee")) detail = "crafted with rich coffee flavour for a smooth and refreshing café-style experience";
  else if (lower.includes("waffle")) detail = "freshly baked until golden, crisp outside and soft inside, finished with indulgent toppings";
  else if (lower.includes("burger")) detail = "layered with a flavourful filling, fresh vegetables and creamy sauces in a soft toasted bun";
  else if (lower.includes("sandwich")) detail = "grilled until crisp with a generous savoury filling and café-style seasoning";
  else if (lower.includes("momo")) detail = "steamed to a soft finish with a flavourful filling and served with a punchy dip";
  else if (lower.includes("maggi") || lower.includes("noodle")) detail = "cooked hot and comforting with savoury masala and satisfying flavours";
  else if (lower.includes("juice")) detail = "made fresh for a naturally refreshing and fruity drink";
  else if (lower.includes("shake")) detail = "thick, creamy and chilled for an indulgent refreshment";
  else if (lower.includes("ice cream")) detail = "creamy, chilled and satisfying with a smooth finish";

  const lead = action === "Hero item" ? "A customer favourite" : action === "Promote more" ? "A high-potential menu pick" : "A delicious choice";
  return `${lead}, ${cleanName(name)} is ${detail}. Best enjoyed fresh.`;
}

export default function ItemSuggestionsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [items, setItems] = useState<ItemFact[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadMasters();
  }, []);

  useEffect(() => {
    if (locationId && brandId) void loadItems();
    else setItems([]);
  }, [locationId, brandId]);

  async function loadMasters() {
    try {
      const { url, key } = cfg();
      const [locationRes, brandRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, { headers: authHeaders(key), cache: "no-store" }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, { headers: authHeaders(key), cache: "no-store" }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      setLocations(await locationRes.json());
      setBrands(await brandRes.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load outlets.");
    }
  }

  async function loadItems() {
    setBusy(true);
    setMessage("");
    try {
      const { url, key } = cfg();
      const reportRes = await fetch(
        `${url}/rest/v1/marketplace_reports?select=id&location_id=eq.${locationId}&brand_id=eq.${brandId}`,
        { headers: authHeaders(key), cache: "no-store" },
      );
      if (!reportRes.ok) throw new Error(await reportRes.text());
      const reports = (await reportRes.json()) as Report[];
      if (!reports.length) {
        setItems([]);
        setMessage("No uploaded item reports found for this outlet and brand.");
        return;
      }
      const ids = reports.map((report) => report.id);
      const itemRes = await fetch(
        `${url}/rest/v1/marketplace_item_facts?select=item_name,category_name,quantity,final_total,gross_sales,marketplace&report_id=in.(${ids.join(",")})`,
        { headers: authHeaders(key), cache: "no-store" },
      );
      if (!itemRes.ok) throw new Error(await itemRes.text());
      setItems(await itemRes.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate item suggestions.");
    } finally {
      setBusy(false);
    }
  }

  const visibleBrands = useMemo(
    () => brands.filter((brand) => !locationId || brand.location_id === locationId),
    [brands, locationId],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const grouped = new Map<string, { category: string; quantity: number; sales: number }>();
    items.forEach((item) => {
      const name = cleanName(item.item_name || "Unknown Item");
      const current = grouped.get(name) || { category: item.category_name || "Uncategorised", quantity: 0, sales: 0 };
      current.quantity += n(item.quantity);
      current.sales += n(item.final_total || item.gross_sales);
      if (!current.category && item.category_name) current.category = item.category_name;
      grouped.set(name, current);
    });

    const rows = [...grouped.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.sales - a.sales || b.quantity - a.quantity);

    const maxSales = Math.max(...rows.map((row) => row.sales), 1);
    const maxQty = Math.max(...rows.map((row) => row.quantity), 1);

    return rows.slice(0, 20).map((row, index) => {
      const salesScore = row.sales / maxSales;
      const qtyScore = row.quantity / maxQty;
      let action = "Maintain";
      let reason = "Stable item with useful sales contribution.";
      if (index < 5 || (salesScore > 0.6 && qtyScore > 0.5)) {
        action = "Hero item";
        reason = "Strong quantity and revenue. Keep visible at the top of the online menu and avoid heavy discounting.";
      } else if (salesScore > 0.45 && qtyScore < 0.35) {
        action = "Premium opportunity";
        reason = "Good revenue with lower quantity. Improve photo, description and premium positioning.";
      } else if (qtyScore > 0.45 && salesScore < 0.35) {
        action = "Price review";
        reason = "Good demand but low revenue contribution. Consider a small price increase or profitable add-on.";
      } else if (index < 12) {
        action = "Promote more";
        reason = "Has demand potential. Use a combo, recommendation badge or add-on placement.";
      }

      return {
        ...row,
        action,
        reason,
        description: buildDescription(row.name, row.category, action),
      };
    });
  }, [items]);

  const outletName = locations.find((location) => location.id === locationId)?.name || "Outlet";
  const brandName = brands.find((brand) => brand.id === brandId)?.name || "Brand";

  async function copyDescription(description: string) {
    await navigator.clipboard.writeText(description);
    setMessage("Description copied.");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Menu Intelligence</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Suggested Items & Descriptions</h1>
              <p className="mt-2 text-sm text-slate-300">Outlet-wise recommendations generated from uploaded item sales reports.</p>
            </div>
            <Link href="/marketplace/outlets" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Back to Outlet Analysis</Link>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setBrandId(""); }} className="h-12 rounded-xl border px-3">
            <option value="">Select outlet</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
          </select>
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="h-12 rounded-xl border px-3">
            <option value="">Select brand</option>
            {visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{suggestions.length}</b> suggested items</div>
          <button onClick={() => void loadItems()} disabled={!locationId || !brandId || busy} className="h-12 rounded-xl bg-emerald-500 font-black text-slate-950 disabled:opacity-50">{busy ? "Generating..." : "Refresh Suggestions"}</button>
        </section>

        {message ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p> : null}

        {locationId && brandId ? (
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">{outletName} · {brandName}</h2>
            <p className="mt-1 text-sm text-slate-500">Use these descriptions on Zomato, Swiggy or your own menu after checking ingredients and portion details.</p>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {suggestions.map((item, index) => (
                <article key={item.name} className="rounded-2xl border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-emerald-600">#{index + 1} · {item.category}</p>
                      <h3 className="mt-1 text-xl font-black">{item.name}</h3>
                    </div>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">{item.action}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Metric label="Quantity" value={item.quantity.toFixed(0)} />
                    <Metric label="Sales" value={money(item.sales)} />
                  </div>
                  <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><b>Suggestion:</b> {item.reason}</div>
                  <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    <b>Ready description:</b><br />{item.description}
                  </div>
                  <button onClick={() => void copyDescription(item.description)} className="mt-3 h-10 w-full rounded-xl border font-black hover:bg-slate-50">Copy Description</button>
                </article>
              ))}
            </div>
            {!suggestions.length ? <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Upload a Petpooja or marketplace item report to generate item suggestions and descriptions.</p> : null}
          </section>
        ) : (
          <section className="rounded-3xl bg-white p-8 text-center shadow-sm"><p className="text-slate-500">Select an outlet and brand to generate recommendations.</p></section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}
