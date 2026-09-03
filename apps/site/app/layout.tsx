import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Anton, Barlow_Condensed, Inter, Cairo } from "next/font/google";
import { SiteHeader } from "../src/components/site-header";
import { SiteFooter } from "../src/components/site-footer";
import { WhatsAppSticky } from "../src/components/whatsapp-sticky";
import { LanguageProvider } from "../src/i18n/language-provider";
import "./globals.css";

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-condensed" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-arabic" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
const SITE_NAME = "9th Round — Kenpo & Fitness";
const DEFAULT_DESCRIPTION =
  "Train Different. 9 stations, 30 minutes, a coach with you the whole round — boxing, kickboxing, MMA, Kenpo, strength, and cardio. Inside Nordic Club, Highland Park, Fifth Settlement, New Cairo.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
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
    <html lang="en" className={`${anton.variable} ${barlowCondensed.variable} ${inter.variable} ${cairo.variable}`}>
      <body className="flex min-h-screen flex-col bg-black font-body text-bone antialiased">
        <LanguageProvider>
          <SiteHeader />
          <main className="flex-1 pb-16 sm:pb-0">{children}</main>
          <SiteFooter />
          <WhatsAppSticky />
        </LanguageProvider>
      </body>
    </html>
  );
}
