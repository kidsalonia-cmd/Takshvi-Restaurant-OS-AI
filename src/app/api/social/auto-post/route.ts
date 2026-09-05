import { NextRequest, NextResponse } from "next/server";
import { publishGooglePost, supabaseHeaders, supabaseUrl, type QueuePost } from "@/lib/cafeSocial";

const morningFocus = ["Coffee", "Cafe Food", "Fresh Juice"] as const;
const eveningFocus = ["Waffles", "Ice Cream", "Pasta", "Shakes"] as const;

const captions: Record<string, string[]> = {
  Coffee: [
    "Start your day with fresh coffee and relaxed cafe vibes at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram.",
    "Coffee break near Sector 49? Drop into Cafe Honeyman at Sapphire Mall for a fresh cup and an easy start to the day.",
  ],
  "Cafe Food": [
    "Cafe cravings in Sector 49, Gurugram? Visit Cafe Honeyman at Sapphire Mall for comforting food, drinks and a relaxed break.",
    "Make your next cafe stop Cafe Honeyman at Sapphire Mall, Sector 49 — food, coffee and easy-going vibes in one place.",
  ],
  "Fresh Juice": [
    "Refresh your day with fresh juice at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram.",
    "Fresh juice, chilled flavours and a quick cafe break — find it at Cafe Honeyman in Sapphire Mall, Sector 49.",
  ],
  Waffles: [
    "Evening sweet craving? Warm waffles are waiting at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram.",
    "Waffles and cafe-time cravings sorted at Cafe Honeyman in Sapphire Mall, Sector 49.",
  ],
  "Ice Cream": [
    "Cool down your evening with ice cream at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram.",
    "Ice cream cravings near Sector 49? Visit Cafe Honeyman at Sapphire Mall for a sweet evening break.",
  ],
  Pasta: [
    "Pasta cravings this evening? Visit Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram for a comforting cafe meal.",
    "Make it a pasta evening at Cafe Honeyman in Sapphire Mall, Sector 49 — pair it with coffee, shakes or fresh juice.",
  ],
  Shakes: [
    "Shake up your evening with thick, chilled favourites at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram.",
    "Craving a shake near Sector 49? Cafe Honeyman at Sapphire Mall has your evening refreshment sorted.",
  ],
};

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function dayIndex(dateString: string) {
  const [y, m, d] = dateString.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

async function patchPost(id: string, payload: Record<string, unknown>) {
  const response = await fetch(supabaseUrl(`cafe_social_post_queue?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders(),
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function run(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { date, hour } = istParts();
    const forcedSlot = request.nextUrl.searchParams.get("slot");
    const slot = forcedSlot === "morning" || forcedSlot === "evening" ? forcedSlot : hour < 13 ? "morning" : "evening";
    const index = dayIndex(date);
    const pool = slot === "morning" ? morningFocus : eveningFocus;
    const focus = pool[index % pool.length];
    const captionList = captions[focus];
    const caption = captionList[index % captionList.length];
    const uniqueTitle = `AUTO-${date}-${slot}`;

    const existingResponse = await fetch(
      supabaseUrl(`cafe_social_post_queue?title=eq.${encodeURIComponent(uniqueTitle)}&select=id,status&limit=1`),
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (!existingResponse.ok) throw new Error(await existingResponse.text());
    const existing = await existingResponse.json() as Array<{ id: string; status: string }>;
    if (existing.length) {
      return NextResponse.json({ success: true, skipped: true, reason: "This slot was already created.", post: existing[0] });
    }

    const imageUrl = `${request.nextUrl.origin}/api/social/cafe-image?focus=${encodeURIComponent(focus)}&slot=${slot}&date=${date}`;
    const actionUrl = process.env.CAFE_HONEYMAN_CTA_URL || "https://wa.me/919971008363";
    const now = new Date().toISOString();
    const payload = {
      business_name: "Cafe Honeyman",
      title: uniqueTitle,
      focus,
      google_caption: caption,
      instagram_caption: null,
      image_url: imageUrl,
      action_url: actionUrl,
      publish_google: true,
      publish_instagram: false,
      scheduled_for: now,
      status: "scheduled",
    };

    const insertResponse = await fetch(supabaseUrl("cafe_social_post_queue"), {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(payload),
    });
    if (!insertResponse.ok) throw new Error(await insertResponse.text());
    const rows = await insertResponse.json() as QueuePost[];
    const post = rows[0];
    if (!post?.id) throw new Error("Automatic post was not created.");

    try {
      const googlePostId = await publishGooglePost(post);
      await patchPost(post.id, {
        status: "published",
        google_post_id: googlePostId,
        published_at: new Date().toISOString(),
        last_error: null,
      });
      return NextResponse.json({ success: true, slot, focus, googlePostId, imageUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google publishing failed.";
      await patchPost(post.id, { status: "failed", last_error: message });
      return NextResponse.json({ success: false, slot, focus, message }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Automatic Cafe post failed." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
