// Descarga las fuentes de Google (solo subconjuntos latin y latin-ext) a fonts/ y genera fonts/fonts.css.
// Uso (una sola vez, con internet): node fetch-fonts.js
const fs = require("fs");
const path = require("path");

const URL_CSS = "https://fonts.googleapis.com/css2?" + [
  "family=Patrick+Hand",
  "family=Public+Sans:wght@400;600;700",
  "family=Inter:wght@400;700",
  "family=Lora:wght@400;700",
  "family=Fredoka:wght@500;600;700",
  "family=Cormorant+Garamond:wght@600;700",
].join("&") + "&display=swap";

// User-Agent moderno para que Google responda con woff2
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

(async () => {
  const css = await (await fetch(URL_CSS, { headers: { "User-Agent": UA } })).text();
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
  if (!blocks.length) throw new Error("No se encontraron @font-face en la respuesta de Google");
  fs.mkdirSync("fonts", { recursive: true });
  let out = "", n = 0;
  const seen = {};
  for (const [, subset, face] of blocks) {
    if (subset !== "latin" && subset !== "latin-ext") continue;
    const m = face.match(/url\((https:[^)]+\.woff2)\)/);
    if (!m) continue;
    let name = path.basename(m[1]);
    if (!seen[m[1]]) {
      const buf = Buffer.from(await (await fetch(m[1])).arrayBuffer());
      fs.writeFileSync(path.join("fonts", name), buf);
      seen[m[1]] = name; n++;
    }
    out += face.replace(m[1], seen[m[1]]) + "\n";
  }
  fs.writeFileSync(path.join("fonts", "fonts.css"), out);
  console.log("Listo: " + n + " archivos de fuente + fonts/fonts.css");
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
