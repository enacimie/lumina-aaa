// Extract Bootstrap 5.3.3 published theme variables (light + dark) from the
// official compiled CSS. Reproducible: pinned version + source URL recorded.
import { writeFileSync } from 'fs';
const URL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
const CSS = await (await fetch(URL)).text();
function block(sel) {
  const i = CSS.indexOf(sel + '{');
  if (i < 0) return {};
  const j = CSS.indexOf('}', i);
  const body = CSS.slice(i + sel.length + 1, j);
  const out = {};
  for (const m of body.matchAll(/(--bs-[a-z0-9-]+):([^;]+);/g)) out[m[1]] = m[2];
  return out;
}
const light = block(':root,[data-bs-theme=light]');
const dark = block('[data-bs-theme=dark]');
writeFileSync('bootstrap.json', JSON.stringify({ name: 'Bootstrap', version: '5.3.3', source: URL, themes: { light, dark } }, null, 2));
console.log('light vars:', Object.keys(light).length, '| dark vars:', Object.keys(dark).length);
console.log('body-bg light:', light['--bs-body-bg'], '| dark:', dark['--bs-body-bg']);
console.log('focus-ring light:', light['--bs-focus-ring-color']);