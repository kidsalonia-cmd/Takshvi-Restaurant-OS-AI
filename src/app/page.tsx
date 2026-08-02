"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: string;
};

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

const cards = [
  { title: "Today's Sales", value: "₹0", note: "All locations" },
  { title: "Today's Orders", value: "0", note: "POS, Zomato and Swiggy" },
  { title: "Average Order Value", value: "₹0", note: "Company-wide" },
  { title: "Inventory Value", value: "₹0", note: "Live stock value" },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNavigation = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return navigation;
    return navigation.filter((item) => item.label.toLowerCase().includes(term));
  }, [query]);

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
        <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-7">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 lg:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div>
            <p className="text-xs font-bold text-slate-500">Home / Dashboard</p>
            <h2 className="text-xl font-black md:text-2xl">Business Overview</h2>
          </div>
        </header>

        <div className="space-y-7 p-4 md:p-7">
          <section className="rounded-3xl bg-gradient-to-r from-emerald-400 to-teal-300 p-7">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-emerald-950/60">Unified command centre</p>
            <h3 className="mt-2 text-3xl font-black md:text-4xl">Takshvi Restaurant OS AI</h3>
            <p className="mt-3 max-w-3xl font-semibold text-emerald-950/70">
              Manage billing, orders, inventory, Zomato, Swiggy, Petpooja, Instagram and Google Business Profile from one dashboard.
            </p>
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
