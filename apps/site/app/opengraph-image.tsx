import { ImageResponse } from "next/og";
import { site } from "@/content/site.config";

/**
 * Social share card (1200x630), generated at build time by next/og.
 *
 * Next.js auto-wires this into `og:image` and `twitter:image` for every
 * page, so no per-page asset is needed. Rendered rather than committed as
 * a binary so it stays in sync with the brand and needs no design tooling.
 * Uses the site's real palette; no photography, since no verified 9th
 * Round facility media exists yet.
 */
// The edge bundle of @vercel/og is used deliberately: its Node build calls
// `fileURLToPath(import.meta.url)` in a way that throws "Invalid URL" on
// Windows during `next build`. Edge builds identically on every platform.
export const runtime = "edge";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0B0B0C",
          padding: "72px 80px",
        }}
      >
        {/* Top rule — the brand's red accent */}
        <div style={{ display: "flex", width: "160px", height: "8px", backgroundColor: "#E4141B" }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 132,
              fontWeight: 700,
              color: "#F4F3F1",
              letterSpacing: "-3px",
              lineHeight: 1,
            }}
          >
            9TH ROUND
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "28px",
              fontSize: 40,
              color: "#E4141B",
              fontWeight: 600,
              letterSpacing: "-1px",
            }}
          >
            NO CLASSES. NO WAITING. JUST ACTION.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid #2A2A2E",
            paddingTop: "28px",
          }}
        >
          <div style={{ display: "flex", fontSize: 27, color: "#A2A0A0" }}>
            Boxing · Kickboxing · Combat fitness · Egypt
          </div>
          <div style={{ display: "flex", fontSize: 27, color: "#A2A0A0" }}>9throundegypt.com</div>
        </div>
      </div>
    ),
    size,
  );
}
