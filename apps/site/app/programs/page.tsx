import type { Metadata } from "next";
import { ProgramsContent } from "./programs-content";

export const metadata: Metadata = {
  title: "Programs",
  description: "Boxing, kickboxing, MMA, Kenpo, strength, and cardio at 9th Round — Kenpo & Fitness.",
};

export default function ProgramsPage() {
  return <ProgramsContent />;
}
