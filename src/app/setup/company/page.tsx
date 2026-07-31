"use client";

import { FormEvent, useState } from "react";

const initialCompany = {
  name: "Takshvi Foods",
  legalName: "",
  gstin: "",
  pan: "",
  email: "",
  phone: "",
  website: "",
  currency: "INR",
  timezone: "Asia/Kolkata",
};

export default function CompanySetupPage() {
  const [company, setCompany] = useState(initialCompany);
  const [saved, setSaved] = useState(false);

  function update(field: keyof typeof company, value: string) {
    setSaved(false);
    setCompany((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem("takshvi-company-draft", JSON.stringify(company));
    setSaved(true);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-5xl">
        <a href="/setup" className="text-sm font-bold text-emerald-600">← Back to setup</a>
        <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm md:p-9">
          <div className="border-b border-slate-200 pb-6">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600">Step 1</p>
            <h1 className="mt-2 text-3xl font-black">Company profile</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This becomes the parent entity for every restaurant location, brand, user, order and inventory record.
            </p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-7">
            <section className="grid gap-5 md:grid-cols-2">
              <Field label="Display name" value={company.name} onChange={(value) => update("name", value)} required />
              <Field label="Legal business name" value={company.legalName} onChange={(value) => update("legalName", value)} />
              <Field label="GSTIN" value={company.gstin} onChange={(value) => update("gstin", value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
              <Field label="PAN" value={company.pan} onChange={(value) => update("pan", value.toUpperCase())} placeholder="AAAAA0000A" />
              <Field label="Business email" value={company.email} onChange={(value) => update("email", value)} type="email" />
              <Field label="Business phone" value={company.phone} onChange={(value) => update("phone", value)} type="tel" />
              <Field label="Website" value={company.website} onChange={(value) => update("website", value)} placeholder="https://" />

              <label className="block">
                <span className="mb-2 block text-sm font-bold">Currency</span>
                <select value={company.currency} onChange={(event) => update("currency", event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100">
                  <option value="INR">INR — Indian Rupee</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-bold">Operating timezone</span>
                <select value={company.timezone} onChange={(event) => update("timezone", event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100">
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                </select>
              </label>
            </section>

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-400">
                Draft data is currently saved on this computer. It will move to Supabase after the database connection is configured.
              </p>
              <button className="h-12 shrink-0 rounded-xl bg-slate-950 px-6 font-black text-white transition hover:bg-emerald-500 hover:text-slate-950">
                Save company profile
              </button>
            </div>

            {saved ? (
              <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                Company draft saved successfully. Next: connect Supabase and create the first location.
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}{required ? " *" : ""}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
      />
    </label>
  );
}
