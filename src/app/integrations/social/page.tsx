"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SocialState = {
  instagramProfile: string;
  googleBusinessProfile: string;
};

const STORAGE_KEY = "takshvi-social-integrations";
const DEFAULT_STATE: SocialState = {
  instagramProfile: "",
  googleBusinessProfile: "",
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
    setMessage("Profile links saved. Login remains active in the official platform tab.");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Social Growth Center</p>
          <h1 className="mt-2 text-3xl font-black">Instagram & Google Business Profile</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            Open each official dashboard once. This page no longer asks you to log in twice or falsely marks an account as API-connected.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Main Dashboard</Link>
            <Link href="/integrations/marketplaces" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-black">Marketplace Integrations</Link>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-pink-600">Instagram</p>
            <h2 className="mt-1 text-2xl font-black">Instagram Business</h2>
            <p className="mt-2 text-sm text-slate-500">Use your Instagram/Facebook account in Meta Business Suite.</p>

            <a
              href="https://business.facebook.com/latest/home"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 block rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 px-5 py-4 text-center font-black text-white"
            >
              Open Meta Business Suite
            </a>

            <a
              href="https://www.instagram.com/accounts/login/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-xl border px-5 py-3 text-center font-black"
            >
              Open Instagram Login
            </a>

            <input
              value={state.instagramProfile}
              onChange={(event) => setState((current) => ({ ...current, instagramProfile: event.target.value }))}
              placeholder="Instagram profile URL or username"
              className="mt-4 h-12 w-full rounded-xl border px-4"
            />
          </article>

          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-blue-600">Google</p>
            <h2 className="mt-1 text-2xl font-black">Google Business Profile</h2>
            <p className="mt-2 text-sm text-slate-500">Use the Google account that owns or manages the business profile.</p>

            <a
              href="https://business.google.com/locations"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 block rounded-xl bg-blue-600 px-5 py-4 text-center font-black text-white"
            >
              Open Google Business Profile
            </a>

            <a
              href="https://accounts.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-xl border px-5 py-3 text-center font-black"
            >
              Open Google Account Login
            </a>

            <input
              value={state.googleBusinessProfile}
              onChange={(event) => setState((current) => ({ ...current, googleBusinessProfile: event.target.value }))}
              placeholder="Google Business Profile URL"
              className="mt-4 h-12 w-full rounded-xl border px-4"
            />
          </article>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Save profile links</h2>
          <p className="mt-2 text-sm text-slate-500">Saving links does not store passwords or create an API connection.</p>
          <button type="button" onClick={save} className="mt-5 h-12 w-full rounded-xl bg-slate-950 font-black text-white">
            Save Profile Links
          </button>
          {message ? <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</p> : null}
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <b>Important:</b> Logging in opens the official dashboard only. Automatic posting, review replies and analytics inside Takshvi require Meta OAuth and Google Business Profile OAuth credentials.
        </section>
      </div>
    </main>
  );
}
