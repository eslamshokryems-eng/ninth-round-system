import type { Metadata } from "next";
import type { ReactNode } from "react";

// The athlete's private page: never indexed, never leaks the link through a Referer header.
export const metadata: Metadata = {
  title: "My registration — THE NINTH",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function MyRegistrationLayout({ children }: { children: ReactNode }) {
  return children;
}
