"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Status = { instagram: boolean; google: boolean; ready: boolean };
type Result = { success: boolean; id?: string; message?: string };
type HistoryRow = { at: string; topic: string; instagram?: Result; google?: Result };

const HISTORY_KEY = "cafe-honeyman-autopost-history";
const topics = ["Coffee", "Waffles", "Ice Cream", "Pasta", "Fresh Juice", "Cafe Food", "Offer", "Weekend Special"];

function buildCaptions(topic: string) {
  const subject = topic || "Cafe favourites";
  return {
    instagram: `${subject} cravings sorted at Cafe Honeyman ☕✨\n\nDrop by Sapphire Mall, Sector 49, Gurugram and make your day a little more delicious.\n\n#CafeHoneyman #Sector49Gurugram #GurugramCafe #CoffeeInGurugram #Waffles #FreshJuice #CafeFood`,
    google: `${subject} at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram. Visit us for freshly prepared cafe food, coffee, waffles, ice creams, pasta and fresh juices.`,
  };
}

export default function CafeAutopostPage() {
  const [status, setStatus] = useState<Status>({ instagram: false, google: false, ready: false });
  const [topic, setTopic] = useState("Coffee");
  const [imageUrl, setImageUrl] = useState("");
  const [instagramCaption, setInstagramCaption] = useState("");
  const [googleCaption, setGoogleCaption] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [instagram, setInstagram] = useState(true);
  const [google, setGoogle] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    const generated = buildCaptions("Coffee");
    setInstagramCaption(generated.instagram);
    setGoogleCaption(generated.google);
    void fetch("/api/social/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Status) => setStatus(data))
      .catch(() => undefined);
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as HistoryRow[]);
    } catch {
      setHistory([]);
    }
  }, []);

  function generate() {
    const generated = buildCaptions(topic);
    setInstagramCaption(generated.instagram);
    setGoogleCaption(generated.google);
    setMessage("Platform-specific Cafe Honeyman captions generated.");
  }

  async function publish() {
    setMessage("");
    if (!instagram && !google) return setMessage("Select Instagram and/or Google Business Profile.");
    if (instagram && !imageUrl.trim()) return setMessage("Instagram publishing requires a public image URL.");

    setPublishing(true);
    try {
      const response = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: [instagram ? "instagram" : null, google ? "google" : null].filter(Boolean),
          imageUrl: imageUrl.trim(),
          instagramCaption,
          googleCaption,
          actionUrl: actionUrl.trim(),
          actionType: "LEARN_MORE",
        }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string; results?: { instagram?: Result; google?: Result } };
      const row: HistoryRow = { at: new Date().toISOString(), topic, ...data.results };
      const next = [row, ...history].slice(0, 20);
      setHistory(next);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));

      const parts = [
        data.results?.instagram ? `Instagram: ${data.results.instagram.success ? "Published" : data.results.instagram.message}` : "",
        data.results?.google ? `Google: ${data.results.google.success ? "Published" : data.results.google.message}` : "",
      ].filter(Boolean);
      setMessage(parts.join(" · ") || data.message || "Publishing finished.");
    } catch {
      setMessage("Unable to connect to the publishing service.");
    } finally {
      setPublishing(false);
    }
  }

  const connectedCount = useMemo(() => Number(status.instagram) + Number(status.google), [status]);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
          <p className="text-xs font-black uppercase tracking-[.22em] text-emerald-400">Cafe Honeyman AI Automation</p>
          <h1 className="mt-2 text-3xl font-black md:text-4xl">Auto Posting Center</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">Create one Cafe Honeyman campaign and publish platform-specific versions directly to Instagram and Google Business Profile.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/integrations/social" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">← Social Profiles</Link>
            <span className="rounded-xl bg-white/10 px-4 py-3 text-sm font-black">{connectedCount}/2 APIs configured</span>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <Connection title="Instagram" connected={status.instagram} note="Meta Content Publishing API" />
          <Connection title="Google Business Profile" connected={status.google} note="Local Posts API" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-3xl bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wider text-emerald-600">Campaign</p><h2 className="text-2xl font-black">Create & Publish</h2></div>
              <button onClick={generate} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black">Generate Captions</button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2"><span className="text-sm font-bold">Campaign focus</span><select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-12 rounded-xl border px-4">{topics.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="grid gap-2"><span className="text-sm font-bold">Public image URL</span><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://.../cafe-photo.jpg" className="h-12 rounded-xl border px-4" /><span className="text-xs text-slate-500">Required for Instagram. Google local-post images also need a publicly accessible URL.</span></label>
              <label className="grid gap-2"><span className="text-sm font-bold">Instagram caption</span><textarea value={instagramCaption} onChange={(e) => setInstagramCaption(e.target.value)} rows={7} className="rounded-xl border p-4" /></label>
              <label className="grid gap-2"><span className="text-sm font-bold">Google Business caption</span><textarea value={googleCaption} onChange={(e) => setGoogleCaption(e.target.value)} rows={5} className="rounded-xl border p-4" /></label>
              <label className="grid gap-2"><span className="text-sm font-bold">Website / order link for Google CTA (optional)</span><input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="https://..." className="h-12 rounded-xl border px-4" /></label>
            </div>
          </article>

          <article className="rounded-3xl bg-white p-5 shadow-sm md:p-6">
            <p className="text-xs font-black uppercase tracking-wider text-blue-600">Publishing</p>
            <h2 className="text-2xl font-black">Choose Channels</h2>
            <div className="mt-5 space-y-3">
              <Channel label="Instagram" checked={instagram} onChange={setInstagram} connected={status.instagram} />
              <Channel label="Google Business Profile" checked={google} onChange={setGoogle} connected={status.google} />
            </div>
            <button disabled={publishing} onClick={publish} className="mt-6 h-14 w-full rounded-2xl bg-slate-950 text-lg font-black text-white disabled:opacity-50">{publishing ? "Publishing…" : "Publish Now"}</button>
            {message ? <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm font-bold text-slate-700">{message}</p> : null}
            {!status.ready ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>API setup required.</b> The publish screen is ready, but Vercel still needs the Meta and Google Business API credentials before posts can go live.</div> : null}
          </article>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="text-2xl font-black">Recent Publishing Attempts</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-3">Time</th><th>Campaign</th><th>Instagram</th><th>Google</th></tr></thead><tbody>{history.length ? history.map((row, index) => <tr key={`${row.at}-${index}`} className="border-b"><td className="p-3">{new Date(row.at).toLocaleString("en-IN")}</td><td className="font-bold">{row.topic}</td><td>{row.instagram ? row.instagram.success ? "Published" : row.instagram.message : "—"}</td><td>{row.google ? row.google.success ? "Published" : row.google.message : "—"}</td></tr>) : <tr><td colSpan={4} className="p-6 text-center text-slate-500">No publishing attempts yet.</td></tr>}</tbody></table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Connection({ title, connected, note }: { title: string; connected: boolean; note: string }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="font-black">{title}</p><p className="text-xs text-slate-500">{note}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${connected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{connected ? "API Ready" : "Setup Required"}</span></div></div>;
}

function Channel({ label, checked, connected, onChange }: { label: string; checked: boolean; connected: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-2xl border p-4"><div><p className="font-black">{label}</p><p className="text-xs text-slate-500">{connected ? "Connected for direct publishing" : "Credentials required"}</p></div><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-emerald-500" /></label>;
}
