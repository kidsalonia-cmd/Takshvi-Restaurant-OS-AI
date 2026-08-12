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

type WhatsAppErrorPayload = { error?: { message?: string } };
type WhatsAppMessagePayload = { messages?: { id?: string }[] } & WhatsAppErrorPayload;
type WhatsAppMediaPayload = { id?: string } & WhatsAppErrorPayload;

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function money(value: number) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function pdfMoney(value: number) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function safePdfText(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  const clean = safePdfText(value);
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 3))}...` : clean;
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

function invoiceLines(bill: BillPayload) {
  const lines: string[] = [
    truncate(bill.brandName, 56),
    truncate(bill.locationName, 72),
    "",
    `TAX INVOICE / BILL   ${truncate(bill.orderNumber, 36)}`,
    `Date: ${truncate(bill.createdAt, 54)}`,
  ];

  if (bill.customerName) lines.push(`Customer: ${truncate(bill.customerName, 54)}`);
  if (bill.customerPhone) lines.push(`Phone: ${truncate(bill.customerPhone, 24)}`);

  lines.push("", "Qty  Item                                             Rate       Amount", "--------------------------------------------------------------------------");
  bill.lines.forEach((line) => {
    const qty = String(Number(line.quantity || 0)).padStart(3, " ");
    const name = truncate(line.name, 43).padEnd(43, " ");
    const rate = pdfMoney(line.unitPrice).padStart(11, " ");
    const amount = pdfMoney(line.amount).padStart(12, " ");
    lines.push(`${qty}  ${name} ${rate} ${amount}`);
  });

  lines.push(
    "--------------------------------------------------------------------------",
    `Subtotal: ${pdfMoney(bill.subtotal)}`,
  );
  if (bill.packaging) lines.push(`Packaging: ${pdfMoney(bill.packaging)}`);
  if (bill.tax) lines.push(`Tax: ${pdfMoney(bill.tax)}`);
  if (bill.discount) lines.push(`Discount: -${pdfMoney(bill.discount)}`);
  lines.push(
    `TOTAL: ${pdfMoney(bill.grandTotal)}`,
    `Payment: ${truncate(bill.paymentMethod.toUpperCase(), 24)}`,
    "",
    "Thank you for visiting us!",
  );
  return lines;
}

function buildPdf(bill: BillPayload): Uint8Array {
  const allLines = invoiceLines(bill);
  const perPage = 42;
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += perPage) pages.push(allLines.slice(i, i + perPage));

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  const contentObjectNumbers: number[] = [];
  let nextObject = 4;
  for (let i = 0; i < pages.length; i += 1) {
    pageObjectNumbers.push(nextObject++);
    contentObjectNumbers.push(nextObject++);
  }

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  pages.forEach((pageLines, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    const commands: string[] = ["BT", "/F1 10 Tf", "46 800 Td", "12 TL"];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push("T*");
      commands.push(`(${safePdfText(line)}) Tj`);
    });
    if (pages.length > 1) {
      commands.push("T*", "T*", `(Page ${index + 1} of ${pages.length}) Tj`);
    }
    commands.push("ET");
    const stream = commands.join("\n");
    objects[contentNumber] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
    objects[pageNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`;
  });

  const maxObject = nextObject - 1;
  let pdf = "%PDF-1.4\n%Takshvi\n";
  const offsets = new Array<number>(maxObject + 1).fill(0);
  for (let i = 1; i <= maxObject; i += 1) {
    offsets[i] = new TextEncoder().encode(pdf).length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${maxObject + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= maxObject; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function sendTextFallback(params: {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  bill: BillPayload;
}) {
  const response = await fetch(`https://graph.facebook.com/${params.apiVersion}/${params.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: params.to, type: "text", text: { preview_url: false, body: billText(params.bill) } }),
    cache: "no-store",
  });
  const data = await response.json() as WhatsAppMessagePayload;
  return { response, data };
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

    const pdfBytes = buildPdf(bill);
    const filename = `Takshvi-Bill-${safePdfText(bill.orderNumber).replace(/[^A-Za-z0-9_-]/g, "-") || "invoice"}.pdf`;
    let pdfFailure = "";

    try {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", "application/pdf");
      const pdfArrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
      form.append("file", new Blob([pdfArrayBuffer], { type: "application/pdf" }), filename);

      const uploadResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        cache: "no-store",
      });
      const uploadData = await uploadResponse.json() as WhatsAppMediaPayload;
      if (!uploadResponse.ok || !uploadData.id) throw new Error(uploadData.error?.message || "WhatsApp media upload failed.");

      const documentResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "document",
          document: {
            id: uploadData.id,
            filename,
            caption: `${bill.brandName} - Bill ${bill.orderNumber} - ${money(bill.grandTotal)}`.slice(0, 1024),
          },
        }),
        cache: "no-store",
      });
      const documentData = await documentResponse.json() as WhatsAppMessagePayload;
      if (!documentResponse.ok) throw new Error(documentData.error?.message || "WhatsApp rejected the PDF bill.");

      return NextResponse.json({
        success: true,
        deliveryMode: "pdf",
        messageId: documentData.messages?.[0]?.id || null,
        mediaId: uploadData.id,
        filename,
        to,
        message: `PDF bill ${bill.orderNumber} sent directly to WhatsApp.`,
      });
    } catch (error) {
      pdfFailure = error instanceof Error ? error.message : "PDF delivery failed.";
    }

    const fallback = await sendTextFallback({ apiVersion, phoneNumberId, accessToken, to, bill });
    if (!fallback.response.ok) {
      const textFailure = fallback.data.error?.message || "WhatsApp rejected the fallback message.";
      return NextResponse.json({ success: false, message: `PDF delivery failed: ${pdfFailure} Text fallback also failed: ${textFailure}` }, { status: fallback.response.status });
    }

    return NextResponse.json({
      success: true,
      deliveryMode: "text_fallback",
      messageId: fallback.data.messages?.[0]?.id || null,
      to,
      message: `PDF delivery failed (${pdfFailure}). Bill ${bill.orderNumber} was sent as an itemized WhatsApp message instead.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to send WhatsApp bill." }, { status: 500 });
  }
}
