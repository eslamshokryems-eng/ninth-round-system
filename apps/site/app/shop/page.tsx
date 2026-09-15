import type { Metadata } from "next";
import { ShopContent } from "./shop-content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  title: "Shop",
  description: "9th Round Shop — boxing equipment, training gear, and 9th Round branded apparel and merchandise.",
  alternates: { canonical: `${SITE_URL}/shop` },
  openGraph: {
    title: "9th Round Shop",
    description: "Train Like You Mean It. Gear built for training, performance, and the 9th Round lifestyle.",
    url: `${SITE_URL}/shop`,
    type: "website",
  },
};

export default function ShopPage() {
  return <ShopContent />;
}
