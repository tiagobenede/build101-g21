/**
 * Service worker de Rumbo: notificaciones push (Web Push).
 *
 * El server (src/lib/push/send.ts) manda { title, body, url, tag }. Si Rumbo está abierto
 * y a la vista, no se muestra nada: la página ya muestra el aviso (NotificationsProvider)
 * y no queremos dos. Tocar la notificación abre `url` (por defecto /talk) en una pestaña
 * de Rumbo que ya esté abierta, o en una nueva.
 *
 * Es un archivo estático (Next no arma service workers): no usa imports ni TypeScript.
 */

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      if (windows.some((w) => w.visibilityState === "visible")) return
      return self.registration.showNotification(data.title || "Rumbo", {
        body: data.body || "",
        tag: data.tag, // el mismo lugar reemplaza al aviso anterior en vez de apilarse
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { url: data.url || "/talk" },
      })
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || "/talk", self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        return open.navigate(url)
      }
      return self.clients.openWindow(url)
    })
  )
})
