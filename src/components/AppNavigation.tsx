"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const navigation = [
  ["Dashboard", "/", "▦"], ["Orders", "/orders", "▣"], ["Billing POS", "/pos", "▤"],
  ["Locations", "/locations", "⌖"], ["Brands", "/brands", "◆"], ["Menu", "/menu", "☰"],
  ["Inventory", "/inventory", "◫"], ["Recipes & Cost", "/recipes", "⚖"], ["Excel Upload", "/bulk-upload", "⇧"], ["Purchases", "/purchases", "🛒"],
  ["CRM", "/crm", "◎"], ["Finance", "/reports/daily", "₹"], ["Customer Report", "/reports/customers", "👤"], ["Marketplace", "/marketplace", "◉"],
  ["Source Files", "/marketplace/files", "⇩"], ["Outlet Analysis", "/marketplace/outlets", "◌"],
  ["Item Suggestions", "/marketplace/outlets/suggestions", "✦"], ["Marketplace Integrations", "/integrations/marketplaces", "↔"],
  ["Platform Logins", "/integrations/platform-logins", "⇥"], ["Instagram & GMB", "/integrations/social", "◎"], ["Cafe Auto Posting", "/integrations/social/autopost", "✦"], ["Cafe Google Scheduler", "/integrations/social/scheduler", "◷"], ["Settings", "/settings", "⚙"],
] as const;

const mobilePrimary = [
  ["Home", "/", "▦"], ["POS", "/pos", "▤"], ["Orders", "/orders", "▣"], ["Stock", "/inventory", "◫"],
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

  if (pathname.startsWith("/cafe-honeyman")) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed right-4 top-4 z-[70] grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white shadow-xl lg:hidden" aria-label="Open navigation">☰</button>
      {open ? <button type="button" className="fixed inset-0 z-[75] bg-slate-950/60 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-[80] flex w-[86vw] max-w-72 flex-col bg-slate-950 text-white shadow-2xl transition-transform lg:w-72 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="border-b border-white/10 px-5 py-5"><p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">Takshvi</p><h2 className="mt-1 text-xl font-black">Restaurant OS AI</h2></div>
        <div className="space-y-3 border-b border-white/10 p-4">
          <button type="button" onClick={() => { router.back(); setOpen(false); }} className="flex h-12 w-full items-center gap-3 rounded-xl bg-white/10 px-4 text-left text-sm font-black"><span>←</span><span>Back</span></button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a module..." className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none placeholder:text-slate-500 focus:border-emerald-400" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 pb-24 lg:pb-4">
          {items.map(([label, href, icon]) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
            return <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-base">{icon}</span><span>{label}</span></Link>;
          })}
        </nav>
      </aside>
      <div className="hidden lg:block lg:w-72 lg:shrink-0" aria-hidden="true" />

      <nav className="fixed inset-x-0 bottom-0 z-[65] grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        {mobilePrimary.map(([label, href, icon]) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return <Link key={href} href={href} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-black ${active ? "bg-emerald-50 text-emerald-700" : "text-slate-500"}`}><span className="text-lg">{icon}</span><span>{label}</span></Link>;
        })}
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-black text-slate-500"><span className="text-lg">☰</span><span>More</span></button>
      </nav>
    </>
  );
}
