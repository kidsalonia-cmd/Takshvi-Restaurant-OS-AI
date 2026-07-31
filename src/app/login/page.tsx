"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const demoAccounts = [
  { role: "Super Admin", email: "admin@takshvi.in" },
  { role: "Location Manager", email: "manager@takshvi.in" },
  { role: "Cashier", email: "cashier@takshvi.in" },
  { role: "Kitchen", email: "kitchen@takshvi.in" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@takshvi.in");
  const [password, setPassword] = useState("Takshvi@123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    window.localStorage.setItem(
      "takshvi-demo-session",
      JSON.stringify({ email, role: email.startsWith("admin") ? "super_admin" : "staff" }),
    );
    window.setTimeout(() => router.push("/"), 500);
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-950 md:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[2rem] bg-white shadow-2xl md:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.1fr_.9fr]">
        <section className="relative hidden overflow-hidden bg-emerald-400 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[55px] border-white/20" />
          <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full border-[70px] border-slate-950/10" />

          <div className="relative">
            <p className="text-sm font-black uppercase tracking-[0.28em]">Takshvi</p>
            <h1 className="mt-3 max-w-xl text-5xl font-black leading-tight">One operating system for every restaurant location.</h1>
            <p className="mt-6 max-w-lg text-lg font-semibold text-emerald-950/70">
              Manage orders, billing, brands, inventory, teams and platform integrations from one secure command centre.
            </p>
          </div>

          <div className="relative grid gap-3 sm:grid-cols-2">
            {["Role-based access", "Multi-location control", "Central inventory", "Audit-ready operations"].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-950/10 bg-white/40 p-4 font-bold backdrop-blur">
                ✓ {item}
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-9 lg:hidden">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">Takshvi</p>
              <h1 className="mt-2 text-2xl font-black">Restaurant OS AI</h1>
            </div>

            <p className="text-sm font-bold text-emerald-600">SECURE ACCESS</p>
            <h2 className="mt-2 text-4xl font-black tracking-tight">Welcome back</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">Sign in to continue to your restaurant command centre.</p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Work email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex items-center gap-2 font-semibold text-slate-600">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-emerald-500" /> Remember me
                </label>
                <button type="button" className="font-bold text-emerald-600">Forgot password?</button>
              </div>

              {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p> : null}

              <button
                disabled={loading}
                className="h-12 w-full rounded-xl bg-slate-950 font-black text-white transition hover:bg-emerald-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in securely"}
              </button>
            </form>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Demo role accounts</p>
              <div className="mt-3 space-y-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    onClick={() => setEmail(account.email)}
                    className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:ring-2 hover:ring-emerald-300"
                  >
                    <span className="font-bold">{account.role}</span>
                    <span className="text-slate-500">{account.email}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">Development login only. Production authentication will use encrypted server sessions.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
