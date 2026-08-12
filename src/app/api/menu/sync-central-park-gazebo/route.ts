import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { centralParkGazeboMenuGzipBase64 } from "@/lib/centralParkGazeboMenu";

type LocationRow = { id: string; company_id: string; name: string };
type BrandRow = { id: string; name: string };
type ExistingMenuRow = { sku: string | null };
type MenuSource = {
  name: string;
  onlineName: string;
  description: string | null;
  category: string;
  onlineCategory: string | null;
  price: number;
  itemType: "veg" | "non_veg" | "egg";
  taxRate: number;
  sku: string;
};

const MENU_VERSION_PREFIX = "CPG-20260812-";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing.");
  return { url, key };
}

async function db(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function sourceRows(): MenuSource[] {
  const json = gunzipSync(Buffer.from(centralParkGazeboMenuGzipBase64, "base64")).toString("utf8");
  return JSON.parse(json) as MenuSource[];
}

export async function POST() {
  try {
    const locations = await db(`locations?name=eq.${encodeURIComponent("Central Park Gazebo")}&select=id,company_id,name`) as LocationRow[];
    if (locations.length !== 1) {
      return NextResponse.json({ success: false, message: `Menu replacement stopped safely: expected exactly one Central Park Gazebo location, found ${locations.length}.` }, { status: 409 });
    }
    const location = locations[0];
    const brands = await db(`brands?location_id=eq.${encodeURIComponent(location.id)}&is_active=eq.true&select=id,name&order=created_at.asc`) as BrandRow[];
    if (brands.length !== 1) {
      return NextResponse.json({ success: false, message: `Menu replacement stopped safely: Central Park Gazebo has ${brands.length} active brands. The attached file has no Brand Code, so no existing menu was changed.` }, { status: 409 });
    }
    const brand = brands[0];
    const source = sourceRows();
    if (source.length !== 135) throw new Error(`Attached menu validation failed: expected 135 rows, found ${source.length}.`);

    const current = await db(`menu_items?location_id=eq.${encodeURIComponent(location.id)}&brand_id=eq.${encodeURIComponent(brand.id)}&is_active=eq.true&available_on_pos=eq.true&select=sku`) as ExistingMenuRow[];
    const alreadyApplied = current.length === source.length && current.every((item) => String(item.sku || "").startsWith(MENU_VERSION_PREFIX));
    if (alreadyApplied) {
      return NextResponse.json({ success: true, changed: false, count: source.length, brand: brand.name, message: "Central Park Gazebo POS menu is already updated to the attached 135-item list." });
    }

    await db(`menu_items?location_id=eq.${encodeURIComponent(location.id)}&brand_id=eq.${encodeURIComponent(brand.id)}&available_on_pos=eq.true`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false, available_on_pos: false, updated_at: new Date().toISOString() }),
    });

    const createdAt = new Date().toISOString();
    const payload = source.map((item, index) => ({
      company_id: location.company_id,
      location_id: location.id,
      brand_id: brand.id,
      category_id: null,
      name: item.name,
      sku: `${MENU_VERSION_PREFIX}${String(index + 1).padStart(3, "0")}-${item.sku}`.slice(0, 80),
      description: item.description || item.onlineName || null,
      item_type: item.itemType,
      base_price: Number(item.price),
      packaging_charge: 0,
      tax_rate: Number(item.taxRate || 5),
      image_url: null,
      is_active: true,
      available_on_pos: true,
      available_on_zomato: false,
      available_on_swiggy: false,
      created_at: createdAt,
      updated_at: createdAt,
    }));

    await db("menu_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ success: true, changed: true, count: payload.length, brand: brand.name, message: `Central Park Gazebo POS menu replaced with ${payload.length} attached items.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to replace Central Park Gazebo menu." }, { status: 500 });
  }
}
