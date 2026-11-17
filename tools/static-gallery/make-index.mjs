// Build a navigable index for the static gallery (served from docs/gallery/).
import { readFileSync, writeFileSync } from 'fs';
const m = JSON.parse(readFileSync('../../docs/paper/data/gallery-manifest.json', 'utf8'));
const groups = { 'Brands (integral profile)': [], 'Profiles (reference brand)': [], 'Controlled defects (known fails)': [] };
for (const x of m) {
  const status = x.certifiable ? 'certifiable' : `${x.blocking_failures} blocking failures`;
  const link = `<li><a href="out/${x.file}">${x.id}</a><small>${x.theme} · ${status} · focus CR ${x.focusCR ?? '-'} · body CR ${x.bodyCR ?? '-'}</small></li>`;
  if (x.kind === 'defect') groups['Controlled defects (known fails)'].push(link);
  else if (x.id.startsWith('brand-')) groups['Brands (integral profile)'].push(link);
  else groups['Profiles (reference brand)'].push(link);
}
let sections = '';
for (const [g, items] of Object.entries(groups)) sections += `<section><h2>${g} <span>(${items.length})</span></h2><ul>${items.join('\n')}</ul></section>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LUMINA-AAA static gallery</title>
<style>
body{font-family:system-ui,Arial,sans-serif;margin:0;background:#f5f7fd;color:#1e2028}
header{background:#1e40af;color:#fff;padding:24px}
header h1{margin:0 0 6px}header p{margin:0;opacity:.9}
main{max-width:900px;margin:0 auto;padding:24px}
section{background:#fff;border:1px solid #e2e4ea;border-radius:12px;padding:16px 20px;margin-bottom:20px}
h2{font-size:16px;margin:0 0 10px}h2 span{color:#6b7280;font-weight:normal}
ul{list-style:none;padding:0;margin:0}
li{padding:8px 0;border-bottom:1px solid #f0f1f5;display:flex;flex-direction:column}
li:last-child{border-bottom:none}
a{color:#1e40af;font-weight:600;text-decoration:none}a:hover{text-decoration:underline}
small{color:#6b7280}
.note{background:#fffbe6;border:1px solid #ffe69c;border-radius:8px;padding:12px 16px;margin-bottom:20px}
</style></head><body>
<header><h1>LUMINA-AAA static gallery</h1>
<p>Rendered WCAG 2.2 AAA colour systems — ${m.length} reproducible pages for accessibility testing.</p></header>
<main>
<div class="note">Each page renders real UI components from the released LUMINA tokens.
The controlled defects are known ground-truth failures used to test auditor sensitivity.
See <a href="../paper/data/gallery-manifest.json">manifest</a> and
<a href="../paper/data/gallery-axe.json">axe-core results</a>.</div>
${sections}
</main></body></html>`;
writeFileSync('../../docs/gallery/index.html', html);
console.log('gallery index written:', m.length, 'pages');