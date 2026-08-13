export default function CustomerReportsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Customer Reports</p>
          <h1 className="mt-2 text-3xl font-black">Customer Master & History</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
            Download customer names, phone numbers, visit count, lifetime sales, discounts and last visit from billing history.
          </p>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Customer Excel Report</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Generated from saved POS customer details.</p>
            </div>
            <a
              href="/api/customers/export"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow hover:bg-blue-700"
            >
              Download Customers Excel
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
