"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackPageView } from "../lib/analytics";
import { captureUtmFromUrl } from "../lib/utm";

/** Fires exactly one page_view (GA4 + Meta PageView + dataLayer) per route, on first load and every client-side navigation — deduped via lastTracked so React's dev double-effect never double-fires. */
export function AnalyticsPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    const search = searchParams.toString();
    captureUtmFromUrl(search ? `?${search}` : "");

    const key = `${pathname}?${search}`;
    if (lastTracked.current === key) return;
    lastTracked.current = key;

    trackPageView(pathname, document.title);
  }, [pathname, searchParams]);

  return null;
}
