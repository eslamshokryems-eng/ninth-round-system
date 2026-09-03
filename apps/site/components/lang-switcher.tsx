"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { otherLang, stripLang, href, type Lang } from "@/content/i18n/config";

/**
 * Language switcher. It keeps the visitor on the SAME page rather than
 * dumping them on the Arabic homepage — every route exists under both
 * locales, so the current path just gets a new prefix.
 *
 * Client-side because it needs `usePathname`; it renders one anchor and
 * ships no other logic.
 */
export function LangSwitcher({
  lang,
  label,
  aria,
  className = "",
}: {
  lang: Lang;
  label: string;
  aria: string;
  className?: string;
}) {
  const pathname = usePathname() || "/";
  const target = otherLang(lang);
  const to = href(target, stripLang(pathname));

  return (
    <Link
      href={to}
      hrefLang={target === "ar" ? "ar-EG" : "en"}
      aria-label={aria}
      dir={target === "ar" ? "rtl" : "ltr"}
      className={`rounded-pill border border-white/20 px-3 py-1.5 text-xs font-semibold text-ash transition-colors hover:border-white/50 hover:text-bone ${className}`}
    >
      {label}
    </Link>
  );
}
