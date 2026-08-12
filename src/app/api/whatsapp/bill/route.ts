import { NextRequest, NextResponse } from "next/server";

type BillLine = { name: string; quantity: number; unitPrice: number; amount: number };
type BillPayload = {
  customerPhone: string;
  customerName?: string;
  orderNumber: string;
  brandName: string;
  locationName: string;
  createdAt: string;
  paymentMethod: string;
  subtotal: number;
  packaging: number;
  tax: number;
  discount: number;
  grandTotal: number;
  lines: BillLine[];
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function money(value: number) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function billText(bill: BillPayload) {
  const items = bill.lines.map((line) => `${line.quantity} x ${line.name} - ${money(line.amount)}`).join("\n");
  return [
    `*${bill.brandName}*`,
    bill.locationName,
    "",
    `*Bill ${bill.orderNumber}*`,
    bill.createdAt,
    bill.customerName ? `Customer: ${bill.customerName}` : "",
    "",
    items,
    "",
    `Subtotal: ${money(bill.subtotal)}`,
    bill.packaging ? `Packaging: ${money(bill.packaging)}` : "",
    bill.tax ? `Tax: ${money(bill.tax)}` : "",
    bill.discount ? `Discount: -${money(bill.discount)}` : "",
    `*Total: ${money(bill.grandTotal)}*`,
    `Payment: ${bill.paymentMethod.toUpperCase()}`,
    "",
    "Thank you for visiting us!",
  ].filter(Boolean).join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ success: false, message: "WhatsApp Business is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel environment variables." }, { status: 503 });
    }

    const bill = (await request.json()) as BillPayload;
    const to = normalizePhone(String(bill.customerPhone || ""));
    if (to.length < 11 || to.length > 15) return NextResponse.json({ success: false, message: "Enter a valid customer WhatsApp number with country code." }, { status: 400 });
    if (!bill.orderNumber || !bill.brandName || !Array.isArray(bill.lines) || !bill.lines.length) return NextResponse.json({ success: false, message: "Bill details are incomplete." }, { status: 400 });

    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: billText(bill) } }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = data?.error?.message || "WhatsApp rejected the message.";
      return NextResponse.json({ success: false, message: detail }, { status: response.status });
    }
    return NextResponse.json({ success: true, messageId: data?.messages?.[0]?.id || null, to, message: `Bill ${bill.orderNumber} sent directly to WhatsApp.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to send WhatsApp bill." }, { status: 500 });
  }
}
