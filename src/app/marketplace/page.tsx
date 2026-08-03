"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useState } from "react";

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
  summary?: {
    rows: number;
    orders: number;
    sales: number;
    payout: number;
    discount: number;
    commission: number;
    aov: number;
    payoutRatio: number;
  };
};

type SlotConfig = {
  title: string;
  note: string;
  badge: string;
  locationLevel?: boolean;
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
    title: "Petpooja Consolidated Item Report",
    note: "Location-wise consolidated item and brand sales report",
    badge: "LOCATION REPORT",
    locationLevel: true,
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
const LOCATION_SLOT: SlotKey = "petpooja_items";

function freshStatuses(): Record<SlotKey, SlotStatus> {
  return SLOT_KEYS.reduce((acc, slot) => {
    acc[slot] = "pending";
    return acc;
  }, {} as Record<SlotKey, SlotStatus>);
}

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

function acceptedFiles(list: FileList | File[]) {
  return Array.from(list).filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name));
}

export default function MarketplacePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locationId, setLocationId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [files, setFiles] = useState<Partial<Record<SlotKey, File[]>>>({});
  const [statuses, setStatuses] = useState<Record<SlotKey, SlotStatus>>(freshStatuses());
  const [inputKeys, setInputKeys] = useState<Record<SlotKey, number>>(
    SLOT_KEYS.reduce((acc, slot) => ({ ...acc, [slot]: 0 }), {} as Record<SlotKey, number>),
  );
  const [draggingSlot, setDraggingSlot] = useState<SlotKey | null>(null);
  const [busySlot, setBusySlot] = useState<SlotKey | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [message, setMessage] = useState("");
  const [submissionCompleted, setSubmissionCompleted] = useState(false);

  useEffect(() => {
    void loadMasters();
  }, []);

  const visibleBrands = useMemo(
    () => brands.filter((brand) => !locationId || brand.location_id === locationId),
    [brands, locationId],
  );

  const visibleSlots = useMemo<SlotKey[]>(() => {
    if (!locationId) return [];
    if (!brandId) return [LOCATION_SLOT];
    return SLOT_KEYS;
  }, [locationId, brandId]);

  const storageKey = useMemo(() => {
    if (!locationId) return "";
    return brandId
      ? `marketplace-report-status:${locationId}:${brandId}`
      : `marketplace-report-status:${locationId}:location`;
  }, [locationId, brandId]);

  useEffect(() => {
    if (!storageKey) {
      setStatuses(freshStatuses());
      setSubmissionCompleted(false);
      return;
    }

    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      setStatuses(freshStatuses());
      setSubmissionCompleted(false);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as {
        statuses?: Partial<Record<SlotKey, SlotStatus>>;
        completed?: boolean;
      };
      setStatuses({ ...freshStatuses(), ...(parsed.statuses || {}) });
      setSubmissionCompleted(Boolean(parsed.completed));
    } catch {
      setStatuses(freshStatuses());
      setSubmissionCompleted(false);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ statuses, completed: submissionCompleted }),
    );
  }, [statuses, submissionCompleted, storageKey]);

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

  const resolvedCount = visibleSlots.filter((slot) => statuses[slot] !== "pending").length;
  const allResolved = visibleSlots.length > 0 && resolvedCount === visibleSlots.length;

  function chooseFiles(slot: SlotKey, selected: File[]) {
    const valid = acceptedFiles(selected);
    if (!valid.length) {
      setMessage("Only XLSX, XLS and CSV reports are supported.");
      return;
    }
    setFiles((current) => ({ ...current, [slot]: valid }));
    setStatuses((current) => ({ ...current, [slot]: "pending" }));
    setSubmissionCompleted(false);
    setMessage("");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>, slot: SlotKey) {
    event.preventDefault();
    setDraggingSlot(null);
    chooseFiles(slot, Array.from(event.dataTransfer.files));
  }

  async function upload(slot: SlotKey) {
    const selectedFiles = files[slot] || [];
    const locationLevel = Boolean(SLOT_CONFIG[slot].locationLevel);

    if (!locationId) return setMessage("Select location first.");
    if (!locationLevel && !brandId) return setMessage("Select brand first.");
    if (!selectedFiles.length) {
      return setMessage(`Attach at least one ${SLOT_CONFIG[slot].title} file or mark it Not Applicable.`);
    }

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
        formData.append("brandId", locationLevel ? "" : brandId);
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
        setInputKeys((current) => ({ ...current, [slot]: current[slot] + 1 }));
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
    setInputKeys((current) => ({ ...current, [slot]: current[slot] + 1 }));
    setStatuses((current) => ({ ...current, [slot]: "not_applicable" }));
    setSubmissionCompleted(false);
    setMessage(`${SLOT_CONFIG[slot].title} marked Not Applicable.`);
  }

  function resetSlot(slot: SlotKey) {
    setFiles((current) => ({ ...current, [slot]: [] }));
    setInputKeys((current) => ({ ...current, [slot]: current[slot] + 1 }));
    setStatuses((current) => ({ ...current, [slot]: "pending" }));
    setSubmissionCompleted(false);
    setMessage(`${SLOT_CONFIG[slot].title} reset to Pending.`);
  }

  function completeSubmission() {
    if (!locationId) return setMessage("Select location first.");
    if (!brandId && visibleSlots.some((slot) => !SLOT_CONFIG[slot].locationLevel)) {
      return setMessage("Select brand first.");
    }
    if (!allResolved) {
      return setMessage("Complete every pending report by uploading a file or marking it Not Applicable.");
    }
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
              <p className="mt-2 text-sm text-slate-300">Upload by drag-and-drop or file selection, then save each report.</p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/ceo" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">CEO Dashboard</Link>
              <Link href="/integrations/marketplaces" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Connections</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <select
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setBrandId("");
              setFiles({});
              setResult(null);
              setMessage("");
            }}
            className="h-12 rounded-xl border px-3"
          >
            <option value="">Select location</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
          </select>
          <select
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
              setFiles({});
              setResult(null);
              setMessage("");
            }}
            disabled={!locationId}
            className="h-12 rounded-xl border px-3 disabled:bg-slate-100"
          >
            <option value="">Select brand for brand-wise reports</option>
            {visibleBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><b>{resolvedCount}/{visibleSlots.length}</b> visible reports completed</div>
          <div className={`rounded-xl px-4 py-3 text-sm font-bold ${submissionCompleted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {submissionCompleted ? "Submission completed" : "Submission pending"}
          </div>
        </section>

        {!locationId ? (
          <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-black">Select a location to begin</h2>
            <p className="mt-2 text-sm text-slate-500">The location-wise Petpooja consolidated report box will appear first.</p>
          </section>
        ) : null}

        {locationId && !brandId ? (
          <section className="rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-800">
            Upload the location-wise Petpooja consolidated item report below. Select a brand to display Zomato, Swiggy and other brand-wise report boxes.
          </section>
        ) : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleSlots.map((slot) => {
            const selectedFiles = files[slot] || [];
            const slotConfig = SLOT_CONFIG[slot];
            const status = statuses[slot];
            const isDragging = draggingSlot === slot;

            return (
              <article key={slot} className={`rounded-3xl bg-white p-5 shadow-sm ${slotConfig.locationLevel && !brandId ? "md:col-span-2 xl:col-span-3" : ""}`}>
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

                <label
                  onDragEnter={(event) => { event.preventDefault(); setDraggingSlot(slot); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDraggingSlot(null)}
                  onDrop={(event) => handleDrop(event, slot)}
                  className={`mt-4 block cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${
                    isDragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40"
                  }`}
                >
                  <span className="block text-3xl">⇧</span>
                  <span className="mt-2 block text-sm font-black">Drag & drop reports here</span>
                  <span className="mt-1 block text-xs text-slate-500">or click to browse · XLSX, XLS or CSV</span>
                  <input
                    key={`${slot}-${inputKeys[slot]}`}
                    type="file"
                    multiple
                    accept=".xlsx,.xls,.csv"
                    className="sr-only"
                    onChange={(event) => chooseFiles(slot, Array.from(event.target.files || []))}
                  />
                </label>

                <div className="mt-3 min-h-20 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  {selectedFiles.length ? (
                    <>
                      <b>{selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} ready to save</b>
                      <div className="mt-2 max-h-20 space-y-1 overflow-auto">
                        {selectedFiles.map((file) => <p key={`${file.name}-${file.lastModified}`} className="truncate">• {file.name}</p>)}
                      </div>
                    </>
                  ) : status === "uploaded" ? (
                    <span className="font-bold text-emerald-700">Saved successfully. Attachment area is clear and ready for another report.</span>
                  ) : status === "not_applicable" ? (
                    "Manually marked Not Applicable."
                  ) : (
                    "No report attached — drag a file here or click the box above."
                  )}
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

        {visibleSlots.length ? (
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black">Complete Report Submission</h2>
                <p className="mt-1 text-sm text-slate-500">Every visible report must show Uploaded & Saved or Not Applicable.</p>
              </div>
              <button
                type="button"
                onClick={completeSubmission}
                disabled={!allResolved || submissionCompleted}
                className="h-12 rounded-xl bg-emerald-500 px-7 font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                {submissionCompleted ? "Submission Completed" : `Complete Submission (${resolvedCount}/${visibleSlots.length})`}
              </button>
            </div>
          </section>
        ) : null}

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
