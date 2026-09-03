import type { Metadata } from "next";
import { ContactContent } from "./contact-content";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact 9th Round — Kenpo & Fitness — WhatsApp, phone, and location.",
};

export default function ContactPage() {
  return <ContactContent />;
}
