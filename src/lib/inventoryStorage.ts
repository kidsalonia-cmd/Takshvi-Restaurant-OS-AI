const BUCKET = "inventory-purchase-bills";

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role storage configuration is missing.");
  return { url, key };
}
function headers(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, ...extra }; }
function safeName(value: string) { return value.replace(/[\\/]+/g, "-").replace(/[^a-zA-Z0-9._ -]/g, "").trim() || "purchase-bill"; }

async function ensureBucket() {
  const { url, key } = cfg();
  const check = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers: headers(key), cache: "no-store" });
  if (check.ok) return;
  if (check.status !== 404) throw new Error(await check.text());
  const create = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 52428800, allowed_mime_types: ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "application/csv", "application/octet-stream"] }),
  });
  if (!create.ok && create.status !== 409) throw new Error(await create.text());
}

export async function savePurchaseBill(locationId: string, fileName: string, buffer: Buffer) {
  await ensureBucket();
  const { url, key } = cfg();
  const path = `${locationId}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeName(fileName)}`;
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: headers(key, { "Content-Type": "application/octet-stream" }),
    body: new Uint8Array(buffer),
  });
  if (!response.ok) throw new Error(await response.text());
  return path;
}
