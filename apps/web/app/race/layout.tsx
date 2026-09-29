import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./race.css";

export const metadata: Metadata = {
  title: "THE NINTH — 9th Round Fitness Race",
  description: "THE NINTH: nine stations, one race. Register, check in, and follow the 9th Round fitness race.",
};

export const viewport: Viewport = { themeColor: "#050505" };

/** Everything under /race lives in this scoped theme (black · red · white). Nothing outside /race is restyled. */
export default function RaceLayout({ children }: { children: ReactNode }) {
  return <div className="race-root">{children}</div>;
}
