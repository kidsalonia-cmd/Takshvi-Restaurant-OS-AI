const stats = [
  { label: "Today's Sales", value: "₹0", note: "All locations" },
  { label: "Today's Orders", value: "0", note: "Zomato, Swiggy & POS" },
  { label: "Average Order Value", value: "₹0", note: "Company-wide" },
  { label: "Inventory Value", value: "₹0", note: "Centralized stock" },
];

const locations = [
  { name: "Location 1", brands: 8, orders: 0, sales: "₹0", status: "Active" },
  { name: "New Location", brands: 0, orders: 0, sales: "₹0", status: "Setup pending" },
];

const navigation = [
  "Dashboard",
  "Orders",
  "Billing POS",
  "Locations",
  "Brands",
  "Menu",
  "Inventory",
  "Purchases",
  "CRM",
  "Finance",
  "Integrations",
  "AI Growth",
  "Settings",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-slate-950 px-5 py-6 lg:block">
          <div className="mb-8 rounded-2xl bg-emerald-500 p-4 text-slate-950">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">Takshvi</p>
            <h1 className="mt-1 text-xl font-black">Restaurant OS AI</h1>
            <p className="mt-2 text-xs font-medium text-emerald-950/70">Enterprise Command Center</p>
          </div>

          <nav className="space-y-1">
            {navigation.map((item, index) => (
              <button
                key={item}
                className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                  index === 0
                    ? "bg-white text-slate-950"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 bg-slate-100 text-slate-950">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="text-sm font-semibold text-emerald-600">Friday, 31 July 2026</p>
              <h2 className="text-2xl font-black tracking-tight">Business Overview</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <select className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm outline-none">
                <option>All Locations</option>
                <option>Location 1</option>
                <option>New Location</option>
              </select>
              <button className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-bold text-white shadow-sm">
                + Add Location
              </button>
            </div>
          </header>

          <div className="space-y-8 p-5 md:p-8">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
                  <p className="mt-3 text-3xl font-black tracking-tight">{stat.value}</p>
                  <p className="mt-2 text-xs font-medium text-slate-400">{stat.note}</p>
                </article>
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-600">Multi-location control</p>
                    <h3 className="text-xl font-black">Location Performance</h3>
                  </div>
                  <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">View all</button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                        <th className="pb-3">Location</th>
                        <th className="pb-3">Brands</th>
                        <th className="pb-3">Orders</th>
                        <th className="pb-3">Sales</th>
                        <th className="pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.map((location) => (
                        <tr key={location.name} className="border-b border-slate-100 last:border-0">
                          <td className="py-4 font-bold">{location.name}</td>
                          <td className="py-4 text-slate-600">{location.brands}</td>
                          <td className="py-4 text-slate-600">{location.orders}</td>
                          <td className="py-4 font-bold">{location.sales}</td>
                          <td className="py-4">
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                              {location.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm">
                <p className="text-sm font-semibold text-emerald-400">AI Command Center</p>
                <h3 className="mt-1 text-xl font-black">System Readiness</h3>
                <div className="mt-6 space-y-4">
                  {[
                    ["Foundation", "In progress"],
                    ["Orders & POS", "Planned"],
                    ["Central Inventory", "Planned"],
                    ["Zomato Integration", "Planned"],
                    ["Swiggy Integration", "Planned"],
                    ["Petpooja Migration", "Planned"],
                  ].map(([name, status]) => (
                    <div key={name} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                      <span className="text-sm font-semibold">{name}</span>
                      <span className="text-xs font-bold text-emerald-400">{status}</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              {[
                {
                  title: "Orders",
                  value: "Central + Location-wise",
                  detail: "All Zomato, Swiggy, POS and direct orders will appear in one live dashboard.",
                },
                {
                  title: "Inventory",
                  value: "Shared + Location-wise",
                  detail: "Recipe consumption will deduct stock automatically from the correct kitchen location.",
                },
                {
                  title: "Expansion",
                  value: "Clone-ready",
                  detail: "Create a new location by copying brands, menus, recipes, tax and printer settings.",
                },
              ].map((card) => (
                <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-bold text-emerald-600">{card.title}</p>
                  <h3 className="mt-2 text-lg font-black">{card.value}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{card.detail}</p>
                </article>
              ))}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
