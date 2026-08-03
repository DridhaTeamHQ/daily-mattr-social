/**
 * Service worker — Web Push only.
 *
 * Deliberately does no caching. An offline cache for a points app whose whole
 * value is "is my screenshot approved yet" would serve stale answers, which is
 * worse than no answer. If offline support is ever wanted, do it properly with
 * a real strategy rather than by accident here.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "DailyMattr", body: event.data.text() };
  }

  const title = payload.title || "DailyMattr";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    // Collapse repeats of the same kind so a burst of approvals doesn't
    // produce a wall of identical notifications.
    tag: payload.type || "dailymattr",
    renotify: true,
    data: { href: payload.href || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const href = (event.notification.data && event.notification.data.href) || "/dashboard";
  const target = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Reuse an open tab if there is one — students keep the app open, and
        // spawning a second window every time is obnoxious.
        for (const client of clientList) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        for (const client of clientList) {
          if ("navigate" in client && "focus" in client) {
            return client.navigate(target).then((c) => c && c.focus());
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
