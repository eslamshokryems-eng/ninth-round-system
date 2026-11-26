import type { MetadataRoute } from "next";

/** Web app manifest: lets staff install the CRM to the Home Screen (needed on iPhone for push reminders). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "9th Round",
    short_name: "9th Round",
    description: "9th Round Reception & Sales",
    id: "/",
    start_url: "/sales",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0b",
    theme_color: "#0b0b0b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
