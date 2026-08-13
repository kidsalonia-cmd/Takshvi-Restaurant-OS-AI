import { NextRequest, NextResponse } from "next/server";

type OrderRow = {
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
};

type Customer = {
  name: string;
  phone: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing.");
  return { url, key };
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    const type = request.nextUrl.searchParams.get("type") === "phone" ? "phone" : "name";
    const comparable = type === "phone" ? digits(query) : query;
    if (comparable.length < 4) return NextResponse.json({ customers: [] });

    const { url, key } = config();
    const filter = type === "phone"
      ? `customer_phone=ilike.*${encodeURIComponent(digits(query))}*`
      : `customer_name=ilike.${encodeURIComponent(query)}*`;

    const response = await fetch(
      `${url}/rest/v1/orders?select=customer_name,customer_phone,created_at&customer_phone=not.is.null&${filter}&order=created_at.desc&limit=30`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(await response.text());
    const rows = (await response.json()) as OrderRow[];

    const seen = new Set<string>();
    const customers: Customer[] = [];
    for (const row of rows) {
      const phone = digits(String(row.customer_phone || ""));
      const name = String(row.customer_name || "").trim();
      const identity = phone || name.toLowerCase();
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      customers.push({ name, phone });
      if (customers.length >= 8) break;
    }

    return NextResponse.json(
      { customers },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" } },
    );
  } catch (error) {
    return NextResponse.json({ customers: [], message: error instanceof Error ? error.message : "Unable to search customers." }, { status: 500 });
  }
}
