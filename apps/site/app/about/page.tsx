import type { Metadata } from "next";
import { AboutContent } from "./about-content";

export const metadata: Metadata = {
  title: "About",
  description: "About 9th Round — Kenpo & Fitness. Train Different.",
};

export default function AboutPage() {
  return <AboutContent />;
}
