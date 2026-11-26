/* 9th Round — service worker for Smart Reminders (Web Push only; no caching, no offline data).
   The push payload carries no customer data: a title, a short line, a same-origin link and a tag. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function sameOriginPath(url) {
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin ? u.pathname + u.search : "/sales";
  } catch (e) {
    return "/sales";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = typeof data.title === "string" ? data.title.slice(0, 80) : "9th Round · Follow-up reminder";
  const body = typeof data.body === "string" ? data.body.slice(0, 160) : "You have a follow-up due. Open the CRM for details.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: sameOriginPath(data.url || "/sales") },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = sameOriginPath((event.notification.data && event.notification.data.url) || "/sales");
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) {
        await c.focus();
        if ("navigate" in c) await c.navigate(path);
        return;
      }
    }
    await self.clients.openWindow(path);
  })());
});
