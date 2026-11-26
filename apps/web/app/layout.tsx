import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthBootstrapProvider } from "../src/features/auth/auth-bootstrap-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "9th Round — Reception",
  description: "9th Round Reception & Membership System",
  // Home Screen app (PWA): required on iPhone (iOS 16.4+) for Web Push reminders
  applicationName: "9th Round",
  appleWebApp: { capable: true, title: "9th Round", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
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
