"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "../../components/ui/button";
import { getSupabaseClient } from "../../lib/composition-root";

/**
 * "Turn on reminders on this device" for the Sales Workspace. Registers the browser / Home Screen app for Web Push
 * (Android: Chrome; iPhone: only from the Home Screen app, iOS 16.4+). Reminder content never includes customer data.
 */
type State = "loading" | "hidden" | "ios-install" | "unsupported" | "denied" | "off" | "on" | "busy";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function isIos() { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function platform() { return /Android/i.test(navigator.userAgent) ? "android" : isIos() ? "ios" : "desktop"; }
function supported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
const db = () => getSupabaseClient() as unknown as SupabaseClient;

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await db().rpc("register_push_subscription", {
    p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth, p_platform: platform(), p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

export function PushRemindersToggle() {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return setState("hidden");
    if (!supported()) return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      try { await saveSubscription(sub); setState("on"); } catch { setState("off"); } // re-link the device to whoever is signed in now
    } else setState("off");
  }, []);

  useEffect(() => { refresh().catch(() => setState("unsupported")); }, [refresh]);

  async function enable() {
    setState("busy"); setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
      await saveSubscription(sub);
      setState("on"); setMessage("Reminders are on for this device.");
    } catch (e) {
      setState("off"); setMessage(e instanceof Error ? e.message : "Could not turn on reminders.");
    }
  }

  async function disable() {
    setState("busy"); setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await db().rpc("unregister_push_subscription", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off"); setMessage("Reminders are off for this device.");
    } catch {
      setState("on"); setMessage("Could not turn off reminders.");
    }
  }

  if (state === "loading" || state === "hidden") return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-white/5 bg-surface px-4 py-3 text-sm" data-testid="push-reminders">
      {state === "ios-install" ? (
        <p className="text-muted" data-testid="push-ios-install">
          iPhone: tap Share, then “Add to Home Screen”. Open 9th Round from the Home Screen to turn on follow-up reminders.
        </p>
      ) : state === "unsupported" ? (
        <p className="text-muted">This browser cannot show reminders. Use Chrome on Android or the Home Screen app on iPhone.</p>
      ) : state === "denied" ? (
        <p className="text-muted">Notifications are blocked for this site. Allow them in the browser or phone settings to get reminders.</p>
      ) : (
        <>
          <p className="text-ink">
            {state === "on" ? "Follow-up reminders are on for this device." : "Get a reminder on this device before each follow-up."}
          </p>
          {state === "on" ? (
            <Button variant="ghost" onClick={() => void disable()} data-testid="push-disable">Turn off</Button>
          ) : (
            <Button variant="secondary" isLoading={state === "busy"} onClick={() => void enable()} data-testid="push-enable">
              Turn on reminders
            </Button>
          )}
        </>
      )}
      {message ? <p className="w-full text-xs text-gold" role="status">{message}</p> : null}
    </div>
  );
}
