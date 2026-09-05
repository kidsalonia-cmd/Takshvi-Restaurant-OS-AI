import { NextResponse } from "next/server";

export async function GET() {
  const instagram = Boolean(
    process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  );

  const google = Boolean(
    process.env.GOOGLE_BUSINESS_ACCESS_TOKEN &&
      process.env.GOOGLE_BUSINESS_ACCOUNT_ID &&
      process.env.GOOGLE_BUSINESS_LOCATION_ID,
  );

  return NextResponse.json({
    business: "Cafe Honeyman",
    instagram,
    google,
    ready: instagram || google,
  });
}
