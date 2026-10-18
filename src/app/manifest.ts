import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Market Place",
    short_name: "Market Place",
    description: "Buy and sell with USDC on chain and off chain.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#e8175d",
    categories: ["shopping", "finance"],
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
