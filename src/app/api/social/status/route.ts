import { NextResponse } from "next/server";
import { getSavedGoogleCredential } from "@/lib/cafeSocial";

export async function GET() {
  const instagram = Boolean(
    process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  );

  const saved = await getSavedGoogleCredential();
  const google = Boolean(
    (saved?.refresh_token || saved?.access_token || process.env.GOOGLE_BUSINESS_ACCESS_TOKEN) &&
      (saved?.account_id || process.env.GOOGLE_BUSINESS_ACCOUNT_ID) &&
      (saved?.location_id || process.env.GOOGLE_BUSINESS_LOCATION_ID),
  );

  return NextResponse.json({
    business: "Cafe Honeyman",
    instagram,
    google,
    googleLocation: saved?.location_title || null,
    ready: instagram || google,
  });
}
