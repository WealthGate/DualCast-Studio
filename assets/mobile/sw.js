const CACHE = "openchurch-remote-v1";
const SHELL = ["/operator", "/mobile/app.css", "/mobile/app.js", "/mobile/icon-192.png", "/mobile/icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("openchurch-remote-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  // All authentication, status, pictures and commands are network-only. Never
  // persist a command, replay a POST or cache private studio state.
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname).then(response => response || Response.error())));
});
