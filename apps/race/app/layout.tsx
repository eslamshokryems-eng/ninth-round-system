import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RaceAuthProvider } from "../src/features/auth/race-auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE NINTH — 9th Round Fitness Race",
  description: "THE NINTH: nine stations, one race.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RaceAuthProvider>{children}</RaceAuthProvider>
      </body>
    </html>
  );
}
