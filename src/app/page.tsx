"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: string;
};

type OrderRow = {
  grand_total: number | string | null;
  status: string | null;
  created_at: string;
};

const DAILY_TARGET = 5000;

const navigation: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "▦" },
  { label: "Orders", href: "/orders", icon: "▣" },
  { label: "Billing POS", href: "/pos", icon: "▤" },
  { label: "Locations", href: "/locations", icon: "⌖" },
  { label: "Brands", href: "/brands", icon: "◆" },
  { label: "Menu", href: "/menu", icon: "☰" },
  { label: "Inventory", href: "/inventory", icon: "◫" },
  { label: "Purchases", href: "/purchases", icon: "🛒" },
  { label: "CRM", href: "/crm", icon: "◎" },
  { label: "Finance", href: "/reports/daily", icon: "₹" },
  { label: "Marketplace", href: "/marketplace", icon: "◉" },
  { label: "Outlet Analysis", href: "/marketplace/outlets", icon: "◌" },
  { label: "Item Suggestions", href: "/marketplace/outlets/suggestions", icon: "✦" },
  { label: "Marketplace Integrations", href: "/integrations/marketplaces", icon: "↔" },
  { label: "Platform Logins", href: "/integrations/platform-logins", icon: "⇥" },
  { label: "Instagram & GMB", href: "/integrations/social", icon: "◎" },
  { label: "Settings", href: "/settings", icon: "⚙" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function startOfTodayIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00+05:30`).toISOString();
}

function startOfMonthIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-01T00:00:00+05:30`).toISOString();
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [todaySales, setTodaySales] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [loadingSales, setLoadingSales] = useState(true);
  const [salesError, setSalesError] = useState("");

  const filteredNavigation = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return navigation;
    return navigation.filter((item) => item.label.toLowerCase().includes(term));
  }, [query]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void loadSales();
    const refresh = window.setInterval(() => void loadSales(), 8000);
    return () => window.clearInterval(refresh);
  }, []);

  async function loadSales() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      setSalesError("Supabase environment variables are missing.");
      setLoadingSales(false);
      return;
    }

    try {
      setSalesError("");
      const response = await fetch(
        `${url}/rest/v1/orders?select=grand_total,status,created_at&created_at=gte.${encodeURIComponent(startOfMonthIso())}&order=created_at.asc`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
          cache: "no-store",
        },
      );

      if (!response.ok) throw new Error(await response.text());

      const rows = (await response.json()) as OrderRow[];
      const validRows = rows.filter((order) => order.status?.toLowerCase() !== "cancelled");
      const todayStart = new Date(startOfTodayIso()).getTime();

      const todayRows = validRows.filter((order) => new Date(order.created_at).getTime() >= todayStart);
      setTodayOrders(todayRows.length);
      setTodaySales(todayRows.reduce((sum, order) => sum + Number(order.grand_total || 0), 0));
      setMonthSales(validRows.reduce((sum, order) => sum + Number(order.grand_total || 0), 0));
    } catch (error) {
      setSalesError(error instanceof Error ? error.message : "Unable to load sales.");
    } finally {
      setLoadingSales(false);
    }
  }

  const progress = Math.min(100, (todaySales / DAILY_TARGET) * 100);
  const balance = Math.max(0, DAILY_TARGET - todaySales);
  const daysElapsed = Number(
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric" }).format(now),
  );
  const cumulativeTarget = DAILY_TARGET * daysElapsed;
  const cumulativeProgress = cumulativeTarget > 0 ? (monthSales / cumulativeTarget) * 100 : 0;

  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);

  const timeLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);

  const cards = [
    { title: "Today's Sales", value: loadingSales ? "Loading..." : money(todaySales), note: `${todayOrders} completed orders` },
    { title: "Daily Target", value: money(DAILY_TARGET), note: balance > 0 ? `${money(balance)} remaining` : "Target achieved" },
    { title: "Cumulative Sales", value: loadingSales ? "Loading..." : money(monthSales), note: `Month-to-date actual` },
    { title: "Cumulative Target", value: money(cumulativeTarget), note: `${daysElapsed} day target` },
  ];

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-white transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">Takshvi</p>
          <h1 className="mt-1 text-xl font-black">Restaurant OS AI</h1>
        </div>

        <div className="p-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a module..."
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
          />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-5">
          {filteredNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 transition hover:bg-emerald-400 hover:text-slate-950"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="min-h-screen lg:ml-72">
        <header className="sticky top-0 z-30 flex min-h-20 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-7">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 lg:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-500">Home / Dashboard</p>
            <h2 className="text-xl font-black md:text-2xl">Business Overview</h2>
          </div>
          <div className="rounded-2xl bg-slate-950 px-4 py-3 text-right text-white shadow-sm">
            <p className="text-xs font-bold text-emerald-400">{dateLabel}</p>
            <p className="mt-1 text-xl font-black tabular-nums">{timeLabel}</p>
          </div>
        </header>

        <div className="space-y-7 p-4 md:p-7">
          <section className="rounded-3xl bg-gradient-to-r from-emerald-400 to-teal-300 p-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-emerald-950/60">Daily Revenue Target</p>
                <h3 className="mt-2 text-3xl font-black md:text-4xl">{money(DAILY_TARGET)} per day</h3>
                <p className="mt-3 font-semibold text-emerald-950/70">
                  Actual: {money(todaySales)} · Remaining: {money(balance)} · Achievement: {progress.toFixed(1)}%
                </p>
              </div>
              <div className="min-w-72 rounded-2xl bg-white/55 p-5 backdrop-blur">
                <div className="flex items-center justify-between text-sm font-black">
                  <span>Today&apos;s progress</span>
                  <span>{progress.toFixed(1)}%</span>
                </div>
                <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-950/10">
                  <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-3 text-xs font-bold text-emerald-950/70">Auto-refreshes every 8 seconds</p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article key={card.title} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-slate-500">{card.title}</p>
                <p className="mt-3 text-3xl font-black">{card.value}</p>
                <p className="mt-2 text-xs font-semibold text-slate-400">{card.note}</p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-emerald-400">Cumulative Performance</p>
                <h3 className="mt-2 text-2xl font-black">{money(monthSales)} actual vs {money(cumulativeTarget)} target</h3>
                <p className="mt-2 text-sm text-slate-400">Month-to-date achievement: {cumulativeProgress.toFixed(1)}%</p>
              </div>
              <div className="w-full max-w-md">
                <div className="h-4 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.min(100, cumulativeProgress)}%` }}
                  />
                </div>
                <p className="mt-2 text-right text-xs font-bold text-slate-400">
                  {monthSales >= cumulativeTarget
                    ? `${money(monthSales - cumulativeTarget)} above target`
                    : `${money(cumulativeTarget - monthSales)} below target`}
                </p>
              </div>
            </div>
          </section>

          {salesError ? (
            <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{salesError}</p>
          ) : null}

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <ModuleCard href="/marketplace" title="Marketplace Uploads" description="Upload Zomato, Swiggy and Petpooja reports." />
            <ModuleCard href="/marketplace/outlets" title="Outlet Analysis" description="See outlet-wise sales, payout, AOV and item analysis." />
            <ModuleCard href="/marketplace/outlets/suggestions" title="Item Suggestions" description="Review top items and ready menu descriptions." />
            <ModuleCard href="/integrations/marketplaces" title="Marketplace Integrations" description="Configure Zomato, Swiggy and Petpooja connections." />
            <ModuleCard href="/integrations/platform-logins" title="Platform Logins" description="Open official partner portals directly." />
            <ModuleCard href="/integrations/social" title="Instagram & GMB" description="Manage social and Google Business connections." />
          </section>
        </div>
      </section>
    </main>
  );
}

function ModuleCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-xl font-black text-emerald-700">↗</div>
      <h3 className="mt-5 text-xl font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </Link>
  );
}
