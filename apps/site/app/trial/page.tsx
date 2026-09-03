import type { Metadata } from "next";
import { TrialContent } from "./trial-content";

export const metadata: Metadata = {
  title: "Book a Free Trial",
  description: "Book your free trial session at 9th Round — Kenpo & Fitness.",
};

export default function TrialPage() {
  return <TrialContent />;
}
