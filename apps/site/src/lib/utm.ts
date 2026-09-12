const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
type UtmKey = (typeof UTM_KEYS)[number];
type UtmData = Partial<Record<UtmKey, string>>;

const STORAGE_KEY = "9thround_utm";

/**
 * Captures utm_* params from the current URL into sessionStorage (session-only —
 * not localStorage, so attribution doesn't outlive the visit). Called on every
 * route change; if the URL carries no UTM params, whatever was already stored
 * is left alone so attribution survives internal navigation.
 */
export function captureUtmFromUrl(search: string): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(search);
  const found: UtmData = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) found[key] = value;
  }
  if (Object.keys(found).length === 0) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
  } catch {
    // Private browsing or storage disabled — attribution just won't persist.
  }
}

export function getStoredUtm(): UtmData {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UtmData) : {};
  } catch {
    return {};
  }
}
