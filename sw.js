// Enkel offline-cache för appens statiska filer.
const CACHE = "ovk-webb-v3";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest", "./icons/icon.svg",
  "./vendor/pdf-lib.min.js", "./vendor/xlsx.full.min.js",
  "./src/app.js", "./src/db.js", "./src/domain.js", "./src/model.js", "./src/constants.js",
  "./src/ui.js", "./src/pdf.js", "./src/excel.js",
  "./src/views/dashboard.js", "./src/views/uppdrag.js", "./src/views/fastigheter.js", "./src/views/installningar.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
