export type QueuePost = {
  id: string;
  business_name?: string;
  google_caption: string;
  instagram_caption?: string | null;
  image_url?: string | null;
  action_url?: string | null;
  publish_google: boolean;
  publish_instagram: boolean;
  scheduled_for: string;
  status: string;
};

type GoogleCredential = {
  refresh_token?: string | null;
  access_token?: string | null;
  access_token_expires_at?: string | null;
  account_id?: string | null;
  location_id?: string | null;
  location_title?: string | null;
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

export async function getSavedGoogleCredential(): Promise<GoogleCredential | null> {
  try {
    const response = await fetch(
      supabaseUrl("cafe_google_credentials?id=eq.cafe-honeyman&select=refresh_token,access_token,access_token_expires_at,account_id,location_id,location_title&limit=1"),
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (!response.ok) return null;
    const rows = await response.json() as GoogleCredential[];
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function getGoogleAccessToken() {
  const saved = await getSavedGoogleCredential();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = saved?.refresh_token || process.env.GOOGLE_BUSINESS_REFRESH_TOKEN;

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

  if (saved?.access_token && saved.access_token_expires_at && new Date(saved.access_token_expires_at).getTime() > Date.now() + 60_000) {
    return saved.access_token;
  }

  const token = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  if (!token) throw new Error("Google Business credentials are not configured.");
  return token;
}

export async function publishGooglePost(post: QueuePost) {
  const saved = await getSavedGoogleCredential();
  const accountId = saved?.account_id || process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
  const locationId = saved?.location_id || process.env.GOOGLE_BUSINESS_LOCATION_ID;
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
      actionType: "LEARN_MORE",
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
