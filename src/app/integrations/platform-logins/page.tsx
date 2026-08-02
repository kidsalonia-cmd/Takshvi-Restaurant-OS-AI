import Link from "next/link";

const portals = [
  {
    name: "Petpooja",
    action: "Login to Petpooja",
    url: "https://billing.petpooja.com/users/dashboard",
    description: "Open the Petpooja billing and back-office dashboard.",
    badge: "POS & Reports",
  },
  {
    name: "Zomato",
    action: "Open Zomato Partner",
    url: "https://www.zomato.com/partners/login",
    description: "Open the Zomato Restaurant Partner portal.",
    badge: "Orders & Payouts",
  },
  {
    name: "Swiggy",
    action: "Open Swiggy Partner",
    url: "https://partner.swiggy.com/food/",
    description: "Open the Swiggy Restaurant Partner portal.",
    badge: "Orders & Payouts",
  },
];

export default function PlatformLoginsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">
            Partner Portals
          </p>
          <h1 className="mt-2 text-3xl font-black">Platform Login Center</h1>
          <p className="mt-3 text-sm text-slate-300">
            Open Petpooja, Zomato and Swiggy partner dashboards directly from Takshvi.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/integrations/marketplaces"
              className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"
            >
              Connector Settings
            </Link>
            <Link
              href="/marketplace"
              className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950"
            >
              Upload Reports
            </Link>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          {portals.map((portal) => (
            <article key={portal.name} className="rounded-3xl bg-white p-6 shadow-sm">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {portal.badge}
              </span>
              <h2 className="mt-4 text-2xl font-black">{portal.name}</h2>
              <p className="mt-2 min-h-12 text-sm text-slate-500">{portal.description}</p>
              <a
                href={portal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex h-12 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-emerald-500 hover:text-slate-950"
              >
                {portal.action} ↗
              </a>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          These buttons open the official partner portals in a new browser tab. They do not share passwords with Takshvi. Live order and payout synchronization still requires approved API, webhook or partner credentials.
        </section>
      </div>
    </main>
  );
}
