export type QueuePost = {
  id: string;
  business_slug: string;
  google_caption: string;
  instagram_caption?: string | null;
  image_url?: string | null;
  action_url?: string | null;
  action_type?: string | null;
  publish_google: boolean;
  publish_instagram: boolean;
  scheduled_for: string;
  status: string;
};

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are missing.");
  return { url, key };
}

export function supabaseHeaders(extra?: Record<string, string>) {
  const { key } = supabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function supabaseUrl(path: string) {
  const { url } = supabaseConfig();
  return `${url}/rest/v1/${path}`;
}

export async function getGoogleAccessToken() {
  const refreshToken = process.env.GOOGLE_BUSINESS_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    const data = (await response.json()) as { access_token?: string; error_description?: string };
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || "Unable to refresh Google Business access token.");
    }
    return data.access_token;
  }

  const token = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  if (!token) throw new Error("Google Business credentials are not configured.");
  return token;
}

export async function publishGooglePost(post: QueuePost) {
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID;
  if (!accountId || !locationId) throw new Error("Google Business account/location IDs are missing.");

  const token = await getGoogleAccessToken();
  const payload: Record<string, unknown> = {
    languageCode: "en-US",
    summary: post.google_caption,
    topicType: "STANDARD",
  };
  if (post.image_url) payload.media = [{ mediaFormat: "PHOTO", sourceUrl: post.image_url }];
  if (post.action_url) {
    payload.callToAction = {
      actionType: post.action_type || "LEARN_MORE",
      url: post.action_url,
    };
  }

  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const data = (await response.json()) as { name?: string; error?: { message?: string } };
  if (!response.ok || !data.name) throw new Error(data.error?.message || "Google Business post failed.");
  return data.name;
}
