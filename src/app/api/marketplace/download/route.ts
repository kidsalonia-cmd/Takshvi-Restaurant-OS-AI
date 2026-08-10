import { NextRequest, NextResponse } from "next/server";
import { getMarketplaceSourceFile, safeSourceFileName } from "@/lib/marketplaceStorage";

async function database(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !key) throw new Error("Supabase environment variables are missing.");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function contentType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "xls") return "application/vnd.ms-excel";
  if (extension === "csv") return "text/csv; charset=utf-8";
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return "application/octet-stream";
}

export async function GET(request: NextRequest) {
  try {
    const reportId = String(request.nextUrl.searchParams.get("reportId") || "").trim();
    if (!reportId) return NextResponse.json({ success: false, message: "Report ID is required." }, { status: 400 });

    const rows = await database(`marketplace_reports?id=eq.${encodeURIComponent(reportId)}&select=id,original_file_name&limit=1`);
    const report = Array.isArray(rows) ? rows[0] : null;
    if (!report?.original_file_name) {
      return NextResponse.json({ success: false, message: "Original file metadata was not found." }, { status: 404 });
    }

    const file = await getMarketplaceSourceFile(report.id, report.original_file_name);
    if (!file) {
      return NextResponse.json(
        {
          success: false,
          message: "The original source file was not stored for this older upload. Re-upload the file to enable downloads.",
        },
        { status: 404 },
      );
    }

    const fileName = safeSourceFileName(report.original_file_name);
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": contentType(fileName),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to download source file." }, { status: 500 });
  }
}
