"use client";

import { ChangeEvent, useState } from "react";

type UploadType = "ingredient" | "recipe";
type Result = { row: number; item: string; status: string };

export default function BulkUploadPage() {
  const [files, setFiles] = useState<Record<UploadType, File | null>>({ ingredient: null, recipe: null });
  const [loading, setLoading] = useState<UploadType | null>(null);
  const [message, setMessage] = useState<Record<UploadType, string>>({ ingredient: "", recipe: "" });
  const [errors, setErrors] = useState<Record<UploadType, string>>({ ingredient: "", recipe: "" });
  const [results, setResults] = useState<Record<UploadType, Result[]>>({ ingredient: [], recipe: [] });

  function select(type: UploadType, event: ChangeEvent<HTMLInputElement>) {
    setFiles((current) => ({ ...current, [type]: event.target.files?.[0] || null }));
    setMessage((current) => ({ ...current, [type]: "" }));
    setErrors((current) => ({ ...current, [type]: "" }));
    setResults((current) => ({ ...current, [type]: [] }));
  }

  async function upload(type: UploadType) {
    const file = files[type];
    if (!file) { setErrors((current) => ({ ...current, [type]: "Select an Excel or CSV file first." })); return; }
    setLoading(type); setErrors((current) => ({ ...current, [type]: "" })); setMessage((current) => ({ ...current, [type]: "" }));
    try {
      const form = new FormData(); form.append("type", type); form.append("file", file);
      const response = await fetch("/api/bulk-upload/inventory-recipes", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Upload failed.");
      setMessage((current) => ({ ...current, [type]: data.message }));
      setResults((current) => ({ ...current, [type]: data.results || [] }));
    } catch (error) {
      setErrors((current) => ({ ...current, [type]: error instanceof Error ? error.message : "Upload failed." }));
    } finally { setLoading(null); }
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950 lg:pb-8">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="rounded-3xl bg-slate-950 p-6 pr-16 text-white sm:p-8 lg:pr-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-400">Bulk Excel Setup</p>
          <h1 className="mt-2 text-3xl font-black">Ingredient Master & Menu Recipes</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Download the exact Takshvi template, fill it in Excel, then upload it here. Data is posted directly into the Ingredient Master or Recipe engine.</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <UploadCard
            title="Ingredient Master"
            description="Create or update ingredients location-wise with SKU, unit, stock, reorder level and cost."
            templateHref="/api/templates/inventory-recipes?type=ingredient"
            file={files.ingredient}
            loading={loading === "ingredient"}
            onSelect={(e) => select("ingredient", e)}
            onUpload={() => void upload("ingredient")}
            message={message.ingredient}
            error={errors.ingredient}
            results={results.ingredient}
          />
          <UploadCard
            title="Menu Recipes"
            description="Upload recipe ingredients, quantities, wastage and recipe yield for existing menu items."
            templateHref="/api/templates/inventory-recipes?type=recipe"
            file={files.recipe}
            loading={loading === "recipe"}
            onSelect={(e) => select("recipe", e)}
            onUpload={() => void upload("recipe")}
            message={message.recipe}
            error={errors.recipe}
            results={results.recipe}
          />
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-black">Important matching rules</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
            <p className="rounded-xl bg-slate-50 p-4"><b className="text-slate-950">Ingredient Master:</b> Location Code must match Locations. SKU is used first for matching; otherwise Ingredient Name is used.</p>
            <p className="rounded-xl bg-slate-50 p-4"><b className="text-slate-950">Menu Recipes:</b> Location Code + Brand Code + Menu Item SKU must already exist. Ingredient SKU should match the Ingredient Master.</p>
            <p className="rounded-xl bg-slate-50 p-4"><b className="text-slate-950">Units:</b> Recipe quantity must use the same inventory unit as the ingredient, e.g. milk in ml and coffee in g.</p>
            <p className="rounded-xl bg-amber-50 p-4 text-amber-900"><b>Recipe upload replaces the ingredient lines</b> for that menu item so the Excel sheet becomes the current recipe.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function UploadCard({ title, description, templateHref, file, loading, onSelect, onUpload, message, error, results }: { title: string; description: string; templateHref: string; file: File | null; loading: boolean; onSelect: (e: ChangeEvent<HTMLInputElement>) => void; onUpload: () => void; message: string; error: string; results: Result[] }) {
  return <article className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-600">Excel Upload</p><h2 className="mt-1 text-2xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></div><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-xl">⇧</span></div>
    <a href={templateHref} className="mt-5 flex h-12 items-center justify-center rounded-xl border-2 border-slate-950 text-sm font-black">Download Excel Template</a>
    <label className="mt-3 block rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center">
      <input type="file" accept=".xlsx,.xls,.csv" onChange={onSelect} className="hidden" />
      <span className="block text-sm font-black">{file ? file.name : "Tap to select completed Excel file"}</span>
      <span className="mt-1 block text-xs text-slate-400">XLSX, XLS or CSV</span>
    </label>
    <button onClick={onUpload} disabled={loading || !file} className="mt-3 h-13 min-h-12 w-full rounded-xl bg-emerald-400 px-4 font-black text-slate-950 disabled:opacity-40">{loading ? "Uploading & posting..." : "Upload & Post Directly"}</button>
    {message ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}
    {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
    {results.length ? <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">Row</th><th className="p-2">Item</th><th className="p-2">Status</th></tr></thead><tbody>{results.map((r, i) => <tr key={`${r.row}-${i}`} className="border-t border-slate-100"><td className="p-2">{r.row}</td><td className="p-2 font-bold">{r.item}</td><td className={`p-2 font-bold ${["Created","Updated","Recipe posted"].includes(r.status) ? "text-emerald-700" : "text-red-600"}`}>{r.status}</td></tr>)}</tbody></table></div> : null}
  </article>;
}
