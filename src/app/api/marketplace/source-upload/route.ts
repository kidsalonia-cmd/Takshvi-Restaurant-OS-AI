import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { saveMarketplaceSourceFile } from "@/lib/marketplaceStorage";

async function database(path: string, init: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !key) throw new Error("Supabase environment variables are missing.");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "File is required." }, { status: 400 });

    const locationId = String(formData.get("locationId") || "").trim();
    const brandId = String(formData.get("brandId") || "").trim();
    const uploadSlot = String(formData.get("uploadSlot") || "").trim();
    const periodStart = String(formData.get("periodStart") || "").trim();
    const periodEnd = String(formData.get("periodEnd") || "").trim();
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    if (uploadSlot !== "swiggy_payout") {
      return NextResponse.json({ success: false, message: "PDF/JPEG/PNG source uploads are currently supported for Swiggy payout rows only." }, { status: 400 });
    }
    if (!locationId || !brandId) return NextResponse.json({ success: false, message: "Location and brand are required." }, { status: 400 });
    if (!periodStart || !periodEnd || periodEnd < periodStart) return NextResponse.json({ success: false, message: "Select a valid week." }, { status: 400 });
    if (!["pdf", "jpg", "jpeg", "png"].includes(extension)) {
      return NextResponse.json({ success: false, message: "Only PDF, JPG, JPEG and PNG are supported by this source uploader." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const duplicateQuery = [
      `file_hash=eq.${fileHash}`,
      `location_id=eq.${encodeURIComponent(locationId)}`,
      `brand_id=eq.${encodeURIComponent(brandId)}`,
      "report_type=eq.swiggy_payout",
      `period_start=eq.${encodeURIComponent(periodStart)}`,
      `period_end=eq.${encodeURIComponent(periodEnd)}`,
      "select=id",
      "limit=1",
    ].join("&");

    const duplicate = await database(`marketplace_reports?${duplicateQuery}`, { method: "GET" });
    if (Array.isArray(duplicate) && duplicate.length) {
      return NextResponse.json({ success: false, duplicate: true, message: "This Swiggy source file is already saved for the selected brand and week." }, { status: 409 });
    }

    const created = await database("marketplace_reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        marketplace: "swiggy",
        report_type: "swiggy_payout",
        restaurant_name: null,
        location_id: locationId,
        brand_id: brandId,
        period_start: periodStart,
        period_end: periodEnd,
        original_file_name: file.name,
        file_size_bytes: file.size,
        file_hash: fileHash,
        processing_status: "source_only",
        detected_columns: [],
        summary: null,
      }),
    });

    const reportId = created?.[0]?.id;
    if (!reportId) throw new Error("Unable to create report record.");

    try {
      await saveMarketplaceSourceFile(reportId, file.name, buffer, file.type);
    } catch (error) {
      await database(`marketplace_reports?id=eq.${encodeURIComponent(reportId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      throw error;
    }

    return NextResponse.json({
      success: true,
      reportId,
      marketplace: "swiggy",
      reportType: "swiggy_payout",
      periodStart,
      periodEnd,
      message: "Swiggy source file saved. PDF/JPEG/PNG is stored for review; automatic payout extraction currently runs only on Excel/CSV files.",
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to save Swiggy source file." }, { status: 500 });
  }
}
