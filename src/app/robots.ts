import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://takshvi-restaurant-os-ai.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: ["/cafe-honeyman", "/api/social/cafe-image"],
      disallow: ["/dashboard", "/orders", "/pos", "/inventory", "/recipes", "/settings", "/integrations"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
