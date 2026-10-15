// Builds dist/calmercard.bundle.js: the extension's CSS + JS in one file, in manifest order.
// Used for testing by injecting into a live page, and handy for a bookmarklet-style install.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const cs = manifest.content_scripts[0];
const css = cs.css.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
const js = cs.js.map((f) => `// ---- ${f} ----\n` + readFileSync(join(root, f), 'utf8')).join('\n');
const out = `(() => {
  const s = document.createElement('style');
  s.id = 'calmercard-css';
  s.textContent = ${JSON.stringify(css)};
  (document.getElementById('calmercard-css') || {}).remove?.();
  document.head.append(s);
})();
${js}
`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/calmercard.bundle.js'), out);
console.log('dist/calmercard.bundle.js', out.length, 'bytes');
