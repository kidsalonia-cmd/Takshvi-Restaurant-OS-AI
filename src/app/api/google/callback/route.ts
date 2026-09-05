import { NextRequest, NextResponse } from "next/server";
import { supabaseHeaders, supabaseUrl } from "@/lib/cafeSocial";

const REDIRECT_URI = "https://takshvi-restaurant-os-ai.vercel.app/api/google/callback";

function stripName(value?: string) {
  return (value || "").split("/").pop() || "";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = request.cookies.get("cafe_google_oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/integrations/social/scheduler?google=invalid_state", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/integrations/social/scheduler?google=missing_client", request.url));
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
      cache: "no-store",
    });
    const token = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || "Google token exchange failed.");

    const accountsResponse = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    const accountsData = await accountsResponse.json() as { accounts?: Array<{ name?: string; accountName?: string }> };
    if (!accountsResponse.ok || !accountsData.accounts?.length) throw new Error("No Google Business Profile account found for this Google login.");

    let chosen: { accountId: string; accountName: string; locationId: string; locationTitle: string } | null = null;
    for (const account of accountsData.accounts) {
      const accountId = stripName(account.name);
      const locationsResponse = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${encodeURIComponent(accountId)}/locations?readMask=name,title&alt=json&pageSize=100`,
        { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" },
      );
      if (!locationsResponse.ok) continue;
      const locationsData = await locationsResponse.json() as { locations?: Array<{ name?: string; title?: string }> };
      const locations = locationsData.locations || [];
      const cafe = locations.find((location) => (location.title || "").toLowerCase().includes("honeyman")) || locations[0];
      if (cafe) {
        chosen = {
          accountId,
          accountName: account.accountName || account.name || accountId,
          locationId: stripName(cafe.name),
          locationTitle: cafe.title || "Cafe Honeyman",
        };
        if ((cafe.title || "").toLowerCase().includes("honeyman")) break;
      }
    }
    if (!chosen) throw new Error("No Google Business Profile location found.");

    const existingResponse = await fetch(supabaseUrl("cafe_google_credentials?id=eq.cafe-honeyman&select=refresh_token&limit=1"), {
      headers: supabaseHeaders(), cache: "no-store",
    });
    const existing = existingResponse.ok ? await existingResponse.json() as Array<{ refresh_token?: string | null }> : [];
    const refreshToken = token.refresh_token || existing[0]?.refresh_token || null;

    const saveResponse = await fetch(supabaseUrl("cafe_google_credentials?on_conflict=id"), {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        id: "cafe-honeyman",
        refresh_token: refreshToken,
        access_token: token.access_token,
        access_token_expires_at: new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
        account_id: chosen.accountId,
        account_name: chosen.accountName,
        location_id: chosen.locationId,
        location_title: chosen.locationTitle,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!saveResponse.ok) throw new Error(`Unable to save Google connection: ${await saveResponse.text()}`);

    const response = NextResponse.redirect(new URL(`/integrations/social/scheduler?google=connected&location=${encodeURIComponent(chosen.locationTitle)}`, request.url));
    response.cookies.delete("cafe_google_oauth_state");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google connection failed.";
    return NextResponse.redirect(new URL(`/integrations/social/scheduler?google=error&message=${encodeURIComponent(message)}`, request.url));
  }
}
