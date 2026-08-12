import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { centralParkGazeboMenuGzipBase64 } from "@/lib/centralParkGazeboMenu";

type LocationRow = { id: string; company_id: string; name: string };
type BrandRow = { id: string; name: string };
type ExistingMenuRow = { id: string; sku: string | null };
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

const LOCATION_NAME = "Central Park Gazebo";
const EXPECTED_COUNT = 135;
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
  const rows = JSON.parse(json) as MenuSource[];
  if (rows.length !== EXPECTED_COUNT) {
    throw new Error(`Attached menu validation failed: expected ${EXPECTED_COUNT} rows, found ${rows.length}.`);
  }
  return rows;
}

async function resolveTarget() {
  const locations = await db(
    `locations?name=eq.${encodeURIComponent(LOCATION_NAME)}&select=id,company_id,name`,
  ) as LocationRow[];
  if (locations.length !== 1) {
    throw new Error(`Menu replacement stopped safely: expected exactly one ${LOCATION_NAME} location, found ${locations.length}.`);
  }

  const location = locations[0];
  const brands = await db(
    `brands?location_id=eq.${encodeURIComponent(location.id)}&is_active=eq.true&select=id,name&order=created_at.asc`,
  ) as BrandRow[];
  if (brands.length !== 1) {
    throw new Error(`Menu replacement stopped safely: ${LOCATION_NAME} has ${brands.length} active brands. The attached file has no Brand Code, so no existing menu was changed.`);
  }

  return { location, brand: brands[0] };
}

async function activePosRows(locationId: string, brandId: string) {
  return await db(
    `menu_items?location_id=eq.${encodeURIComponent(locationId)}&brand_id=eq.${encodeURIComponent(brandId)}&is_active=eq.true&available_on_pos=eq.true&select=id,sku&order=created_at.asc`,
  ) as ExistingMenuRow[];
}

function versionRows(rows: ExistingMenuRow[]) {
  return rows.filter((item) => String(item.sku || "").startsWith(MENU_VERSION_PREFIX));
}

function verified(rows: ExistingMenuRow[]) {
  return rows.length === EXPECTED_COUNT && versionRows(rows).length === EXPECTED_COUNT;
}

async function deactivateIds(ids: string[]) {
  if (!ids.length) return;
  const list = ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  await db(`menu_items?id=in.(${encodeURIComponent(list)})`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      is_active: false,
      available_on_pos: false,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function GET() {
  try {
    const { location, brand } = await resolveTarget();
    const source = sourceRows();
    const current = await activePosRows(location.id, brand.id);
    const currentVersionRows = versionRows(current);
    return NextResponse.json({
      success: true,
      location: location.name,
      brand: brand.name,
      sourceCount: source.length,
      activePosCount: current.length,
      replacementCount: currentVersionRows.length,
      verified: verified(current),
      message: verified(current)
        ? `Verified: ${LOCATION_NAME} has exactly ${EXPECTED_COUNT} active replacement POS items.`
        : `${LOCATION_NAME} currently has ${current.length} active POS items, of which ${currentVersionRows.length} are from the attached replacement list.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to verify Central Park Gazebo menu." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { location, brand } = await resolveTarget();
    const source = sourceRows();
    const before = await activePosRows(location.id, brand.id);
    const existingVersion = versionRows(before);

    if (verified(before)) {
      return NextResponse.json({
        success: true,
        changed: false,
        verified: true,
        oldActiveCount: 0,
        count: EXPECTED_COUNT,
        brand: brand.name,
        message: `Verified: ${LOCATION_NAME} POS menu is already the attached ${EXPECTED_COUNT}-item list.`,
      });
    }

    // If all 135 replacement rows already exist alongside old rows, only remove the old rows.
    if (existingVersion.length === EXPECTED_COUNT) {
      const oldIds = before.filter((row) => !String(row.sku || "").startsWith(MENU_VERSION_PREFIX)).map((row) => row.id);
      await deactivateIds(oldIds);
      const finalRows = await activePosRows(location.id, brand.id);
      if (!verified(finalRows)) {
        throw new Error(`Verification failed after cleanup: expected ${EXPECTED_COUNT} active replacement items, found ${finalRows.length}.`);
      }
      return NextResponse.json({
        success: true,
        changed: oldIds.length > 0,
        verified: true,
        oldActiveCount: oldIds.length,
        count: finalRows.length,
        brand: brand.name,
        message: `Verified: ${LOCATION_NAME} now has exactly ${finalRows.length} attached POS items. ${oldIds.length} old POS item(s) were deactivated.`,
      });
    }

    // Remove any partial prior replacement set before creating a fresh complete set.
    if (existingVersion.length) {
      await deactivateIds(existingVersion.map((row) => row.id));
    }

    const oldRows = before.filter((row) => !String(row.sku || "").startsWith(MENU_VERSION_PREFIX));
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

    // Failure-safe order: create the complete replacement first.
    await db("menu_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });

    const afterInsert = await activePosRows(location.id, brand.id);
    const inserted = versionRows(afterInsert);
    if (inserted.length !== EXPECTED_COUNT) {
      throw new Error(`New menu was not deactivated or switched over: expected ${EXPECTED_COUNT} replacement rows after insert, found ${inserted.length}.`);
    }

    // Only after all 135 new rows exist do we remove the previous POS menu.
    await deactivateIds(oldRows.map((row) => row.id));

    const finalRows = await activePosRows(location.id, brand.id);
    if (!verified(finalRows)) {
      throw new Error(`Final menu verification failed: expected exactly ${EXPECTED_COUNT} active replacement items, found ${finalRows.length}.`);
    }

    return NextResponse.json({
      success: true,
      changed: true,
      verified: true,
      oldActiveCount: oldRows.length,
      count: finalRows.length,
      brand: brand.name,
      message: `Verified: ${LOCATION_NAME} POS menu replaced with exactly ${finalRows.length} attached items. ${oldRows.length} old POS item(s) were deactivated safely.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, verified: false, message: error instanceof Error ? error.message : "Unable to replace Central Park Gazebo menu." }, { status: 500 });
  }
}
