import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLang } from "@/content/i18n/config";
import { dict } from "@/content/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyActionBar } from "@/components/sticky-action-bar";

/**
 * Chrome for the public site: header, footer, mobile action bar.
 *
 * Ad landing pages live in the sibling `(landing)` group and deliberately
 * do NOT get this — a paid-traffic page with a nav bar is a page that
 * leaks the click it was paid for.
 */
export default function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { lang: string };
}) {
  if (!isLang(params.lang)) notFound();
  const lang = params.lang;
  const t = dict(lang).cta;

  return (
    <>
      <SiteHeader lang={lang} />
      <main id="main">{children}</main>
      <SiteFooter lang={lang} />
      <StickyActionBar lang={lang} labels={{ trial: t.trial, whatsapp: t.whatsapp, call: t.call }} />
    </>
  );
}
