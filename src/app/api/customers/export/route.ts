import { NextResponse } from "next/server";

type OrderRow = {
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  grand_total: number | string | null;
  discount_amount: number | string | null;
};

type CustomerSummary = {
  name: string;
  phone: string;
  visits: number;
  lifetimeSales: number;
  totalDiscount: number;
  lastVisit: string;
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

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    const { url, key } = config();
    const response = await fetch(
      `${url}/rest/v1/orders?select=customer_name,customer_phone,created_at,grand_total,discount_amount&customer_phone=not.is.null&order=created_at.asc&limit=10000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(await response.text());
    const rows = (await response.json()) as OrderRow[];

    const grouped = new Map<string, CustomerSummary>();
    for (const row of rows) {
      const phone = digits(String(row.customer_phone || ""));
      const name = String(row.customer_name || "").trim();
      if (!phone && !name) continue;
      const keyValue = phone || name.toLowerCase();
      const current = grouped.get(keyValue) || {
        name,
        phone,
        visits: 0,
        lifetimeSales: 0,
        totalDiscount: 0,
        lastVisit: row.created_at,
      };
      current.visits += 1;
      current.lifetimeSales += Number(row.grand_total || 0);
      current.totalDiscount += Number(row.discount_amount || 0);
      if (!current.name && name) current.name = name;
      if (!current.phone && phone) current.phone = phone;
      if (row.created_at > current.lastVisit) current.lastVisit = row.created_at;
      grouped.set(keyValue, current);
    }

    const header = ["Customer Name", "Phone Number", "Visits", "Lifetime Sales", "Total Discount", "Last Visit"];
    const body = Array.from(grouped.values())
      .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit))
      .map((customer) => [
        customer.name,
        customer.phone,
        customer.visits,
        customer.lifetimeSales.toFixed(2),
        customer.totalDiscount.toFixed(2),
        new Date(customer.lastVisit).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      ]);

    const csv = `\uFEFF${[header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="Takshvi_Customers_${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to export customers." }, { status: 500 });
  }
}
