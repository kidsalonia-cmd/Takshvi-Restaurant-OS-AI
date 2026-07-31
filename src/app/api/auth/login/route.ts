import { NextResponse } from "next/server";
import { createSessionToken, type SessionRole } from "@/lib/session";

const accounts: Record<
  string,
  { password: string; name: string; role: SessionRole }
> = {
  "admin@takshvi.in": {
    password: "Takshvi@123",
    name: "Ravindra Jhamb",
    role: "super_admin",
  },
  "manager@takshvi.in": {
    password: "Takshvi@123",
    name: "Location Manager",
    role: "location_manager",
  },
  "cashier@takshvi.in": {
    password: "Takshvi@123",
    name: "Cashier",
    role: "cashier",
  },
  "kitchen@takshvi.in": {
    password: "Takshvi@123",
    name: "Kitchen Staff",
    role: "kitchen",
  },
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      remember?: boolean;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400 },
      );
    }

    const account = accounts[email];
    if (!account || account.password !== password) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 401 },
      );
    }

    const secret = process.env.SESSION_SECRET || "takshvi-development-secret-change-before-production";
    const maxAge = body.remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
    const token = await createSessionToken(
      {
        email,
        name: account.name,
        role: account.role,
        expiresAt: Date.now() + maxAge * 1000,
      },
      secret,
    );

    const response = NextResponse.json({
      success: true,
      user: { email, name: account.name, role: account.role },
    });

    response.cookies.set("takshvi_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to sign in right now." },
      { status: 500 },
    );
  }
}
