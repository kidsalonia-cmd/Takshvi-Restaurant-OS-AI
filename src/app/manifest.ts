import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Takshvi Restaurant OS AI",
    short_name: "Takshvi OS",
    description: "Mobile restaurant billing, inventory, purchases and operations.",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#020617",
    orientation: "portrait-primary",
    icons: [
      { src: "/takshvi-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
