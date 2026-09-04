import type { Metadata } from "next";
import { AboutContent } from "./about-content";

export const metadata: Metadata = {
  title: "About",
  description: "About 9th Round — Kenpo & Fitness, founded by Islam Shokry. Train Different.",
};

export default function AboutPage() {
  return <AboutContent />;
}
