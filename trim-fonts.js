// Recorta las fuentes del APK: quita los bloques "latin-ext" (alfabetos que el español no usa)
// y borra los .woff2 que queden sin usar. Uso: node trim-fonts.js www/fonts
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || 'www/fonts';
const cssFile = path.join(dir, 'fonts.css');
if (!fs.existsSync(cssFile)) { console.log('trim-fonts: no existe ' + cssFile + ', no se hace nada'); process.exit(0); }
const css = fs.readFileSync(cssFile, 'utf8');
const blocks = css.match(/(?:\/\*[^*]*\*\/\s*)?@font-face\s*\{[^}]*\}/g) || [];
if (!blocks.length) { console.log('trim-fonts: fonts.css sin @font-face, no se hace nada'); process.exit(0); }
// Se conserva el bloque si su rango empieza en U+0000 (latin). Los que empiezan en U+0100 (latin-ext) y otros alfabetos se quitan.
const keep = blocks.filter(b => /unicode-range:\s*U\+0000/i.test(b) || !/unicode-range/i.test(b));
if (!keep.length) { console.log('trim-fonts: no quedaria ningun bloque latin, no se hace nada'); process.exit(0); }
const used = new Set(keep.map(b => (b.match(/url\(([^)]+)\)/) || [])[1]).filter(Boolean).map(u => u.replace(/['"]/g, '')));
fs.writeFileSync(cssFile, keep.join('\n') + '\n');
let freed = 0, n = 0;
for (const f of fs.readdirSync(dir)) {
  if (f.endsWith('.woff2') && !used.has(f)) { freed += fs.statSync(path.join(dir, f)).size; fs.unlinkSync(path.join(dir, f)); n++; }
}
console.log('trim-fonts: ' + keep.length + ' de ' + blocks.length + ' bloques conservados, ' + n + ' archivos borrados, ' + Math.round(freed / 1024) + ' KB liberados');
