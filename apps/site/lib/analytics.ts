"use client";

import { site } from "@/content/site.config";

/**
 * Thin analytics wrapper. If no PostHog key is configured, every call is a
 * no-op — the site works identically with analytics off. No PII is ever
 * passed here (no names, phones, emails).
 */

type Props = Record<string, string | number | boolean | undefined>;

interface PostHogLike {
  capture: (event: string, props?: Props) => void;
  init?: (key: string, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

export function track(event: string, props?: Props): void {
  if (typeof window === "undefined") return;
  try {
    window.posthog?.capture(event, props);
  } catch {
    /* analytics must never break the page */
  }
}

export const events = site.analyticsEvents;
