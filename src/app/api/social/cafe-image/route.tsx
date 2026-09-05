import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const copy: Record<string, string> = {
  Coffee: "Fresh coffee. Easy cafe breaks.",
  "Cafe Food": "Comfort food for your next cafe stop.",
  "Fresh Juice": "Fresh, chilled and ready to refresh.",
  Waffles: "Warm waffles for sweet cravings.",
  "Ice Cream": "Cool scoops for a happier evening.",
  Pasta: "Creamy, comforting pasta cravings sorted.",
  Shakes: "Thick shakes and cafe-time favourites.",
};

export async function GET(request: NextRequest) {
  const focus = request.nextUrl.searchParams.get("focus") || "Cafe Food";
  const slot = request.nextUrl.searchParams.get("slot") === "evening" ? "Evening Special" : "Morning Pick";
  const line = copy[focus] || copy["Cafe Food"];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, #07111f 0%, #0f766e 55%, #f59e0b 100%)",
        color: "white",
        padding: "74px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, color: "#6ee7b7" }}>CAFE HONEYMAN</div>
        <div style={{ marginTop: 22, fontSize: 38, fontWeight: 700 }}>{slot}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 78, lineHeight: 1.05, fontWeight: 900, maxWidth: 930 }}>{focus}</div>
        <div style={{ marginTop: 26, fontSize: 36, lineHeight: 1.25, maxWidth: 900 }}>{line}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26 }}>
        <div>Sapphire Mall · Sector 49 · Gurugram</div>
        <div style={{ fontWeight: 800 }}>Visit Cafe Honeyman</div>
      </div>
    </div>,
    { width: 1200, height: 900 },
  );
}
