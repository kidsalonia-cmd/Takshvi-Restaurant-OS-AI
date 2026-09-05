"use client";

import { useEffect, useState } from "react";

type Post = { id: string; title?: string; focus?: string; scheduled_for: string; status: string; google_caption: string; last_error?: string };
type Status = { google?: boolean; googleLocation?: string | null };

const focusCopy: Record<string, string> = {
  Coffee: "Fresh coffee, relaxed cafe vibes and a perfect break in Sector 49, Gurugram. Visit Cafe Honeyman at Sapphire Mall today.",
  Waffles: "Craving waffles in Sector 49, Gurugram? Drop by Cafe Honeyman at Sapphire Mall for warm, indulgent waffles and cafe favourites.",
  "Ice Cream": "Cool down with ice cream and dessert favourites at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram.",
  Pasta: "Pasta cravings sorted at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram. Pair it with coffee, shakes or fresh juice.",
  "Fresh Juice": "Fresh juice, cafe food and refreshing flavours at Cafe Honeyman in Sapphire Mall, Sector 49, Gurugram.",
  "Weekend Special": "Make your weekend tastier at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram. Coffee, waffles, ice cream, pasta, fresh juice and more.",
};

function localInputTomorrowNine() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function CafeSchedulerPage() {
  const [focus, setFocus] = useState("Coffee");
  const [caption, setCaption] = useState(focusCopy.Coffee);
  const [imageUrl, setImageUrl] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [scheduledFor, setScheduledFor] = useState(localInputTomorrowNine());
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState<Status>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void load();
    void loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") setMessage(`Google Business connected: ${params.get("location") || "Cafe Honeyman"}.`);
    if (params.get("google") === "error") setMessage(params.get("message") || "Google connection failed.");
  }, []);

  async function load() {
    const res = await fetch("/api/social/schedule", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setPosts(data.posts || []);
  }

  async function loadStatus() {
    const res = await fetch("/api/social/status", { cache: "no-store" });
    const data = await res.json();
    setStatus(data);
  }

  function chooseFocus(value: string) {
    setFocus(value);
    setCaption(focusCopy[value] || focusCopy.Coffee);
  }

  async function schedule() {
    setLoading(true); setMessage("");
    const res = await fetch("/api/social/schedule", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${focus} post`, focus, googleCaption: caption, imageUrl, actionUrl, publishGoogle: true, publishInstagram: false, scheduledFor }),
    });
    const data = await res.json();
    setMessage(data.success ? "Google Business post scheduled." : data.message || "Unable to schedule post.");
    setLoading(false);
    if (data.success) void load();
  }

  async function publishDueNow() {
    setLoading(true); setMessage("");
    const res = await fetch("/api/social/process", { method: "POST" });
    const data = await res.json();
    setMessage(data.success ? `Processed ${data.processed || 0} due post(s).` : data.message || "Unable to publish due posts.");
    setLoading(false); void load();
  }

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="rounded-3xl bg-slate-950 p-7 text-white">
      <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Cafe Honeyman</p>
      <h1 className="mt-2 text-3xl font-black">Google Business Auto Posting & Scheduler</h1>
      <p className="mt-3 text-sm text-slate-300">Automatic posting is configured for 9:00 AM and 5:00 PM IST every day. Content focus rotates automatically and each automatic post receives a generated Cafe Honeyman image.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-2 text-sm font-black ${status.google ? "bg-emerald-400 text-slate-950" : "bg-amber-300 text-slate-950"}`}>{status.google ? `Google Connected${status.googleLocation ? ` · ${status.googleLocation}` : ""}` : "Google Not Connected"}</span>
        {status.google ? <span className="rounded-full bg-white/10 px-3 py-2 text-sm font-black text-white">Auto: 9:00 AM + 5:00 PM IST</span> : <a href="/api/google/auth" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Connect Cafe Honeyman Google</a>}
      </div>
    </header>

    <section className="rounded-3xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
      <h2 className="text-lg font-black text-emerald-950">Automatic daily plan</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-4"><p className="font-black">9:00 AM</p><p className="mt-1 text-sm text-slate-600">Coffee, cafe food and fresh juice rotation.</p></div>
        <div className="rounded-2xl bg-white p-4"><p className="font-black">5:00 PM</p><p className="mt-1 text-sm text-slate-600">Waffles, ice cream, pasta and shakes rotation.</p></div>
      </div>
      <p className="mt-3 text-sm font-semibold text-emerald-900">Automatic posts do not need a manually pasted image URL. The fields below are only for extra manual campaigns.</p>
    </section>

    <section className="grid gap-4 rounded-3xl bg-white p-6 shadow-sm md:grid-cols-2">
      <div className="md:col-span-2"><h2 className="text-xl font-black">Manual / extra post</h2><p className="mt-1 text-sm text-slate-500">Use this only when you want an additional post outside the automatic 9 AM and 5 PM schedule.</p></div>
      <label className="font-bold">Campaign focus<select value={focus} onChange={(e) => chooseFocus(e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4">{Object.keys(focusCopy).map((f) => <option key={f}>{f}</option>)}</select></label>
      <label className="font-bold">Schedule date/time<input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4" /></label>
      <label className="md:col-span-2 font-bold">Google Business caption<textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="mt-2 w-full rounded-xl border p-4" /></label>
      <label className="font-bold">Optional public image URL<input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Optional for manual posts" className="mt-2 h-12 w-full rounded-xl border px-4" /></label>
      <label className="font-bold">Optional CTA / website URL<input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="https://..." className="mt-2 h-12 w-full rounded-xl border px-4" /></label>
      <button disabled={loading || !status.google} onClick={schedule} className="h-12 rounded-xl bg-emerald-400 font-black text-slate-950 disabled:opacity-40">Schedule Extra Google Post</button>
      <button disabled={loading || !status.google} onClick={publishDueNow} className="h-12 rounded-xl bg-slate-950 font-black text-white disabled:opacity-40">Publish Due Manual Posts</button>
      {message ? <p className="md:col-span-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
    </section>

    <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Posting Queue & History</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Scheduled</th><th>Focus</th><th>Status</th><th>Google caption</th><th>Error</th></tr></thead><tbody>{posts.map((p) => <tr key={p.id} className="border-b"><td className="p-3 font-bold">{new Date(p.scheduled_for).toLocaleString("en-IN")}</td><td>{p.focus || "—"}</td><td className="font-black">{p.status}</td><td className="max-w-md py-3 pr-4">{p.google_caption}</td><td className="text-red-600">{p.last_error || ""}</td></tr>)}</tbody></table></div></section>
  </div></main>;
}
