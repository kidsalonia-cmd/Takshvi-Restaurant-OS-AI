import { ROLE_LABELS, ROLE_PERMISSIONS, USER_ROLES } from "@/lib/auth/roles";

export default function AccessControlPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600">Foundation / Security</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Roles & Permissions</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Initial access-control blueprint for company, location, billing, kitchen, inventory and finance teams.
            </p>
          </div>
          <a href="/" className="rounded-xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white">Back to dashboard</a>
        </div>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {USER_ROLES.map((role) => {
            const permissions = ROLE_PERMISSIONS[role];
            return (
              <article key={role} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-600">System role</p>
                    <h2 className="mt-1 text-xl font-black">{ROLE_LABELS[role]}</h2>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Active</span>
                </div>

                <div className="mt-5 space-y-2">
                  {permissions.includes("*") ? (
                    <div className="rounded-xl bg-slate-950 px-3 py-3 text-sm font-bold text-white">Full platform access</div>
                  ) : (
                    permissions.map((permission) => (
                      <div key={permission} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                        {permission.replaceAll(".", " → ").replaceAll("_", " ")}
                      </div>
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
