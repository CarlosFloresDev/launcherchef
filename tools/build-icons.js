// Builds src/assets/icons.svg (an SVG sprite) from the Lucide icons used in the UI.
// Run after adding a new icon name: node tools/build-icons.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'node_modules', 'lucide-static', 'icons');
const sources = ['src/pages/index.html', 'src/js/renderer.js', ...fs.readdirSync(path.join(ROOT, 'src/js')).map((f) => `src/js/${f}`)];

const used = new Set(['server', 'package', 'gamepad-2', 'box', 'sparkles', 'compass', 'search', 'download', 'external-link', 'hammer', 'layers', 'image', 'sun']);
for (const rel of new Set(sources)) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of text.matchAll(/lucide-([a-z0-9-]+)/g)) used.add(m[1]);
  for (const m of text.matchAll(/data-icon="([a-z0-9-]+)"/g)) used.add(m[1]);
  // Icon names passed as plain strings in JS (LCIcon('x'), INSTANCE_ICONS, ...); non-icon words are skipped below.
  if (rel.endsWith('.js')) for (const m of text.matchAll(/['"`]([a-z][a-z0-9-]{1,30})['"`]/g)) used.add(m[1]);
}

const symbols = [];
for (const name of [...used].sort()) {
  const file = path.join(ICONS_DIR, `${name}.svg`);
  if (!fs.existsSync(file)) continue;
  const svg = fs.readFileSync(file, 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`);
}
fs.writeFileSync(
  path.join(ROOT, 'src/assets/icons.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>\n`,
);
console.log(`icons.svg: ${symbols.length} icons`);
