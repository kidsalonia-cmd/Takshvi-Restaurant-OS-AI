import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const visual: Record<string, { emoji: string; line: string; bg: string; accent: string }> = {
  Coffee: { emoji: "☕", line: "Fresh coffee. Easy cafe breaks.", bg: "linear-gradient(135deg,#2b160b,#7c3f18 58%,#d6a15f)", accent: "#fde68a" },
  "Cafe Food": { emoji: "🍽️", line: "Comfort food for your next cafe stop.", bg: "linear-gradient(135deg,#172554,#1d4ed8 55%,#f59e0b)", accent: "#fef3c7" },
  Pasta: { emoji: "🍝", line: "Creamy, comforting pasta cravings sorted.", bg: "linear-gradient(135deg,#431407,#c2410c 55%,#facc15)", accent: "#fef08a" },
  Waffles: { emoji: "🧇", line: "Warm waffles for sweet cravings.", bg: "linear-gradient(135deg,#3f1d0b,#a16207 55%,#fbbf24)", accent: "#fff7ed" },
  "Fresh Juice": { emoji: "🍹", line: "Fresh, chilled and ready to refresh.", bg: "linear-gradient(135deg,#064e3b,#059669 55%,#facc15)", accent: "#d1fae5" },
  "Ice Cream": { emoji: "🍨", line: "Cool scoops for a happier break.", bg: "linear-gradient(135deg,#4c1d95,#a855f7 55%,#f9a8d4)", accent: "#fae8ff" },
  Shakes: { emoji: "🥤", line: "Thick shakes and cafe-time favourites.", bg: "linear-gradient(135deg,#3b0764,#7e22ce 55%,#fb7185)", accent: "#fce7f3" },
};

export async function GET(request: NextRequest) {
  const focus = request.nextUrl.searchParams.get("focus") || "Cafe Food";
  const slot = request.nextUrl.searchParams.get("slot") || "9";
  const date = request.nextUrl.searchParams.get("date") || "";
  const item = visual[focus] || visual["Cafe Food"];
  const slotLabel: Record<string, string> = { "9": "Morning Pick", "12": "Lunch Craving", "15": "Afternoon Break", "18": "Evening Favourite", "21": "Night Craving", morning: "Morning Pick", evening: "Evening Favourite" };
  const seed = [...`${date}-${slot}-${focus}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const badge = ["NEAR SECTOR 49", "SAPPHIRE MALL", "UPPAL SOUTHEND"][seed % 3];

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: item.bg, color: "white", padding: "68px", fontFamily: "sans-serif", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -60, top: 90, display: "flex", fontSize: 330, opacity: 0.18, transform: `rotate(${(seed % 17) - 8}deg)` }}>{item.emoji}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 31, fontWeight: 900, letterSpacing: 5, color: item.accent }}>CAFE HONEYMAN</div>
          <div style={{ marginTop: 18, fontSize: 36, fontWeight: 700 }}>{slotLabel[slot] || "Cafe Pick"}</div>
        </div>
        <div style={{ display: "flex", border: `2px solid ${item.accent}`, borderRadius: 999, padding: "12px 20px", fontSize: 21, fontWeight: 800 }}>{badge}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 38 }}>
        <div style={{ display: "flex", width: 210, height: 210, borderRadius: 105, alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.16)", border: "3px solid rgba(255,255,255,.28)", fontSize: 118 }}>{item.emoji}</div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
          <div style={{ fontSize: 82, lineHeight: 1, fontWeight: 950 }}>{focus}</div>
          <div style={{ marginTop: 24, fontSize: 34, lineHeight: 1.25 }}>{item.line}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 25 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div>Sapphire Mall · Sector 49 · Gurugram</div><div style={{ fontSize: 20, opacity: .86 }}>Near Uppal Southend</div></div>
        <div style={{ display: "flex", background: "white", color: "#111827", borderRadius: 14, padding: "14px 22px", fontWeight: 900 }}>VISIT CAFE HONEYMAN</div>
      </div>
    </div>,
    { width: 1200, height: 900 },
  );
}
