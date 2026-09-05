import { NextResponse } from "next/server";
import { supabaseHeaders, supabaseUrl } from "@/lib/cafeSocial";

type ScheduleBody = {
  title?: string;
  focus?: string;
  googleCaption?: string;
  instagramCaption?: string;
  imageUrl?: string;
  actionUrl?: string;
  publishGoogle?: boolean;
  publishInstagram?: boolean;
  scheduledFor?: string;
};

export async function GET() {
  try {
    const response = await fetch(
      supabaseUrl("cafe_social_post_queue?business_name=eq.Cafe%20Honeyman&select=*&order=scheduled_for.desc&limit=100"),
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (!response.ok) throw new Error(await response.text());
    return NextResponse.json({ success: true, posts: await response.json() });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to load scheduled posts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScheduleBody;
    if (!body.googleCaption?.trim()) {
      return NextResponse.json({ success: false, message: "Google caption is required." }, { status: 400 });
    }
    if (!body.scheduledFor) {
      return NextResponse.json({ success: false, message: "Schedule date/time is required." }, { status: 400 });
    }

    const payload = {
      business_name: "Cafe Honeyman",
      title: body.title || null,
      focus: body.focus || null,
      google_caption: body.googleCaption.trim(),
      instagram_caption: body.instagramCaption?.trim() || null,
      image_url: body.imageUrl?.trim() || null,
      action_url: body.actionUrl?.trim() || null,
      publish_google: body.publishGoogle !== false,
      publish_instagram: Boolean(body.publishInstagram),
      scheduled_for: new Date(body.scheduledFor).toISOString(),
      status: "scheduled",
    };

    const response = await fetch(supabaseUrl("cafe_social_post_queue"), {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return NextResponse.json({ success: true, post: rows[0] });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to schedule post." }, { status: 500 });
  }
}
