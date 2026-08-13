import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("takshvi_session")?.value;
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });
  const secret = process.env.SESSION_SECRET || "takshvi-development-secret-change-before-production";
  const session = await verifySessionToken(token, secret);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user: session });
}
