"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const navigation = [
  ["Dashboard", "/", "▦"],
  ["Orders", "/orders", "▣"],
  ["Billing POS", "/pos", "▤"],
  ["Locations", "/locations", "⌖"],
  ["Brands", "/brands", "◆"],
  ["Menu", "/menu", "☰"],
  ["Inventory", "/inventory", "◫"],
  ["Purchases", "/purchases", "🛒"],
  ["CRM", "/crm", "◎"],
  ["Finance", "/reports/daily", "₹"],
  ["Marketplace", "/marketplace", "◉"],
  ["Source Files", "/marketplace/files", "⇩"],
  ["Outlet Analysis", "/marketplace/outlets", "◌"],
  ["Item Suggestions", "/marketplace/outlets/suggestions", "✦"],
  ["Marketplace Integrations", "/integrations/marketplaces", "↔"],
  ["Platform Logins", "/integrations/platform-logins", "⇥"],
  ["Instagram & GMB", "/integrations/social", "◎"],
  ["Settings", "/settings", "⚙"],
] as const;

export default function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? navigation.filter(([label]) => label.toLowerCase().includes(term)) : navigation;
  }, [query]);

  // The dashboard already has its own full sidebar.
  if (pathname === "/") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-[70] grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white shadow-xl lg:hidden"
        aria-label="Open navigation"
      >
        ☰
      </button>

      {open ? <button type="button" className="fixed inset-0 z-[75] bg-slate-950/60 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" /> : null}

      <aside className={`fixed inset-y-0 left-0 z-[80] flex w-72 flex-col bg-slate-950 text-white shadow-2xl transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">Takshvi</p>
          <h2 className="mt-1 text-xl font-black">Restaurant OS AI</h2>
        </div>

        <div className="space-y-3 border-b border-white/10 p-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-full items-center gap-3 rounded-xl bg-white/10 px-4 text-left text-sm font-black transition hover:bg-emerald-400 hover:text-slate-950"
          >
            <span>←</span><span>Back</span>
          </button>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a module..."
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
          />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map(([label, href, icon]) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-base">{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="hidden lg:block lg:w-72 lg:shrink-0" aria-hidden="true" />
    </>
  );
}
