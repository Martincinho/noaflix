// Cifra la serie para publicarla: nadie puede verla sin la contraseña.
// Uso:  node herramientas/publicar.mjs "<contraseña>" "<pista>"
// Lee:  fuente/  (la página tal cual, privada, no se sube)
// Crea: docs/    (lo que se publica en GitHub Pages, todo cifrado)

import { webcrypto as crypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FUENTE = path.join(RAIZ, "fuente");
const SALIDA = path.join(RAIZ, "docs");
const HERR = path.join(RAIZ, "herramientas");

const [, , contraseña, pista = ""] = process.argv;
if (!contraseña) { console.error('Falta la contraseña: node herramientas/publicar.mjs "26042025" "Pista…"'); process.exit(1); }

const ITER = 250000;
// La "sal" se guarda para que, al actualizar la serie, no tenga que volver a poner la contraseña
const RUTA_SAL = path.join(HERR, "sal.txt");
if (!fs.existsSync(RUTA_SAL)) fs.writeFileSync(RUTA_SAL, Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64"));
const sal = new Uint8Array(Buffer.from(fs.readFileSync(RUTA_SAL, "utf8").trim(), "base64"));
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(contraseña), "PBKDF2", false, ["deriveBits"]);
const raw = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: ITER, hash: "SHA-256" }, base, 256);
const clave = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);

async function cifrar(datos) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, datos));
  const out = new Uint8Array(12 + c.length); out.set(iv); out.set(c, 12);
  return out;
}

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });

// La página de la serie (con la carta, los textos…) → app.html.bin
fs.writeFileSync(path.join(SALIDA, "app.html.bin"), await cifrar(fs.readFileSync(path.join(FUENTE, "index.html"))));

// Fotos y vídeos → .bin
let n = 0;
for (const carpeta of ["fotos", "videos"]) {
  const recorrer = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? recorrer(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  for (const f of recorrer(path.join(FUENTE, carpeta))) {
    if (path.basename(f).startsWith(".")) continue;
    const rel = path.relative(FUENTE, f);
    const destino = path.join(SALIDA, rel + ".bin");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, await cifrar(fs.readFileSync(f)));
    n++;
  }
}

// Pantalla de inicio de sesión + service worker
const b64 = u => Buffer.from(u).toString("base64");
const prueba = await cifrar(new TextEncoder().encode("noaflix"));
const config = JSON.stringify({ sal: b64(sal), iter: ITER, prueba: b64(prueba) });
const login = fs.readFileSync(path.join(HERR, "login.html"), "utf8").replace("__CONFIG__", config).replace("__PISTA__", pista);
fs.writeFileSync(path.join(SALIDA, "index.html"), login);
fs.copyFileSync(path.join(HERR, "sw.js"), path.join(SALIDA, "sw.js"));
fs.writeFileSync(path.join(SALIDA, ".nojekyll"), "");
fs.writeFileSync(path.join(SALIDA, "robots.txt"), "User-agent: *\nDisallow: /\n");

console.log(`Listo: ${n} archivos cifrados + página en ${path.relative(RAIZ, SALIDA)}/`);
