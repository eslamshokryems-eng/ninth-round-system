import type { Metadata } from "next";
import { CoachesContent } from "./coaches-content";

export const metadata: Metadata = {
  title: "Coaches",
  description: "Meet the coaches at 9th Round — Kenpo & Fitness.",
};

export default function CoachesPage() {
  return <CoachesContent />;
}
