import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../src/components/site-header";
import { SiteFooter } from "../src/components/site-footer";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
const SITE_NAME = "9th Round Egypt";
const DEFAULT_DESCRIPTION =
  "Premium combat-fitness in Egypt — boxing, kickboxing, and functional conditioning in one structured round. No classes. No waiting. Just action.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Premium Combat Fitness`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Premium Combat Fitness`,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Premium Combat Fitness`,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/emblem-red.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-bg text-ink antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
