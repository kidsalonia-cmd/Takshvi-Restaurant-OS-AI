"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type SlotKey =
  | "zomato_payout"
  | "swiggy_payout"
  | "petpooja_orders"
  | "petpooja_items"
  | "petpooja_sales"
  | "other_report";
type SlotStatus = "pending" | "uploaded" | "not_applicable";

type UploadResult = {
  success: boolean;
  message?: string;
  marketplace?: string;
  reportType?: string;
  restaurantName?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  summary?: {
    rows: number;
    orders: number;
    sales: number;
    payout: number;
    discount: number;
    commission: number;
    tax: number;
    packaging: number;
    aov: number;
    payoutRatio: number;
  };
};

type SlotConfig = {
  title: string;
  note: string;
  badge: string;
};

const SLOT_CONFIG: Record<SlotKey, SlotConfig> = {
  zomato_payout: {
    title: "Zomato Payout Reports",
    note: "Weekly settlement, payout and deduction reports",
    badge: "ZOMATO",
  },
  swiggy_payout: {
    title: "Swiggy Payout Reports",
    note: "Weekly settlement, payout and deduction reports",
    badge: "SWIGGY",
  },
  petpooja_orders: {
    title: "Petpooja Order Details",
    note: "Customer order detail report for online channel analysis",
    badge: "PETPOOJA",
  },
  petpooja_items: {
    title: "Petpooja Item Reports",
    note: "Item-wise and brand-wise sales reports",
    badge: "PETPOOJA",
  },
  petpooja_sales: {
    title: "Petpooja Sales Reports",
    note: "Daily sales, payment, GST and category reports",
    badge: "PETPOOJA",
  },
  other_report: {
    title: "Other Marketplace Reports",
    note: "Additional Zomato, Swiggy or marketplace reports",
    badge: "OTHER",
  },
};

const SLOT_KEYS = Object.keys(SLOT_CONFIG) as SlotKey[];
const INITIAL_STATUS = SLOT_KEYS.reduce<Record<SlotKey, SlotStatus>>((acc, slot) => {
  acc[slot] = "pending";
  return acc;
}, {} as Record<SlotKey, SlotStatus>);

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function authHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function money(value = 0) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function statusLabel(status: SlotStatus) {
  if (status === "uploaded") return "Uploaded & saved";
  if (status === "not_applicable") return "Not applicable";
  return "Pending";
}

function statusClass(status: SlotStatus) {
  if (status === "uploaded") return "bg-emerald-100 text-emerald-800";
  if (status === "not_applicable") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export default function MarketplacePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [files, setFiles] = useState<Partial<Record<SlotKey, File[]>>>({});
  const [statuses, setStatuses] = useState<Record<SlotKey, SlotStatus>>(INITIAL_STATUS);
  const [busySlot, setBusySlot] = useState<SlotKey | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [message, setMessage] = useState("");
  const [submissionCompleted, setSubmissionCompleted] = useState(false);

  useEffect(() => {
    void loadMasters();
  }, []);

  useEffect(() => {
    if (!locationId || !brandId) {
      setStatuses(INITIAL_STATUS);
      setSubmissionCompleted(false);
      return;
    }

    const saved = window.localStorage.getItem(`marketplace-report-status:${locationId}:${brandId}`);
    if (!saved) {
      setStatuses(INITIAL_STATUS);
      setSubmissionCompleted(false);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as { statuses?: Record<SlotKey, SlotStatus>; completed?: boolean };
      setStatuses({ ...INITIAL_STATUS, ...(parsed.statuses || {}) });
      setSubmissionCompleted(Boolean(parsed.completed));
    } catch {
      setStatuses(INITIAL_STATUS);
      setSubmissionCompleted(false);
    }
  }, [locationId, brandId]);

  useEffect(() => {
    if (!locationId || !brandId) return;
    window.localStorage.setItem(
      `marketplace-report-status:${locationId}:${brandId}`,
      JSON.stringify({ statuses, completed: submissionCompleted }),
    );
  }, [statuses, submissionCompleted, locationId, brandId]);

  async function loadMasters() {
    try {
      const { url, key } = config();
      const [locationRes, brandRes] = await Promise.all([
        fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`, {
          headers: authHeaders(key),
          cache: "no-store",
        }),
        fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`, {
          headers: authHeaders(key),
          cache: "no-store",
        }),
      ]);
      if (!locationRes.ok) throw new Error(await locationRes.text());
      if (!brandRes.ok) throw new Error(await brandRes.text());
      setLocations(await locationRes.json());
      setBrands(await brandRes.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load location and brand data.");
    }
  }

  const visibleBrands = useMemo(
    () => brands.filter((brand) => !locationId || brand.location_id === locationId),
    [brands, locationId],
  );

  const resolvedCount = SLOT_KEYS.filter((slot) => statuses[slot] !== "pending").length;
  const allResolved = resolvedCount === SLOT_KEYS.length;

  async function upload(slot: SlotKey) {
    const selectedFiles = files[slot] || [];
    if (!locationId || !brandId) return setMessage("Select location and brand first.");
    if (!selectedFiles.length) return setMessage(`Attach at least one ${SLOT_CONFIG[slot].title} file or mark it Not Applicable.`);

    setBusySlot(slot);
    setMessage("");
    setResult(null);

    let completed = 0;
    const failed: string[] = [];
    let latestResult: UploadResult | null = null;

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("locationId", locationId);
        formData.append("brandId", brandId);
        formData.append("uploadSlot", slot);

        const response = await fetch("/api/marketplace/upload", {
          method: "POST",
          body: formData,
        });
        const data = (await response.json()) as UploadResult;

        if (!response.ok || !data.success) {
          failed.push(`${file.name}: ${data.message || "Upload failed"}`);
          continue;
        }

        completed += 1;
        latestResult = data;
      }

      if (latestResult) setResult(latestResult);
      if (completed) {
        setFiles((current) => ({ ...current, [slot]: [] }));
        setStatuses((current) => ({ ...current, [slot]: "uploaded" }));
        setSubmissionCompleted(false);
      }

      const successText = `${completed} report${completed === 1 ? "" : "s"} uploaded, analysed and saved.`;
      setMessage(failed.length ? `${successText} ${failed.length} failed: ${failed.join(" | ")}` : successText);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process reports.");
    } finally {
      setBusySlot(null);
    }
  }

  function markNotApplicable(slot: SlotKey) {
    setFiles((current) => ({ ...current, [slot]: [] }));
    setStatuses((current) => ({ ...current, [slot]: "not_applicable" }));
    setSubmissionCompleted(false);
    setMessage(`${SLOT_CONFIG[slot].title} marked Not Applicable.`);
  }

  function resetSlot(slot: SlotKey) {
    setStatuses((current) => ({ ...current, [slot]: "pending" }));
    setSubmissionCompleted(false);
    setMessage(`${SLOT_CONFIG[slot].title} reset to Pending.`);
  }

  function completeSubmission() {
    if (!locationId || !brandId) return setMessage("Select location and brand first.");
    if (!allResolved) return setMessage("Complete every pending report by uploading a file or marking it Not Applicable.");
    setSubmissionCompleted(true);
    setMessage("Marketplace report submission completed successfully.");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">Takshvi Restaurant OS AI</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Marketplace Report Center</h1>
              <p className="mt-2 text-sm text-slate-300">Every report must be uploaded and saved, or manually marked Not Applicable.</p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link>
              <Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setBrandId(""); setFiles({}); setResult(null); setMessage(""); }} className="h-12 rounded-xl border px-3">
            <option value="">Select location</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
          </select>
          <select value={brandId} onChange={(event) => { setBrandId(event.target.value); setFiles({}); setResult(null); setMessage(""); }} className="h-12 rounded-xl border px-3">
            <option value="">Select brand</option>
            {visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{resolvedCount}/{SLOT_KEYS.length}</b> reports completed</div>
          <div className={`rounded-xl px-4 py-3 text-sm font-bold ${submissionCompleted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {submissionCompleted ? "Submission completed" : "Submission pending"}
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {SLOT_KEYS.map((slot) => {
            const selectedFiles = files[slot] || [];
            const slotConfig = SLOT_CONFIG[slot];
            const status = statuses[slot];
            return (
              <article key={slot} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">{slotConfig.title}</h2>
                    <p className="mt-1 min-h-10 text-sm text-slate-500">{slotConfig.note}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black tracking-wide text-slate-600">{slotConfig.badge}</span>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${statusClass(status)}`}>{statusLabel(status)}</span>
                  </div>
                </div>

                <label className="mt-4 block rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center hover:border-emerald-500">
                  <span className="block text-sm font-black">Attach one or multiple files</span>
                  <span className="mt-1 block text-xs text-slate-500">XLSX, XLS or CSV</span>
                  <input
                    type="file"
                    multiple
                    accept=".xlsx,.xls,.csv"
                    className="mt-4 block w-full text-xs"
                    onChange={(event) => {
                      const selected = Array.from(event.target.files || []);
                      setFiles((current) => ({ ...current, [slot]: selected }));
                      if (selected.length) setStatuses((current) => ({ ...current, [slot]: "pending" }));
                      setSubmissionCompleted(false);
                      setMessage("");
                    }}
                  />
                </label>

                <div className="mt-3 min-h-20 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  {selectedFiles.length ? (
                    <>
                      <b>{selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} attached</b>
                      <div className="mt-2 max-h-20 space-y-1 overflow-auto">
                        {selectedFiles.map((file) => <p key={`${file.name}-${file.lastModified}`} className="truncate">• {file.name}</p>)}
                      </div>
                    </>
                  ) : status === "uploaded" ? "Report already uploaded and saved." : status === "not_applicable" ? "Manually marked Not Applicable." : "No report attached — action required."}
                </div>

                <button
                  type="button"
                  onClick={() => void upload(slot)}
                  disabled={busySlot !== null || !selectedFiles.length}
                  className="mt-3 h-11 w-full rounded-xl bg-slate-950 font-black text-white disabled:opacity-50"
                >
                  {busySlot === slot ? "Saving reports..." : `Save Uploaded Report${selectedFiles.length === 1 ? "" : "s"} (${selectedFiles.length})`}
                </button>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => markNotApplicable(slot)} disabled={busySlot !== null} className="h-10 rounded-xl border font-bold text-slate-700 disabled:opacity-50">Not Applicable</button>
                  <button type="button" onClick={() => resetSlot(slot)} disabled={busySlot !== null} className="h-10 rounded-xl border font-bold text-slate-700 disabled:opacity-50">Reset Pending</button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Complete Report Submission</h2>
              <p className="mt-1 text-sm text-slate-500">All six report sections must show Uploaded & Saved or Not Applicable.</p>
            </div>
            <button
              type="button"
              onClick={completeSubmission}
              disabled={!allResolved || submissionCompleted}
              className="h-12 rounded-xl bg-emerald-500 px-7 font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              {submissionCompleted ? "Submission Completed" : `Complete Submission (${resolvedCount}/${SLOT_KEYS.length})`}
            </button>
          </div>
        </section>

        {message ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p> : null}

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Latest processed report</h2>
          {result?.summary ? (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <Metric label="Marketplace" value={(result.marketplace || "unknown").toUpperCase()} />
                <Metric label="Report type" value={(result.reportType || "unknown").replaceAll("_", " ")} />
                <Metric label="Restaurant" value={result.restaurantName || "Not detected"} />
                <Metric label="Orders" value={String(result.summary.orders)} />
                <Metric label="Sales" value={money(result.summary.sales)} />
                <Metric label="Payout" value={money(result.summary.payout)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Kpi label="AOV" value={money(result.summary.aov)} />
                <Kpi label="Payout Ratio" value={`${result.summary.payoutRatio.toFixed(1)}%`} />
                <Kpi label="Discount" value={money(result.summary.discount)} />
                <Kpi label="Commission" value={money(result.summary.commission)} />
                <Kpi label="Rows Imported" value={String(result.summary.rows)} />
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Upload and save reports above to generate the analysis.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 truncate font-black capitalize">{value}</p></div>;
}
