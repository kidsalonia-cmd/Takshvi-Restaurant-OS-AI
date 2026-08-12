"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrderRow = { grand_total: number | string | null; status: string | null; created_at: string };
const DAILY_TARGET = 5000;

function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0); }
function startOfTodayIso() { const now = new Date(); const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const v = Object.fromEntries(p.map(x => [x.type, x.value])); return new Date(`${v.year}-${v.month}-${v.day}T00:00:00+05:30`).toISOString(); }
function startOfMonthIso() { const now = new Date(); const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(now); const v = Object.fromEntries(p.map(x => [x.type, x.value])); return new Date(`${v.year}-${v.month}-01T00:00:00+05:30`).toISOString(); }

export default function Home() {
  const [now, setNow] = useState(new Date());
  const [todaySales, setTodaySales] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { void loadSales(); const refresh = window.setInterval(() => void loadSales(), 8000); return () => window.clearInterval(refresh); }, []);

  async function loadSales() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setError("Supabase environment variables are missing."); setLoading(false); return; }
    try {
      setError("");
      const response = await fetch(`${url}/rest/v1/orders?select=grand_total,status,created_at&created_at=gte.${encodeURIComponent(startOfMonthIso())}&order=created_at.asc`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const rows = (await response.json()) as OrderRow[];
      const valid = rows.filter(x => x.status?.toLowerCase() !== "cancelled");
      const todayStart = new Date(startOfTodayIso()).getTime();
      const today = valid.filter(x => new Date(x.created_at).getTime() >= todayStart);
      setTodayOrders(today.length); setTodaySales(today.reduce((s, x) => s + Number(x.grand_total || 0), 0)); setMonthSales(valid.reduce((s, x) => s + Number(x.grand_total || 0), 0));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load sales."); } finally { setLoading(false); }
  }

  const progress = Math.min(100, (todaySales / DAILY_TARGET) * 100);
  const balance = Math.max(0, DAILY_TARGET - todaySales);
  const daysElapsed = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric" }).format(now));
  const cumulativeTarget = DAILY_TARGET * daysElapsed;
  const cumulativeProgress = cumulativeTarget ? (monthSales / cumulativeTarget) * 100 : 0;
  const dateLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(now);

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950 lg:pb-8">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 pr-14 lg:pr-0">
          <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Takshvi Restaurant OS</p><h1 className="mt-1 truncate text-xl font-black sm:text-2xl">Business Dashboard</h1></div>
          <div className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-right text-white"><p className="text-[10px] font-bold text-emerald-400">{dateLabel}</p><p className="text-sm font-black tabular-nums sm:text-base">{timeLabel}</p></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-5 lg:p-8">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Today Sales" value={loading ? "..." : money(todaySales)} note={`${todayOrders} orders`} />
          <Stat label="Target" value={money(DAILY_TARGET)} note={balance > 0 ? `${money(balance)} left` : "Achieved"} />
          <Stat label="Month Sales" value={loading ? "..." : money(monthSales)} note="Month to date" />
          <Stat label="Month Target" value={money(cumulativeTarget)} note={`${daysElapsed} days`} />
        </section>

        <section className="rounded-3xl bg-emerald-400 p-5 sm:p-7">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-950/60">Today&apos;s target</p><p className="mt-2 text-3xl font-black sm:text-4xl">{progress.toFixed(0)}%</p></div><p className="text-right text-xs font-bold text-emerald-950/70">{money(todaySales)} / {money(DAILY_TARGET)}</p></div>
          <div className="mt-4 h-4 overflow-hidden rounded-full bg-white/50"><div className="h-full rounded-full bg-slate-950" style={{ width: `${progress}%` }} /></div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Quick billing</h2><span className="text-xs font-bold text-slate-400">Tap to open</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Quick href="/pos" icon="▤" title="New Bill" subtitle="Open POS" primary />
            <Quick href="/orders" icon="▣" title="Orders" subtitle="View bills" />
            <Quick href="/inventory" icon="◫" title="Stock" subtitle="Inventory" />
            <Quick href="/purchases" icon="🛒" title="Purchase" subtitle="Add stock" />
          </div>
        </section>

        <section className="rounded-3xl bg-slate-950 p-5 text-white sm:p-6">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-400">Month performance</p><h2 className="mt-2 text-xl font-black">{cumulativeProgress.toFixed(1)}%</h2><p className="mt-1 text-xs text-slate-400">{money(monthSales)} actual vs {money(cumulativeTarget)} target</p></div><div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 border-emerald-400 text-sm font-black">{Math.round(cumulativeProgress)}%</div></div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-black">Operations</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Module href="/recipes" title="Recipes & Cost" text="Food cost, margin and recipe setup." />
            <Module href="/marketplace" title="Marketplace" text="Zomato, Swiggy and Petpooja uploads." />
            <Module href="/marketplace/outlets" title="Outlet Analysis" text="Sales, payout, AOV and outlet performance." />
            <Module href="/reports/daily" title="Finance" text="Daily sales and financial reports." />
            <Module href="/menu" title="Menu" text="Manage items, prices and availability." />
            <Module href="/crm" title="Customers" text="Customer and CRM records." />
          </div>
        </section>

        {error ? <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
      </div>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) { return <article className="min-w-0 rounded-2xl bg-white p-4 shadow-sm"><p className="text-[11px] font-bold text-slate-500 sm:text-sm">{label}</p><p className="mt-2 break-words text-lg font-black sm:text-2xl">{value}</p><p className="mt-1 truncate text-[10px] font-semibold text-slate-400 sm:text-xs">{note}</p></article>; }
function Quick({ href, icon, title, subtitle, primary = false }: { href: string; icon: string; title: string; subtitle: string; primary?: boolean }) { return <Link href={href} className={`min-h-28 rounded-2xl p-4 shadow-sm active:scale-[0.98] ${primary ? "bg-slate-950 text-white" : "bg-white"}`}><span className={`grid h-10 w-10 place-items-center rounded-xl text-lg ${primary ? "bg-emerald-400 text-slate-950" : "bg-emerald-50 text-emerald-700"}`}>{icon}</span><p className="mt-3 text-sm font-black sm:text-base">{title}</p><p className={`mt-1 text-[11px] font-semibold ${primary ? "text-slate-400" : "text-slate-500"}`}>{subtitle}</p></Link>; }
function Module({ href, title, text }: { href: string; title: string; text: string }) { return <Link href={href} className="flex min-h-24 items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm active:scale-[0.99]"><div><h3 className="font-black">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div><span className="text-xl font-black text-emerald-600">›</span></Link>; }
