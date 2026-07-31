import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers() {
  return {
    apikey: key ?? "",
    Authorization: `Bearer ${key ?? ""}`,
    "Content-Type": "application/json",
  };
}

export async function GET() {
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500 });
  }

  const response = await fetch(`${url}/rest/v1/companies?select=*&order=created_at.asc&limit=1`, {
    headers: headers(),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: await response.text() }, { status: response.status });
  }

  const rows = await response.json();
  return NextResponse.json({ company: rows[0] ?? null });
}

export async function POST(request: Request) {
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500 });
  }

  const body = await request.json();
  const existingResponse = await fetch(`${url}/rest/v1/companies?select=id&order=created_at.asc&limit=1`, {
    headers: headers(),
    cache: "no-store",
  });

  if (!existingResponse.ok) {
    return NextResponse.json({ error: await existingResponse.text() }, { status: existingResponse.status });
  }

  const existing = await existingResponse.json();
  const payload = {
    name: body.name,
    legal_name: body.legalName || null,
    gstin: body.gstin || null,
    pan: body.pan || null,
    email: body.email || null,
    phone: body.phone || null,
    website: body.website || null,
    currency: body.currency || "INR",
    timezone: body.timezone || "Asia/Kolkata",
    updated_at: new Date().toISOString(),
  };

  const endpoint = existing[0]?.id
    ? `${url}/rest/v1/companies?id=eq.${existing[0].id}`
    : `${url}/rest/v1/companies`;

  const response = await fetch(endpoint, {
    method: existing[0]?.id ? "PATCH" : "POST",
    headers: {
      ...headers(),
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return NextResponse.json({ error: await response.text() }, { status: response.status });
  }

  const rows = await response.json();
  return NextResponse.json({ company: rows[0] ?? payload });
}
