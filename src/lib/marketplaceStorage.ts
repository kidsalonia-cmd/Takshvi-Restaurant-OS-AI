const BUCKET = "marketplace-source-files";

function config() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error("Supabase service role storage configuration is missing.");
  return { baseUrl, serviceKey };
}

function headers(serviceKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra,
  };
}

export function safeSourceFileName(fileName: string) {
  const cleaned = fileName.replace(/[\\/]+/g, "-").replace(/[^a-zA-Z0-9._ -]/g, "").trim();
  return cleaned || "source-file.xlsx";
}

export function sourceObjectPath(reportId: string, fileName: string) {
  return `${reportId}/${safeSourceFileName(fileName)}`;
}

async function ensureBucket() {
  const { baseUrl, serviceKey } = config();
  const check = await fetch(`${baseUrl}/storage/v1/bucket/${BUCKET}`, {
    headers: headers(serviceKey),
    cache: "no-store",
  });
  if (check.ok) return;
  if (check.status !== 404) throw new Error(await check.text());

  const create = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(serviceKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: 52428800,
      allowed_mime_types: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "application/csv",
        "application/octet-stream",
      ],
    }),
  });
  if (!create.ok && create.status !== 409) throw new Error(await create.text());
}

export async function saveMarketplaceSourceFile(reportId: string, fileName: string, buffer: Buffer, contentType?: string) {
  await ensureBucket();
  const { baseUrl, serviceKey } = config();
  const path = sourceObjectPath(reportId, fileName);
  const response = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: headers(serviceKey, {
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    }),
    body: buffer,
  });
  if (!response.ok) throw new Error(await response.text());
  return path;
}

export async function getMarketplaceSourceFile(reportId: string, fileName: string) {
  const { baseUrl, serviceKey } = config();
  const path = sourceObjectPath(reportId, fileName);
  const response = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    headers: headers(serviceKey),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteMarketplaceSourceFiles(files: { id: string; original_file_name?: string | null }[]) {
  if (!files.length) return;
  try {
    const { baseUrl, serviceKey } = config();
    const prefixes = files
      .filter((file) => file.original_file_name)
      .map((file) => sourceObjectPath(file.id, String(file.original_file_name)));
    if (!prefixes.length) return;
    await fetch(`${baseUrl}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: headers(serviceKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes }),
    });
  } catch {
    // Database deletion should not be blocked by storage cleanup failure.
  }
}
