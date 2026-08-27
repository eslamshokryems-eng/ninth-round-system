import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthBootstrapProvider } from "../src/features/auth/auth-bootstrap-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "9th Round — Reception",
  description: "9th Round Reception & Membership System",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">
        <AuthBootstrapProvider>{children}</AuthBootstrapProvider>
      </body>
    </html>
  );
}
