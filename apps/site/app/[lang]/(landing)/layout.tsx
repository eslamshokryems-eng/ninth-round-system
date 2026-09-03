import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLang } from "@/content/i18n/config";

/**
 * Landing-page chrome: deliberately none.
 *
 * A paid click has exactly one job. Every nav item, footer link and
 * dropdown on a landing page is a way to spend that click on something
 * other than the form, so this group ships without the site header,
 * footer and sticky bar that `(site)` provides.
 */
export default function LandingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { lang: string };
}) {
  if (!isLang(params.lang)) notFound();
  return <main id="main">{children}</main>;
}
