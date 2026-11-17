// Static gallery generator: renders the released LUMINA tokens as real static
// HTML component pages across brands / profiles / themes, plus controlled
// DEFECTIVE variants (known ground-truth fails) for sensitivity testing.
// Each page is a reproducible artefact for axe-core (DOM) and VLM judges (pixels).
// The oracle ground truth is the audit report of each variant.
import { buildPalette, auditPalette } from '../../lib/index.js';
import { writeFileSync, mkdirSync } from 'fs';

const OUT = '../../docs/gallery/out';
mkdirSync(OUT, { recursive: true });

const BRANDS = [
  ['blue', '#1E40AF'], ['red', '#DC2626'], ['green', '#16A34A'], ['purple', '#7C3AED'],
  ['orange', '#EA580C'], ['teal', '#0D9488'], ['pink', '#DB2777'], ['slate', '#52525B'],
];
const THEMES = ['light', 'dark', 'contrast'];

const varName = (role) => `--lum-${role.replaceAll('.', '-')}`;
function injectVars(values) {
  return Object.entries(values).map(([r, h]) => `  ${varName(r)}: ${h};`).join('\n');
}

function renderPage(values, title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root {
${injectVars(values)}
}
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, Arial, sans-serif; background: var(--lum-background-default); color: var(--lum-text-primary); }
header { padding:16px 24px; background: var(--lum-background-surface); border-bottom:1px solid var(--lum-border-default); display:flex; gap:16px; align-items:center; }
header h1 { font-size:18px; margin:0; }
a { color: var(--lum-text-link); }
nav a { margin-right:14px; }
main { padding:24px; max-width:900px; margin:0 auto; }
section { margin-bottom:28px; }
h2 { font-size:15px; color: var(--lum-text-secondary); }
.row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
.btn { padding:10px 18px; border-radius:8px; font-size:15px; border:1px solid transparent; cursor:pointer; }
.btn-primary { background: var(--lum-interactive-primary-default); color: var(--lum-text-on-primary); }
.btn-secondary { background: var(--lum-interactive-secondary-default); color: var(--lum-text-primary); border-color: var(--lum-border-default); }
.btn-ghost { background: var(--lum-interactive-ghost-default); color: var(--lum-text-link); }
.btn:focus-visible { outline:none; box-shadow: 0 0 0 2px var(--lum-focus-inner), 0 0 0 4px var(--lum-focus-ring); }
label { display:block; margin:8px 0 4px; color: var(--lum-text-secondary); font-size:14px; }
input[type=text] { padding:10px 12px; border-radius:8px; border:1px solid var(--lum-border-default); background: var(--lum-background-surface); color: var(--lum-text-primary); font-size:15px; width:280px; }
input[type=text]:focus { outline:none; box-shadow: 0 0 0 2px var(--lum-focus-inner), 0 0 0 4px var(--lum-focus-ring); border-color: var(--lum-border-focus); }
.alert { padding:12px 16px; border-radius:8px; border:1px solid; margin:8px 0; }
.alert-success { background: var(--lum-feedback-success-background); color: var(--lum-feedback-success-text); border-color: var(--lum-feedback-success-border); }
.alert-warning { background: var(--lum-feedback-warning-background); color: var(--lum-feedback-warning-text); border-color: var(--lum-feedback-warning-border); }
.alert-error { background: var(--lum-feedback-error-background); color: var(--lum-feedback-error-text); border-color: var(--lum-feedback-error-border); }
.alert-info { background: var(--lum-feedback-info-background); color: var(--lum-feedback-info-text); border-color: var(--lum-feedback-info-border); }
.card { background: var(--lum-background-surface); border:1px solid var(--lum-border-subtle); border-radius:12px; padding:16px; }
.card p { color: var(--lum-text-secondary); }
.muted { color: var(--lum-text-disabled); }
.chart { display:flex; gap:8px; }
.sw { width:48px; height:48px; border-radius:8px; }
small { color: var(--lum-text-secondary); }
</style></head><body>
<header><h1>${title}</h1><nav><a href="#">Home</a><a href="#">Docs</a><a href="#">Settings</a></nav></header>
<main>
<section><h2>Buttons</h2><div class="row">
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-ghost">Ghost</button>
<button class="btn btn-primary" disabled>Disabled</button>
</div></section>
<section><h2>Form</h2>
<label for="q">Search query</label>
<input type="text" id="q" placeholder="Type to search...">
</section>
<section><h2>Alerts</h2>
<div class="alert alert-success">Success: changes saved.</div>
<div class="alert alert-warning">Warning: check your input.</div>
<div class="alert alert-error">Error: something went wrong.</div>
<div class="alert alert-info">Info: a new version is available.</div>
</section>
<section><h2>Card</h2><div class="card"><strong>Card title</strong>
<p>Secondary body text on a raised surface, with a <a href="#">link</a>.</p>
<p class="muted">Disabled / muted text.</p></div></section>
<section><h2>Chart series</h2><div class="chart">
<div class="sw" style="background:var(--lum-chart-series-1)"></div>
<div class="sw" style="background:var(--lum-chart-series-2)"></div>
<div class="sw" style="background:var(--lum-chart-series-3)"></div>
<div class="sw" style="background:var(--lum-chart-series-4)"></div>
<div class="sw" style="background:var(--lum-chart-series-5)"></div>
<div class="sw" style="background:var(--lum-chart-series-6)"></div>
</div><small>Six categorical series.</small></section>
</main></body></html>`;
}

const manifest = [];
function emit(id, brand, profile, theme, palette, report, kind) {
  const values = palette.themes[theme].values;
  const title = `LUMINA gallery — ${id}`;
  writeFileSync(`${OUT}/${id}.html`, renderPage(values, title));
  const c = report.certification;
  const focus = report.pairs.find((p) => p.foreground_token === 'focus.ring' && p.background_token === 'background.default' && p.theme === theme);
  const body = report.pairs.find((p) => p.foreground_token === 'text.primary' && p.background_token === 'background.default' && p.theme === theme);
  manifest.push({ id, kind, brand, profile, theme, file: `${id}.html`,
    certifiable: c.certifiable, blocking_failures: c.blocking_failures, warnings: c.warnings,
    focusCR: focus ? focus.contrast_ratio_reported : null, bodyCR: body ? body.contrast_ratio_reported : null });
}

// Passing variants: 8 brands x integral x 3 themes
for (const [name, hex] of BRANDS) {
  const { palette, report } = buildPalette({ brand: hex, profile: 'integral', seed: 20260908 });
  for (const theme of THEMES) emit(`brand-${name}-${theme}`, hex, 'integral', theme, palette, report, 'pass');
}
// Profile variants for the reference brand
for (const profile of ['wcag-aaa', 'aaa-plus']) {
  const { palette, report } = buildPalette({ brand: '#1E40AF', profile, seed: 20260908 });
  for (const theme of THEMES) emit(`profile-${profile}-${theme}`, '#1E40AF', profile, theme, palette, report, 'pass');
}
// Defective variants: mutate the reference integral palette, re-audit (ground truth)
const base = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });
function defect(id, theme, mutate) {
  const palette = JSON.parse(JSON.stringify(base.palette));
  mutate(palette.themes[theme].values);
  const report = auditPalette(palette);
  emit(id, '#1E40AF', 'integral', theme, palette, report, 'defect');
}
defect('defect-invisible-focus-light', 'light', (v) => {
  v['focus.ring'] = v['interactive.primary.default'];
  v['focus.inner'] = v['interactive.primary.default'];
});
defect('defect-low-contrast-text-light', 'light', (v) => {
  v['text.primary'] = '#777777'; // ~4.5:1 on white, AAA fail
  v['text.secondary'] = '#9a9a9a';
});
defect('defect-invisible-focus-dark', 'dark', (v) => {
  v['focus.ring'] = v['interactive.primary.default'];
  v['focus.inner'] = v['interactive.primary.default'];
});

writeFileSync('../../docs/paper/data/gallery-manifest.json', JSON.stringify(manifest, null, 2));
console.log('pages:', manifest.length);
for (const m of manifest) console.log(m.id.padEnd(34), m.kind.padEnd(7), 'cert', m.certifiable, 'block', m.blocking_failures, 'warn', m.warnings, 'focusCR', m.focusCR, 'bodyCR', m.bodyCR);