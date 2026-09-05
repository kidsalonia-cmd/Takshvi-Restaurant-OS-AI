import { NextResponse } from "next/server";

type PublishBody = {
  channels?: ("instagram" | "google")[];
  imageUrl?: string;
  instagramCaption?: string;
  googleCaption?: string;
  actionUrl?: string;
  actionType?: "LEARN_MORE" | "ORDER" | "BOOK" | "SHOP" | "SIGN_UP" | "CALL";
};

type ChannelResult = {
  success: boolean;
  id?: string;
  message?: string;
};

async function publishInstagram(body: PublishBody): Promise<ChannelResult> {
  const token = process.env.META_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";

  if (!token || !igId) {
    return { success: false, message: "Instagram API credentials are not configured." };
  }
  if (!body.imageUrl) {
    return { success: false, message: "Instagram requires a public image URL." };
  }

  const create = new URLSearchParams({
    image_url: body.imageUrl,
    caption: body.instagramCaption || "Cafe Honeyman",
    access_token: token,
  });

  const createResponse = await fetch(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(igId)}/media`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: create.toString() },
  );
  const createData = (await createResponse.json()) as { id?: string; error?: { message?: string } };
  if (!createResponse.ok || !createData.id) {
    return { success: false, message: createData.error?.message || "Unable to create Instagram media container." };
  }

  const publish = new URLSearchParams({ creation_id: createData.id, access_token: token });
  const publishResponse = await fetch(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(igId)}/media_publish`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: publish.toString() },
  );
  const publishData = (await publishResponse.json()) as { id?: string; error?: { message?: string } };
  if (!publishResponse.ok || !publishData.id) {
    return { success: false, message: publishData.error?.message || "Unable to publish Instagram post." };
  }

  return { success: true, id: publishData.id };
}

async function publishGoogle(body: PublishBody): Promise<ChannelResult> {
  const token = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID;

  if (!token || !accountId || !locationId) {
    return { success: false, message: "Google Business Profile credentials are not configured." };
  }

  const payload: Record<string, unknown> = {
    languageCode: "en-US",
    summary: body.googleCaption || "Cafe Honeyman",
    topicType: "STANDARD",
  };

  if (body.imageUrl) {
    payload.media = [{ mediaFormat: "PHOTO", sourceUrl: body.imageUrl }];
  }
  if (body.actionUrl) {
    payload.callToAction = {
      actionType: body.actionType || "LEARN_MORE",
      url: body.actionUrl,
    };
  }

  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = (await response.json()) as { name?: string; error?: { message?: string } };
  if (!response.ok) {
    return { success: false, message: data.error?.message || "Unable to publish Google Business Profile post." };
  }

  return { success: true, id: data.name };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublishBody;
    const channels = body.channels || [];

    if (!channels.length) {
      return NextResponse.json({ success: false, message: "Select at least one publishing channel." }, { status: 400 });
    }

    const results: Record<string, ChannelResult> = {};
    if (channels.includes("instagram")) results.instagram = await publishInstagram(body);
    if (channels.includes("google")) results.google = await publishGoogle(body);

    const success = Object.values(results).some((result) => result.success);
    return NextResponse.json({ success, business: "Cafe Honeyman", results }, { status: success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to publish campaign." },
      { status: 500 },
    );
  }
}
