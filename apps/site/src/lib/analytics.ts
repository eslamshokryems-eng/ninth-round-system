declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

// Read once at build time — NEXT_PUBLIC_* vars are inlined by Next.js, so an
// unset ID here means the corresponding provider is compiled out entirely,
// never a runtime fetch that could fail.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

type EventParams = Record<string, string | number | boolean>;

/** GA4 (direct) + a matching dataLayer push, so a GTM container can also key a trigger off the same event name. No-ops until a provider script has actually loaded. */
export function trackEvent(name: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", name, params);
  }
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: name, ...params });
  }
}

/** Meta Pixel has its own event vocabulary (PageView/ViewContent/Lead) — dispatched separately from GA4. */
function trackMeta(name: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") {
    window.fbq("track", name, params);
  }
}

/**
 * Fired once per route (initial load + every client-side navigation) by
 * AnalyticsPageViewTracker. GA4's own auto page_view is disabled
 * (send_page_view: false) and Meta's init script does not call
 * `track('PageView')` itself — this is the single source of truth for page
 * views, so nothing double-counts.
 */
export function trackPageView(path: string, title: string): void {
  trackEvent("page_view", {
    page_path: path,
    page_title: title,
    page_location: typeof window === "undefined" ? "" : window.location.href,
  });
  trackMeta("PageView");
  if (path === "/trial") {
    // The one page that represents "viewing the trial offer" — Meta's
    // ViewContent, used narrowly rather than fired on every route.
    trackMeta("ViewContent", { content_name: "Free Trial" });
  }
}

export function trackWhatsAppClick(page: string, placement: string): void {
  trackEvent("whatsapp_click", { page, placement });
}

export function trackPhoneClick(page: string, placement: string): void {
  trackEvent("phone_click", { page, placement });
}

export function trackTrialCtaClick(page: string, placement: string): void {
  trackEvent("trial_cta_click", { page, placement });
}

export function trackTrialFormStart(page: string): void {
  trackEvent("trial_form_start", { page });
}

/** Primary conversion. utm holds only whichever utm_* keys were captured this session — no personal data. */
export function trackTrialFormSubmit(page: string, utm: Record<string, string>): void {
  trackEvent("trial_form_submit", { page, form: "trial", ...utm });
  trackMeta("Lead");
}

export function trackSocialClick(platform: string, page: string, placement: string): void {
  trackEvent("social_click", { platform, page, placement });
}
