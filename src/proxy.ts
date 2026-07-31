import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";

const publicPaths = ["/login", "/unauthorized"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("takshvi_session")?.value;
  const secret = process.env.SESSION_SECRET || "takshvi-development-secret-change-before-production";
  const session = token ? await verifySessionToken(token, secret) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-takshvi-user", session.email);
  response.headers.set("x-takshvi-role", session.role);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
