import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import MarketplaceQuickLinks from "@/components/MarketplaceQuickLinks";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Takshvi Restaurant OS AI",
  description: "Unified restaurant operations, billing, inventory and marketplace control.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <MarketplaceQuickLinks />
      </body>
    </html>
  );
}
