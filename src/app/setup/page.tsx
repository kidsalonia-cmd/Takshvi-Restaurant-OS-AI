const setupSteps = [
  {
    title: "Company profile",
    description: "Add legal business name, GSTIN, PAN, support contact and operating timezone.",
    status: "Ready to configure",
    href: "/setup/company",
  },
  {
    title: "First restaurant location",
    description: "Create the Gurugram kitchen, billing identity, address and operating hours.",
    status: "Pending company",
    href: "#",
  },
  {
    title: "Brands",
    description: "Create every food brand and map each brand to the correct location.",
    status: "Pending location",
    href: "#",
  },
  {
    title: "Team and permissions",
    description: "Invite managers, cashiers, kitchen staff and inventory users with limited access.",
    status: "Foundation available",
    href: "/access-control",
  },
  {
    title: "Tax and payment masters",
    description: "Configure GST, service charges, cash, UPI, cards and platform settlement methods.",
    status: "Planned",
    href: "#",
  },
  {
    title: "Integration readiness",
    description: "Prepare Petpooja, Zomato and Swiggy location mappings for the integration phase.",
    status: "Planned",
    href: "#",
  },
];

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 rounded-3xl bg-slate-950 p-7 text-white md:flex-row md:items-center md:justify-between md:p-10">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-400">Foundation setup</p>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">Launch Takshvi Restaurant OS correctly.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              Complete the company, location, brand and team masters before live orders and inventory are activated.
            </p>
          </div>
          <div className="min-w-48 rounded-2xl bg-white/5 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Foundation progress</p>
            <p className="mt-2 text-4xl font-black text-emerald-400">20%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/5 rounded-full bg-emerald-400" />
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {setupSteps.map((step, index) => (
            <a
              key={step.title}
              href={step.href}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
                  {index + 1}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  {step.status}
                </span>
              </div>
              <h2 className="mt-5 text-xl font-black group-hover:text-emerald-600">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{step.description}</p>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
