"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SocialState = {
  instagramProfile: string;
  googleBusinessProfile: string;
  instagramStatus: "not_connected" | "connected";
  googleStatus: "not_connected" | "connected";
};

const STORAGE_KEY = "takshvi-social-integrations";

const DEFAULT_STATE: SocialState = {
  instagramProfile: "",
  googleBusinessProfile: "",
  instagramStatus: "not_connected",
  googleStatus: "not_connected",
};

export default function SocialIntegrationsPage() {
  const [state, setState] = useState<SocialState>(DEFAULT_STATE);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setState({ ...DEFAULT_STATE, ...(JSON.parse(saved) as Partial<SocialState>) });
    } catch {
      setState(DEFAULT_STATE);
    }
  }, []);

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setMessage("Instagram and Google Business Profile settings saved.");
  }

  function markConnected(platform: "instagram" | "google") {
    setState((current) => ({
      ...current,
      ...(platform === "instagram"
        ? { instagramStatus: "connected" as const }
        : { googleStatus: "connected" as const }),
    }));
    setMessage(`${platform === "instagram" ? "Instagram" : "Google Business Profile"} marked connected.`);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Social Growth Center</p>
          <h1 className="mt-2 text-3xl font-black">Instagram & Google Business Profile</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            Open official dashboards, save profile links, and track connection status from Takshvi Restaurant OS AI.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Main Dashboard</Link>
            <Link href="/integrations/marketplaces" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-black">Marketplace Integrations</Link>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-pink-600">Instagram</p>
                <h2 className="mt-1 text-2xl font-black">Instagram Business</h2>
                <p className="mt-2 text-sm text-slate-500">Open Meta Business Suite and manage posts, reels, messages and insights.</p>
              </div>
              <Status connected={state.instagramStatus === "connected"} />
            </div>

            <a
              href="https://business.facebook.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-5 block rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 px-5 py-4 text-center font-black text-white"
            >
              Login to Instagram / Meta Business Suite
            </a>

            <input
              value={state.instagramProfile}
              onChange={(event) => setState((current) => ({ ...current, instagramProfile: event.target.value }))}
              placeholder="Instagram profile URL or username"
              className="mt-4 h-12 w-full rounded-xl border px-4"
            />

            <button
              type="button"
              onClick={() => markConnected("instagram")}
              className="mt-3 h-11 w-full rounded-xl border font-black"
            >
              Mark Instagram Connected
            </button>
          </article>

          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Google</p>
                <h2 className="mt-1 text-2xl font-black">Google Business Profile</h2>
                <p className="mt-2 text-sm text-slate-500">Manage reviews, photos, posts, profile details and business performance.</p>
              </div>
              <Status connected={state.googleStatus === "connected"} />
            </div>

            <a
              href="https://business.google.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-5 block rounded-xl bg-blue-600 px-5 py-4 text-center font-black text-white"
            >
              Login to Google Business Profile
            </a>

            <input
              value={state.googleBusinessProfile}
              onChange={(event) => setState((current) => ({ ...current, googleBusinessProfile: event.target.value }))}
              placeholder="Google Business Profile URL"
              className="mt-4 h-12 w-full rounded-xl border px-4"
            />

            <button
              type="button"
              onClick={() => markConnected("google")}
              className="mt-3 h-11 w-full rounded-xl border font-black"
            >
              Mark Google Profile Connected
            </button>
          </article>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Connection Summary</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Summary label="Instagram" value={state.instagramProfile || "Profile not added"} connected={state.instagramStatus === "connected"} />
            <Summary label="Google Business" value={state.googleBusinessProfile || "Profile not added"} connected={state.googleStatus === "connected"} />
          </div>
          <button type="button" onClick={save} className="mt-5 h-12 w-full rounded-xl bg-slate-950 font-black text-white">
            Save Social Connections
          </button>
          {message ? <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</p> : null}
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Official automatic posting, review replies and insights require Meta Graph API and Google Business Profile API OAuth credentials. This page adds the dashboard connection center and official login access now.
        </section>
      </div>
    </main>
  );
}

function Status({ connected }: { connected: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

function Summary({ label, value, connected }: { label: string; value: string; connected: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <b>{label}</b>
        <Status connected={connected} />
      </div>
      <p className="mt-2 break-all text-sm text-slate-500">{value}</p>
    </div>
  );
}
