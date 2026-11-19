// Prepara www/ a partir de tu HTML: copia el archivo, inyecta native.js y,
// si ya corriste fetch-fonts.js, usa las fuentes locales (la app funciona sin internet).
// Uso: node prepare.js [MN_V88.html]
const fs = require("fs");
const path = require("path");

const src = process.argv[2] || "MN_V88.html";
let html = fs.readFileSync(src, "utf8");
const tag = '<script src="native.js"></script>';
if (!html.includes("</body>")) throw new Error("El HTML no tiene </body>");

fs.rmSync("www", { recursive: true, force: true });
fs.mkdirSync("www", { recursive: true });

const hasFonts = fs.existsSync(path.join("fonts", "fonts.css"));
if (hasFonts) {
  const re = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">[\s\S]*?<\/noscript>/;
  if (!re.test(html)) throw new Error("No encontré los <link> de Google Fonts");
  html = html.replace(re, '<link rel="stylesheet" href="fonts/fonts.css">');
  // evita que los temas especiales vuelvan a pedir fuentes por internet
  if (!html.includes("var FNT={")) throw new Error("No encontré FNT");
  html = html.replace("var FNT={", "var FNT={},FNT_OFF={");
  fs.cpSync("fonts", path.join("www", "fonts"), { recursive: true });
} else {
  console.log("Aviso: no hay fonts/. Corre «node fetch-fonts.js» para usar fuentes sin internet.");
}

if (!html.includes(tag)) html = html.replace("</body>", tag + "\n</body>");
fs.writeFileSync(path.join("www", "index.html"), html);
fs.copyFileSync("native.js", path.join("www", "native.js"));
console.log("Listo: www/index.html" + (hasFonts ? " (fuentes locales)" : "") + " (" + (html.length / 1024).toFixed(0) + " KB)");
