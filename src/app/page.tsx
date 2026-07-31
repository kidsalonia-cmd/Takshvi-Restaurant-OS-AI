"use client";

import { useEffect, useMemo, useState } from "react";

type IconName =
  | "dashboard"
  | "orders"
  | "pos"
  | "locations"
  | "brands"
  | "menu"
  | "inventory"
  | "purchases"
  | "crm"
  | "finance"
  | "integrations"
  | "ai"
  | "settings";

const stats = [
  { label: "Today's Sales", value: "₹0", note: "All locations", trend: "+0%" },
  { label: "Today's Orders", value: "0", note: "Zomato, Swiggy & POS", trend: "+0%" },
  { label: "Average Order Value", value: "₹0", note: "Company-wide", trend: "+0%" },
  { label: "Inventory Value", value: "₹0", note: "Centralized stock", trend: "Live" },
];

const locations = [
  { name: "Location 1", city: "Gurugram", brands: 8, orders: 0, sales: "₹0", status: "Active" },
  { name: "New Location", city: "Setup pending", brands: 0, orders: 0, sales: "₹0", status: "Setup pending" },
];

const navigation: { label: string; icon: IconName; badge?: string }[] = [
  { label: "Dashboard", icon: "dashboard" },
  { label: "Orders", icon: "orders", badge: "0" },
  { label: "Billing POS", icon: "pos" },
  { label: "Locations", icon: "locations" },
  { label: "Brands", icon: "brands" },
  { label: "Menu", icon: "menu" },
  { label: "Inventory", icon: "inventory" },
  { label: "Purchases", icon: "purchases" },
  { label: "CRM", icon: "crm" },
  { label: "Finance", icon: "finance" },
  { label: "Integrations", icon: "integrations" },
  { label: "AI Growth", icon: "ai" },
  { label: "Settings", icon: "settings" },
];

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    orders: <><path d="M6 3h12l2 4H4l2-4Z"/><path d="M5 7v14h14V7"/><path d="M9 11h6M9 15h6"/></>,
    pos: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 8h4M7 12h2M14 8h3M14 12h3"/></>,
    locations: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
    brands: <><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3M4 11h16M9 15h6"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="1"/><circle cx="7" cy="12" r="1"/><circle cx="7" cy="18" r="1"/></>,
    inventory: <><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="m3 7 9 4 9-4v10l-9 4-9-4V7Z"/><path d="M12 11v10"/></>,
    purchases: <><path d="M3 5h2l2 11h10l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></>,
    crm: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 6"/></>,
    finance: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
    integrations: <><path d="M8 12h8M12 8v8"/><path d="M7 3h3v4H7a5 5 0 0 0 0 10h3v4H7A9 9 0 0 1 7 3ZM17 3h-3v4h3a5 5 0 0 1 0 10h-3v4h3a9 9 0 0 0 0-18Z"/></>,
    ai: <><path d="M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4a1.7 1.7 0 0 0 1-1.6V2h4v.4A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("Dashboard");
  const [dark, setDark] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("takshvi-theme");
    if (saved === "dark") setDark(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("takshvi-theme", dark ? "dark" : "light");
  }, [dark]);

  const filteredNavigation = useMemo(
    () => navigation.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const shell = dark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-950";
  const panel = dark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const muted = dark ? "text-slate-400" : "text-slate-500";

  return (
    <main className={`min-h-screen ${shell}`}>
      {sidebarOpen && <button aria-label="Close menu" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 bg-slate-950 text-white transition-all duration-300 ${collapsed ? "w-24" : "w-72"} ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <div className={`min-w-0 ${collapsed ? "hidden" : "block"}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Takshvi</p>
            <h1 className="truncate text-lg font-black">Restaurant OS AI</h1>
          </div>
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-400 font-black text-slate-950 ${collapsed ? "mx-auto" : ""}`}>T</div>
        </div>

        <div className="px-4 py-4">
          {!collapsed && (
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a module..." className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" />
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {filteredNavigation.map((item) => (
            <button key={item.label} onClick={() => { setActive(item.label); setSidebarOpen(false); }} title={collapsed ? item.label : undefined} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active === item.label ? "bg-emerald-400 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
              {!collapsed && item.badge && <span className={`rounded-full px-2 py-0.5 text-[10px] ${active === item.label ? "bg-slate-950/10" : "bg-white/10"}`}>{item.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button onClick={() => setCollapsed(!collapsed)} className="hidden w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-3 text-xs font-bold text-slate-300 hover:bg-white/10 lg:flex">
            <span>{collapsed ? "→" : "←"}</span>{!collapsed && "Collapse sidebar"}
          </button>
        </div>
      </aside>

      <section className={`min-h-screen transition-all duration-300 ${collapsed ? "lg:ml-24" : "lg:ml-72"}`}>
        <header className={`sticky top-0 z-30 flex h-20 items-center gap-3 border-b px-4 backdrop-blur-xl md:px-7 ${dark ? "border-white/10 bg-slate-950/90" : "border-slate-200 bg-white/90"}`}>
          <button onClick={() => setSidebarOpen(true)} className={`grid h-11 w-11 place-items-center rounded-xl border lg:hidden ${dark ? "border-white/10" : "border-slate-200"}`} aria-label="Open menu">☰</button>

          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold ${muted}`}>Home / {active}</p>
            <h2 className="truncate text-xl font-black md:text-2xl">{active === "Dashboard" ? "Business Overview" : active}</h2>
          </div>

          <div className="hidden w-full max-w-sm items-center md:flex">
            <div className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
              <span className={muted}>⌕</span>
              <input placeholder="Search orders, customers, items..." className="w-full bg-transparent text-sm outline-none" />
              <kbd className={`rounded px-2 py-1 text-[10px] font-bold ${dark ? "bg-white/10 text-slate-400" : "bg-white text-slate-400"}`}>Ctrl K</kbd>
            </div>
          </div>

          <select className={`hidden rounded-xl border px-3 py-2.5 text-sm font-bold outline-none xl:block ${dark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white"}`}>
            <option>All Locations</option><option>Location 1</option><option>New Location</option>
          </select>

          <button onClick={() => setDark(!dark)} className={`grid h-11 w-11 place-items-center rounded-xl border text-lg ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`} aria-label="Toggle theme">{dark ? "☀" : "☾"}</button>

          <div className="relative">
            <button onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} className={`relative grid h-11 w-11 place-items-center rounded-xl border ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`} aria-label="Notifications">♢<span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></button>
            {notificationsOpen && <div className={`absolute right-0 mt-3 w-80 rounded-2xl border p-4 shadow-2xl ${panel}`}><div className="flex items-center justify-between"><h3 className="font-black">Notifications</h3><span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-600">2 new</span></div><div className="mt-4 space-y-3"><div className={`rounded-xl p-3 ${dark ? "bg-white/5" : "bg-slate-50"}`}><p className="text-sm font-bold">Location setup incomplete</p><p className={`mt-1 text-xs ${muted}`}>Complete tax, printer and kitchen settings.</p></div><div className={`rounded-xl p-3 ${dark ? "bg-white/5" : "bg-slate-50"}`}><p className="text-sm font-bold">Integrations pending</p><p className={`mt-1 text-xs ${muted}`}>Zomato and Swiggy connections are not configured.</p></div></div></div>}
          </div>

          <div className="relative">
            <button onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }} className="flex items-center gap-2 rounded-xl bg-slate-950 px-2 py-2 text-white dark:bg-emerald-400 dark:text-slate-950"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-400 text-xs font-black text-slate-950 dark:bg-slate-950 dark:text-white">RJ</span><span className="hidden text-left xl:block"><span className="block text-xs font-black">Ravindra Jhamb</span><span className="block text-[10px] opacity-60">Super Admin</span></span></button>
            {profileOpen && <div className={`absolute right-0 mt-3 w-56 rounded-2xl border p-2 shadow-2xl ${panel}`}><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-slate-500/10">My profile</button><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-slate-500/10">Company settings</button><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-rose-500 hover:bg-rose-500/10">Sign out</button></div>}
          </div>
        </header>

        <div className="space-y-7 p-4 md:p-7">
          <section className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-emerald-400 to-teal-300 p-6 text-slate-950 md:flex-row md:items-center md:justify-between md:p-8">
            <div><p className="text-sm font-black uppercase tracking-[0.15em] opacity-60">Friday, 31 July 2026</p><h3 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Good evening, Ravindra</h3><p className="mt-2 max-w-2xl text-sm font-semibold opacity-70">Your unified restaurant command center is ready. Complete the foundation setup to activate live operations.</p></div>
            <div className="flex flex-wrap gap-3"><button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">+ Add Location</button><button className="rounded-xl border border-slate-950/20 bg-white/40 px-5 py-3 text-sm font-black">View setup checklist</button></div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => <article key={stat.label} className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${panel}`}><div className="flex items-start justify-between"><p className={`text-sm font-bold ${muted}`}>{stat.label}</p><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">{stat.trend}</span></div><p className="mt-4 text-3xl font-black tracking-tight">{stat.value}</p><p className={`mt-2 text-xs font-semibold ${muted}`}>{stat.note}</p></article>)}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
            <article className={`rounded-2xl border p-5 shadow-sm md:p-6 ${panel}`}>
              <div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-bold text-emerald-500">Multi-location control</p><h3 className="text-xl font-black">Location Performance</h3></div><button className={`rounded-xl border px-4 py-2 text-sm font-black ${dark ? "border-white/10" : "border-slate-200"}`}>View all</button></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className={`border-b text-xs uppercase tracking-wider ${dark ? "border-white/10 text-slate-500" : "border-slate-200 text-slate-400"}`}><th className="pb-3">Location</th><th className="pb-3">Brands</th><th className="pb-3">Orders</th><th className="pb-3">Sales</th><th className="pb-3">Status</th></tr></thead><tbody>{locations.map((location) => <tr key={location.name} className={dark ? "border-b border-white/5 last:border-0" : "border-b border-slate-100 last:border-0"}><td className="py-4"><p className="font-black">{location.name}</p><p className={`text-xs ${muted}`}>{location.city}</p></td><td className={`py-4 font-semibold ${muted}`}>{location.brands}</td><td className={`py-4 font-semibold ${muted}`}>{location.orders}</td><td className="py-4 font-black">{location.sales}</td><td className="py-4"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">{location.status}</span></td></tr>)}</tbody></table></div>
            </article>

            <article className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm ring-1 ring-white/10">
              <div className="flex items-start justify-between"><div><p className="text-sm font-bold text-emerald-400">AI Command Center</p><h3 className="mt-1 text-xl font-black">System Readiness</h3></div><span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-300">12%</span></div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[12%] rounded-full bg-emerald-400" /></div>
              <div className="mt-5 space-y-3">{[["Foundation","In progress"],["Orders & POS","Planned"],["Central Inventory","Planned"],["Zomato Integration","Planned"],["Swiggy Integration","Planned"],["Petpooja Migration","Planned"]].map(([name,status]) => <div key={name} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3"><span className="text-sm font-bold">{name}</span><span className={`text-xs font-black ${status === "In progress" ? "text-amber-300" : "text-emerald-400"}`}>{status}</span></div>)}</div>
            </article>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">{[{title:"Orders",value:"Central + Location-wise",detail:"All Zomato, Swiggy, POS and direct orders will appear in one live dashboard.",icon:"orders" as IconName},{title:"Inventory",value:"Shared + Location-wise",detail:"Recipe consumption will deduct stock automatically from the correct kitchen location.",icon:"inventory" as IconName},{title:"Expansion",value:"Clone-ready",detail:"Create a new location by copying brands, menus, recipes, tax and printer settings.",icon:"locations" as IconName}].map((card) => <article key={card.title} className={`rounded-2xl border p-5 shadow-sm ${panel}`}><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Icon name={card.icon} /></div><p className="mt-5 text-sm font-black text-emerald-500">{card.title}</p><h3 className="mt-1 text-lg font-black">{card.value}</h3><p className={`mt-3 text-sm leading-6 ${muted}`}>{card.detail}</p></article>)}</section>
        </div>
      </section>
    </main>
  );
}
