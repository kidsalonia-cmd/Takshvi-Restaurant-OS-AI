"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SocialState = {
  instagramName: string;
  instagramUsername: string;
  instagramProfile: string;
  instagramImage: string;
  instagramFollowers: string;
  instagramPosts: string;
  googleBusinessName: string;
  googleBusinessProfile: string;
  googleBusinessImage: string;
  googleAddress: string;
  googleRating: string;
  googleReviews: string;
};

const STORAGE_KEY = "takshvi-social-integrations";
const DEFAULT_STATE: SocialState = {
  instagramName: "",
  instagramUsername: "",
  instagramProfile: "",
  instagramImage: "",
  instagramFollowers: "",
  instagramPosts: "",
  googleBusinessName: "",
  googleBusinessProfile: "",
  googleBusinessImage: "",
  googleAddress: "",
  googleRating: "",
  googleReviews: "",
};

export default function SocialIntegrationsPage() {
  const [state, setState] = useState<SocialState>(DEFAULT_STATE);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = { ...DEFAULT_STATE, ...(JSON.parse(saved) as Partial<SocialState>) };
      setState(parsed);
      setEditing(!(parsed.instagramName || parsed.googleBusinessName));
    } catch {
      setState(DEFAULT_STATE);
    }
  }, []);

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setEditing(false);
    setMessage("Instagram and Google Business profiles are now displayed inside the portal.");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Social Growth Center</p>
          <h1 className="mt-2 text-3xl font-black">Instagram & Google Business Profile</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            View both business profiles inside Takshvi. Official login is required only for initial connection or reconnecting an expired account.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Main Dashboard</Link>
            <button onClick={() => setEditing((current) => !current)} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">
              {editing ? "Close Setup" : "Edit Connections"}
            </button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <ProfileCard
            type="instagram"
            image={state.instagramImage}
            title={state.instagramName || "Instagram Business"}
            subtitle={state.instagramUsername ? `@${state.instagramUsername.replace(/^@/, "")}` : "Account not connected"}
            link={state.instagramProfile}
            stats={[
              ["Followers", state.instagramFollowers || "—"],
              ["Posts", state.instagramPosts || "—"],
            ]}
          />

          <ProfileCard
            type="google"
            image={state.googleBusinessImage}
            title={state.googleBusinessName || "Google Business Profile"}
            subtitle={state.googleAddress || "Profile not connected"}
            link={state.googleBusinessProfile}
            stats={[
              ["Rating", state.googleRating ? `${state.googleRating} ★` : "—"],
              ["Reviews", state.googleReviews || "—"],
            ]}
          />
        </section>

        {editing ? (
          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-pink-600">Instagram Setup</p>
              <h2 className="mt-1 text-2xl font-black">Instagram Business Account</h2>
              <a href="https://business.facebook.com/latest/home" target="_blank" rel="noopener noreferrer" className="mt-5 block rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 px-5 py-4 text-center font-black text-white">
                Connect / Reconnect Instagram
              </a>
              <div className="mt-4 grid gap-3">
                <Input value={state.instagramName} placeholder="Account display name" onChange={(value) => setState((current) => ({ ...current, instagramName: value }))} />
                <Input value={state.instagramUsername} placeholder="Instagram username" onChange={(value) => setState((current) => ({ ...current, instagramUsername: value }))} />
                <Input value={state.instagramProfile} placeholder="Instagram profile URL" onChange={(value) => setState((current) => ({ ...current, instagramProfile: value }))} />
                <Input value={state.instagramImage} placeholder="Profile image URL" onChange={(value) => setState((current) => ({ ...current, instagramImage: value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input value={state.instagramFollowers} placeholder="Followers" onChange={(value) => setState((current) => ({ ...current, instagramFollowers: value }))} />
                  <Input value={state.instagramPosts} placeholder="Posts" onChange={(value) => setState((current) => ({ ...current, instagramPosts: value }))} />
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-blue-600">Google Setup</p>
              <h2 className="mt-1 text-2xl font-black">Google Business Profile</h2>
              <a href="https://business.google.com/locations" target="_blank" rel="noopener noreferrer" className="mt-5 block rounded-xl bg-blue-600 px-5 py-4 text-center font-black text-white">
                Connect / Reconnect Google Business
              </a>
              <div className="mt-4 grid gap-3">
                <Input value={state.googleBusinessName} placeholder="Business profile name" onChange={(value) => setState((current) => ({ ...current, googleBusinessName: value }))} />
                <Input value={state.googleAddress} placeholder="Business address" onChange={(value) => setState((current) => ({ ...current, googleAddress: value }))} />
                <Input value={state.googleBusinessProfile} placeholder="Google Business Profile URL" onChange={(value) => setState((current) => ({ ...current, googleBusinessProfile: value }))} />
                <Input value={state.googleBusinessImage} placeholder="Business image URL" onChange={(value) => setState((current) => ({ ...current, googleBusinessImage: value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input value={state.googleRating} placeholder="Rating" onChange={(value) => setState((current) => ({ ...current, googleRating: value }))} />
                  <Input value={state.googleReviews} placeholder="Review count" onChange={(value) => setState((current) => ({ ...current, googleReviews: value }))} />
                </div>
              </div>
            </article>

            <button type="button" onClick={save} className="h-12 rounded-xl bg-slate-950 font-black text-white lg:col-span-2">
              Save and Display Inside Portal
            </button>
          </section>
        ) : null}

        {message ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</p> : null}

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Instagram and Google do not allow their full management dashboards to be embedded inside another website. This portal displays account information here; automatic posts, live insights, reviews and replies require Meta Graph API and Google Business Profile OAuth/API access.
        </section>
      </div>
    </main>
  );
}

function Input({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-12 w-full rounded-xl border px-4" />;
}

function ProfileCard({ type, image, title, subtitle, link, stats }: { type: "instagram" | "google"; image: string; title: string; subtitle: string; link: string; stats: [string, string][] }) {
  const gradient = type === "instagram" ? "from-pink-500 to-orange-400" : "from-blue-600 to-cyan-500";
  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className={`h-24 bg-gradient-to-r ${gradient}`} />
      <div className="p-6">
        <div className="-mt-16 flex items-end gap-4">
          <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-white bg-slate-200 shadow-lg">
            {image ? <img src={image} alt="Profile" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl font-black text-slate-500">{title.charAt(0)}</div>}
          </div>
          <div className="pb-1">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{type === "instagram" ? "Instagram" : "Google Business"}</p>
            <h2 className="text-xl font-black">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {stats.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}
        </div>
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-xl border px-4 py-3 text-center text-sm font-black">Open Public Profile</a> : null}
      </div>
    </article>
  );
}
