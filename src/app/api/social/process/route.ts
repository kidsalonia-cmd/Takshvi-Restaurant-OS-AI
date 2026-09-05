import { NextResponse } from "next/server";
import { publishGooglePost, supabaseHeaders, supabaseUrl, type QueuePost } from "@/lib/cafeSocial";

async function patchPost(id: string, payload: Record<string, unknown>) {
  const response = await fetch(supabaseUrl(`cafe_social_post_queue?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders(),
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function processDue(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const now = new Date().toISOString();
    const response = await fetch(
      supabaseUrl(`cafe_social_post_queue?business_name=eq.Cafe%20Honeyman&status=eq.scheduled&scheduled_for=lte.${encodeURIComponent(now)}&select=*&order=scheduled_for.asc&limit=20`),
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (!response.ok) throw new Error(await response.text());
    const posts = (await response.json()) as QueuePost[];

    const results: Array<Record<string, unknown>> = [];
    for (const post of posts) {
      try {
        let googlePostId: string | undefined;
        if (post.publish_google) googlePostId = await publishGooglePost(post);
        const waitingForInstagram = post.publish_instagram && !process.env.META_ACCESS_TOKEN;
        await patchPost(post.id, {
          status: waitingForInstagram ? "google_published_instagram_waiting" : "published",
          google_post_id: googlePostId || null,
          published_at: new Date().toISOString(),
          last_error: waitingForInstagram ? "Instagram waiting for Meta API credentials." : null,
        });
        results.push({ id: post.id, success: true, googlePostId, instagram: waitingForInstagram ? "waiting" : "not_selected" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Publishing failed.";
        await patchPost(post.id, { status: "failed", last_error: message });
        results.push({ id: post.id, success: false, message });
      }
    }

    return NextResponse.json({ success: true, processed: posts.length, results });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to process scheduled posts." }, { status: 500 });
  }
}

export async function POST(request: Request) { return processDue(request); }
export async function GET(request: Request) { return processDue(request); }
