export type SessionRole =
  | "super_admin"
  | "company_admin"
  | "location_manager"
  | "cashier"
  | "kitchen";

export type SessionPayload = {
  email: string;
  name: string;
  role: SessionRole;
  expiresAt: number;
};

const encoder = new TextEncoder();

function toBase64Url(value: Uint8Array | string) {
  const binary =
    typeof value === "string"
      ? value
      : Array.from(value, (byte) => String.fromCharCode(byte)).join("");

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(payload: SessionPayload, secret: string) {
  const body = toBase64Url(JSON.stringify(payload));
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string, secret: string) {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    const key = await getKey(secret);
    const signatureBytes = Uint8Array.from(fromBase64Url(signature), (char) =>
      char.charCodeAt(0),
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(body),
    );

    if (!valid) return null;

    const payload = JSON.parse(fromBase64Url(body)) as SessionPayload;
    if (!payload.expiresAt || payload.expiresAt <= Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
