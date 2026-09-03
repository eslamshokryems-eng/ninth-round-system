import type { Metadata } from "next";
import { ClassesContent } from "./classes-content";

export const metadata: Metadata = {
  title: "Classes",
  description: "Circuit hours and class schedule at 9th Round — Kenpo & Fitness.",
};

export default function ClassesPage() {
  return <ClassesContent />;
}
