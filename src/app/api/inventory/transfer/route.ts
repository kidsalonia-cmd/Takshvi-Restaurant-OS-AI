import { NextRequest, NextResponse } from "next/server";

type InventoryItem = {
  id: string;
  company_id: string;
  location_id: string;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  reorder_level: number;
  average_cost: number;
  is_active: boolean;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing.");
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

async function db(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(key), ...(init.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fromLocationId?: string;
      toLocationId?: string;
      inventoryItemId?: string;
      quantity?: number;
      note?: string;
    };

    const fromLocationId = String(body.fromLocationId || "").trim();
    const toLocationId = String(body.toLocationId || "").trim();
    const inventoryItemId = String(body.inventoryItemId || "").trim();
    const quantity = safeNumber(body.quantity);
    const note = String(body.note || "").trim().slice(0, 500);

    if (!fromLocationId || !toLocationId || !inventoryItemId) {
      return NextResponse.json({ success: false, message: "From location, to location and ingredient are required." }, { status: 400 });
    }
    if (fromLocationId === toLocationId) {
      return NextResponse.json({ success: false, message: "Source and destination locations must be different." }, { status: 400 });
    }
    if (quantity <= 0) {
      return NextResponse.json({ success: false, message: "Transfer quantity must be greater than zero." }, { status: 400 });
    }

    const sourceRows = (await db(
      `inventory_items?id=eq.${encodeURIComponent(inventoryItemId)}&location_id=eq.${encodeURIComponent(fromLocationId)}&select=id,company_id,location_id,name,sku,unit,current_stock,reorder_level,average_cost,is_active&limit=1`,
    )) as InventoryItem[];
    const source = sourceRows?.[0];
    if (!source) return NextResponse.json({ success: false, message: "Source inventory item was not found." }, { status: 404 });

    const sourceStock = safeNumber(source.current_stock);
    if (sourceStock < quantity) {
      return NextResponse.json(
        { success: false, message: `Insufficient stock. Available: ${sourceStock.toFixed(3)} ${source.unit}.` },
        { status: 409 },
      );
    }

    const locationRows = (await db(
      `locations?id=in.("${fromLocationId.replaceAll('"', "')}","${toLocationId.replaceAll('"', "')}")&select=id,name,code`,
    )) as { id: string; name: string; code: string }[];
    const fromLocation = locationRows.find((row) => row.id === fromLocationId);
    const toLocation = locationRows.find((row) => row.id === toLocationId);
    if (!fromLocation || !toLocation) {
      return NextResponse.json({ success: false, message: "One of the selected locations no longer exists." }, { status: 404 });
    }

    let destination: InventoryItem | undefined;
    if (source.sku) {
      const rows = (await db(
        `inventory_items?location_id=eq.${encodeURIComponent(toLocationId)}&sku=eq.${encodeURIComponent(source.sku)}&select=id,company_id,location_id,name,sku,unit,current_stock,reorder_level,average_cost,is_active&limit=1`,
      )) as InventoryItem[];
      destination = rows?.[0];
    }
    if (!destination) {
      const rows = (await db(
        `inventory_items?location_id=eq.${encodeURIComponent(toLocationId)}&name=eq.${encodeURIComponent(source.name)}&unit=eq.${encodeURIComponent(source.unit)}&select=id,company_id,location_id,name,sku,unit,current_stock,reorder_level,average_cost,is_active&limit=1`,
      )) as InventoryItem[];
      destination = rows?.[0];
    }

    if (destination && destination.unit !== source.unit) {
      return NextResponse.json(
        { success: false, message: `Destination item uses ${destination.unit}, but source uses ${source.unit}. Align the units before transferring.` },
        { status: 409 },
      );
    }

    const remainingSource = sourceStock - quantity;
    const sourceUpdate = (await db(
      `inventory_items?id=eq.${encodeURIComponent(source.id)}&current_stock=eq.${encodeURIComponent(String(source.current_stock))}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ current_stock: remainingSource, updated_at: new Date().toISOString() }),
      },
    )) as InventoryItem[];

    if (!Array.isArray(sourceUpdate) || !sourceUpdate.length) {
      return NextResponse.json({ success: false, message: "Source stock changed while transferring. Refresh and try again." }, { status: 409 });
    }

    let destinationAfter = 0;
    let destinationAverageCost = safeNumber(source.average_cost);
    let destinationItemId = "";

    try {
      if (destination) {
        const destinationBefore = safeNumber(destination.current_stock);
        destinationAfter = destinationBefore + quantity;
        destinationAverageCost = destinationAfter > 0
          ? ((destinationBefore * safeNumber(destination.average_cost)) + (quantity * safeNumber(source.average_cost))) / destinationAfter
          : safeNumber(source.average_cost);

        const destinationUpdate = (await db(`inventory_items?id=eq.${encodeURIComponent(destination.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            current_stock: destinationAfter,
            average_cost: destinationAverageCost,
            is_active: true,
            updated_at: new Date().toISOString(),
          }),
        })) as InventoryItem[];
        if (!destinationUpdate?.[0]) throw new Error("Destination stock could not be updated.");
        destinationItemId = destination.id;
      } else {
        destinationAfter = quantity;
        const created = (await db("inventory_items", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            company_id: source.company_id,
            location_id: toLocationId,
            name: source.name,
            sku: source.sku,
            unit: source.unit,
            current_stock: quantity,
            reorder_level: safeNumber(source.reorder_level),
            average_cost: safeNumber(source.average_cost),
            is_active: true,
            updated_at: new Date().toISOString(),
          }),
        })) as InventoryItem[];
        if (!created?.[0]) throw new Error("Destination inventory item could not be created.");
        destinationItemId = created[0].id;
      }
    } catch (destinationError) {
      try {
        await db(`inventory_items?id=eq.${encodeURIComponent(source.id)}&current_stock=eq.${encodeURIComponent(String(remainingSource))}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ current_stock: sourceStock, updated_at: new Date().toISOString() }),
        });
      } catch {
        // Preserve the original destination error. A subsequent manual stock review can resolve a rare concurrent rollback failure.
      }
      throw destinationError;
    }

    const transferNumber = `TRF-${Date.now().toString().slice(-10)}`;
    return NextResponse.json({
      success: true,
      transferNumber,
      transferredAt: new Date().toISOString(),
      note: note || null,
      item: { id: source.id, destinationItemId, name: source.name, sku: source.sku, unit: source.unit },
      quantity,
      from: { id: fromLocationId, name: fromLocation.name, remainingStock: remainingSource },
      to: { id: toLocationId, name: toLocation.name, newStock: destinationAfter, averageCost: destinationAverageCost },
      message: `${quantity.toFixed(3)} ${source.unit} of ${source.name} transferred from ${fromLocation.name} to ${toLocation.name}. Inventory updated automatically.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to transfer stock." }, { status: 500 });
  }
}
