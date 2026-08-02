"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type Brand = { id: string; location_id: string; name: string; code: string };
type Category = { id: string; brand_id: string; name: string };
type ItemType = "veg" | "non_veg" | "egg";
type MenuItem = {
  id: string;
  company_id: string;
  location_id: string;
  brand_id: string;
  category_id: string | null;
  name: string;
  sku: string;
  description: string | null;
  item_type: ItemType;
  base_price: number;
  packaging_charge: number;
  tax_rate: number;
  image_url: string | null;
  is_active: boolean;
  available_on_pos: boolean;
  available_on_zomato: boolean;
  available_on_swiggy: boolean;
};

type MenuForm = {
  locationId: string;
  brandId: string;
  categoryId: string;
  name: string;
  sku: string;
  description: string;
  itemType: ItemType;
  basePrice: string;
  packagingCharge: string;
  taxRate: string;
  imageUrl: string;
  isActive: boolean;
  pos: boolean;
  zomato: boolean;
  swiggy: boolean;
};

const emptyForm: MenuForm = {
  locationId: "",
  brandId: "",
  categoryId: "",
  name: "",
  sku: "",
  description: "",
  itemType: "veg",
  basePrice: "",
  packagingCharge: "0",
  taxRate: "5",
  imageUrl: "",
  isActive: true,
  pos: true,
  zomato: true,
  swiggy: true,
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing.");
  return { url, key };
}

function headers(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export default function MenuPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState<MenuForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadAll() {
    const { url, key } = config();
    const companyRes = await fetch(`${url}/rest/v1/companies?select=id,name&order=created_at.asc&limit=1`, { headers: headers(key), cache: "no-store" });
    if (!companyRes.ok) throw new Error(await companyRes.text());
    const companyRows = (await companyRes.json()) as Company[];
    if (!companyRows[0]) throw new Error("Create the company profile first.");
    setCompany(companyRows[0]);

    const [locationRes, brandRes, categoryRes, itemRes] = await Promise.all([
      fetch(`${url}/rest/v1/locations?company_id=eq.${companyRows[0].id}&select=id,name,code&order=created_at.asc`, { headers: headers(key), cache: "no-store" }),
      fetch(`${url}/rest/v1/brands?company_id=eq.${companyRows[0].id}&select=id,location_id,name,code&order=created_at.asc`, { headers: headers(key), cache: "no-store" }),
      fetch(`${url}/rest/v1/menu_categories?company_id=eq.${companyRows[0].id}&select=id,brand_id,name&order=sort_order.asc,name.asc`, { headers: headers(key), cache: "no-store" }),
      fetch(`${url}/rest/v1/menu_items?company_id=eq.${companyRows[0].id}&select=*&order=created_at.desc`, { headers: headers(key), cache: "no-store" }),
    ]);

    for (const response of [locationRes, brandRes, categoryRes, itemRes]) {
      if (!response.ok) throw new Error(await response.text());
    }

    setLocations((await locationRes.json()) as Location[]);
    setBrands((await brandRes.json()) as Brand[]);
    setCategories((await categoryRes.json()) as Category[]);
    setItems((await itemRes.json()) as MenuItem[]);
  }

  useEffect(() => {
    loadAll()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load menu."))
      .finally(() => setLoading(false));
  }, []);

  const brandOptions = brands.filter((brand) => !form.locationId || brand.location_id === form.locationId);
  const categoryOptions = categories.filter((category) => !form.brandId || category.brand_id === form.brandId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => [item.name, item.sku, item.description].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [items, search]);

  function setField<K extends keyof MenuForm>(field: K, value: MenuForm[K]) {
    setMessage("");
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function editItem(item: MenuItem) {
    setEditingId(item.id);
    setForm({
      locationId: item.location_id,
      brandId: item.brand_id,
      categoryId: item.category_id ?? "",
      name: item.name,
      sku: item.sku,
      description: item.description ?? "",
      itemType: item.item_type,
      basePrice: String(item.base_price),
      packagingCharge: String(item.packaging_charge),
      taxRate: String(item.tax_rate),
      imageUrl: item.image_url ?? "",
      isActive: item.is_active,
      pos: item.available_on_pos,
      zomato: item.available_on_zomato,
      swiggy: item.available_on_swiggy,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { url, key } = config();
      const payload = {
        company_id: company.id,
        location_id: form.locationId,
        brand_id: form.brandId,
        category_id: form.categoryId || null,
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        description: form.description.trim() || null,
        item_type: form.itemType,
        base_price: Number(form.basePrice),
        packaging_charge: Number(form.packagingCharge || 0),
        tax_rate: Number(form.taxRate || 0),
        image_url: form.imageUrl.trim() || null,
        is_active: form.isActive,
        available_on_pos: form.pos,
        available_on_zomato: form.zomato,
        available_on_swiggy: form.swiggy,
        updated_at: new Date().toISOString(),
      };

      const endpoint = editingId ? `${url}/rest/v1/menu_items?id=eq.${editingId}` : `${url}/rest/v1/menu_items`;
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: headers(key, "return=representation"),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());
      await loadAll();
      setMessage(editingId ? "Menu item updated successfully." : "Menu item created successfully.");
      resetForm();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save menu item.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: MenuItem) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      const { url, key } = config();
      const response = await fetch(`${url}/rest/v1/menu_items?id=eq.${item.id}`, { method: "DELETE", headers: headers(key) });
      if (!response.ok) throw new Error(await response.text());
      await loadAll();
      setMessage("Menu item deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete menu item.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-7 text-slate-950 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-600">Menu Master</p>
            <h1 className="mt-2 text-3xl font-black">Central Menu Management</h1>
            <p className="mt-2 text-sm text-slate-500">Create items by location and brand, then control POS, Zomato and Swiggy availability.</p>
          </div>
          <a href="/brands" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold">Manage Brands</a>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-black">{editingId ? "Edit menu item" : "Add menu item"}</h2>
          <form onSubmit={save} className="mt-6 space-y-6">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <Select label="Location" value={form.locationId} onChange={(value) => { setField("locationId", value); setField("brandId", ""); setField("categoryId", ""); }} required options={locations.map((item) => ({ value: item.id, label: `${item.name} (${item.code})` }))} />
              <Select label="Cloud kitchen brand" value={form.brandId} onChange={(value) => { setField("brandId", value); setField("categoryId", ""); }} required options={brandOptions.map((item) => ({ value: item.id, label: item.name }))} />
              <Select label="Category" value={form.categoryId} onChange={(value) => setField("categoryId", value)} options={categoryOptions.map((item) => ({ value: item.id, label: item.name }))} />
              <Field label="Item name" value={form.name} onChange={(value) => setField("name", value)} required />
              <Field label="SKU" value={form.sku} onChange={(value) => setField("sku", value)} required />
              <Select label="Food type" value={form.itemType} onChange={(value) => setField("itemType", value as ItemType)} options={[{ value: "veg", label: "Veg" }, { value: "non_veg", label: "Non-Veg" }, { value: "egg", label: "Egg" }]} />
              <Field label="Selling price" value={form.basePrice} onChange={(value) => setField("basePrice", value)} type="number" required />
              <Field label="Packaging charge" value={form.packagingCharge} onChange={(value) => setField("packagingCharge", value)} type="number" />
              <Field label="GST %" value={form.taxRate} onChange={(value) => setField("taxRate", value)} type="number" />
              <Field label="Image URL" value={form.imageUrl} onChange={(value) => setField("imageUrl", value)} />
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold">Description</span>
              <textarea value={form.description} onChange={(event) => setField("description", event.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Check label="Item active" checked={form.isActive} onChange={(value) => setField("isActive", value)} />
              <Check label="Available on POS" checked={form.pos} onChange={(value) => setField("pos", value)} />
              <Check label="Available on Zomato" checked={form.zomato} onChange={(value) => setField("zomato", value)} />
              <Check label="Available on Swiggy" checked={form.swiggy} onChange={(value) => setField("swiggy", value)} />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
              {editingId ? <button type="button" onClick={resetForm} className="h-11 rounded-xl border border-slate-200 px-5 font-bold">Cancel</button> : null}
              <button disabled={saving} className="h-11 rounded-xl bg-slate-950 px-6 font-black text-white disabled:opacity-50">{saving ? "Saving..." : editingId ? "Update Item" : "Add Item"}</button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
            <div><p className="text-sm font-bold text-emerald-600">{items.length} items</p><h2 className="text-xl font-black">All Menu Items</h2></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item or SKU..." className="h-11 rounded-xl border border-slate-200 px-4 outline-none md:w-80" />
          </div>

          {loading ? <p className="py-10 text-center font-bold text-slate-500">Loading menu...</p> : null}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><th className="pb-3">Item</th><th className="pb-3">Brand</th><th className="pb-3">Type</th><th className="pb-3">Price</th><th className="pb-3">Channels</th><th className="pb-3">Status</th><th className="pb-3 text-right">Actions</th></tr></thead>
              <tbody>{filtered.map((item) => {
                const brand = brands.find((entry) => entry.id === item.brand_id);
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-4"><p className="font-black">{item.name}</p><p className="text-xs text-slate-400">{item.sku}</p></td>
                    <td className="py-4">{brand?.name ?? "—"}</td>
                    <td className="py-4 capitalize">{item.item_type.replace("_", "-")}</td>
                    <td className="py-4 font-black">₹{Number(item.base_price).toFixed(2)}</td>
                    <td className="py-4 text-xs text-slate-500">{[item.available_on_pos && "POS", item.available_on_zomato && "Zomato", item.available_on_swiggy && "Swiggy"].filter(Boolean).join(" • ")}</td>
                    <td className="py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                    <td className="py-4 text-right"><button onClick={() => editItem(item)} className="mr-2 rounded-lg border border-slate-200 px-3 py-2 font-bold">Edit</button><button onClick={() => void remove(item)} className="rounded-lg border border-red-100 px-3 py-2 font-bold text-red-600">Delete</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>

        {message ? <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}{required ? " *" : ""}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} step={type === "number" ? "0.01" : undefined} className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" /></label>;
}

function Select({ label, value, onChange, options, required = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}{required ? " *" : ""}</span><select value={value} onChange={(event) => onChange(event.target.value)} required={required} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"><option value="">Select</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-emerald-500" /><span className="font-bold">{label}</span></label>;
}
