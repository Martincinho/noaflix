// Service worker de Noaflix: descifra la página, las fotos y el video
// en el propio móvil, solo si ya se puso la contraseña correcta.
// En el servidor (GitHub) todo está cifrado.

let clave = null;

// --- Guardar la clave en el móvil para no pedir la contraseña cada vez ---
function bd() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open("noaflix", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("claves");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function guardarClave(raw) {
  const db = await bd();
  await new Promise(ok => { const t = db.transaction("claves", "readwrite"); t.objectStore("claves").put(raw, "clave"); t.oncomplete = ok; });
}
async function leerClave() {
  const db = await bd();
  return new Promise(ok => { const r = db.transaction("claves").objectStore("claves").get("clave"); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
}
async function obtenerClave() {
  if (clave) return clave;
  const raw = await leerClave();
  if (raw) clave = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  return clave;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("message", e => {
  if (e.data && e.data.tipo === "clave") {
    e.waitUntil((async () => {
      clave = await crypto.subtle.importKey("raw", e.data.raw, "AES-GCM", false, ["decrypt"]);
      await guardarClave(e.data.raw);
      e.source && e.source.postMessage({ tipo: "lista" });
    })());
  }
});

// --- Descifrado ---
const TIPOS = { html: "text/html; charset=utf-8", jpg: "image/jpeg", jpeg: "image/jpeg", avif: "image/avif", png: "image/png", mp4: "video/mp4" };
const descifrados = new Map(); // memoria: no descifrar dos veces lo mismo

async function descifrar(ruta) {
  if (descifrados.has(ruta)) return descifrados.get(ruta);
  const promesa = (async () => {
    const k = await obtenerClave();
    if (!k) return null;
    const r = await fetch(ruta + ".bin", { cache: "no-cache" }); // pregunta si hay versión nueva
    if (!r.ok) return null;
    const datos = new Uint8Array(await r.arrayBuffer());
    try {
      return await crypto.subtle.decrypt({ name: "AES-GCM", iv: datos.slice(0, 12) }, k, datos.slice(12));
    } catch { return null; }
  })();
  descifrados.set(ruta, promesa);
  const res = await promesa;
  if (!res) descifrados.delete(ruta);
  return res;
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const base = new URL("./", self.registration.scope).pathname;
  const ruta = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null;
  if (ruta === null) return;
  if (!(ruta === "app.html" || /^(fotos|videos)\//.test(ruta)) || ruta.endsWith(".bin")) return;
  // Al abrir la serie, olvida lo descifrado antes por si se actualizó algo
  if (ruta === "app.html" && e.request.mode === "navigate") descifrados.clear();
  e.respondWith(servir(ruta, e.request));
});

async function servir(ruta, peticion) {
  const cuerpo = await descifrar(ruta);
  if (!cuerpo) {
    // Sin contraseña: si intenta abrir la serie directamente, vuelve al inicio de sesión
    if (ruta === "app.html" && peticion.mode === "navigate") return Response.redirect(new URL("./", self.registration.scope).href, 302);
    return new Response("", { status: 401 });
  }
  const ext = ruta.split(".").pop().toLowerCase();
  const tipo = TIPOS[ext] || "application/octet-stream";
  const total = cuerpo.byteLength;
  // Los vídeos (sobre todo en iPhone) piden el archivo por trozos
  const rango = peticion.headers.get("range");
  if (rango) {
    const m = /bytes=(\d*)-(\d*)/.exec(rango);
    let ini = m && m[1] ? parseInt(m[1], 10) : 0;
    let fin = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (m && !m[1] && m[2]) { ini = Math.max(0, total - parseInt(m[2], 10)); fin = total - 1; }
    fin = Math.min(fin, total - 1);
    return new Response(cuerpo.slice(ini, fin + 1), {
      status: 206,
      headers: { "Content-Type": tipo, "Content-Range": `bytes ${ini}-${fin}/${total}`, "Content-Length": String(fin - ini + 1), "Accept-Ranges": "bytes" },
    });
  }
  return new Response(cuerpo, { headers: { "Content-Type": tipo, "Content-Length": String(total), "Accept-Ranges": "bytes" } });
}
