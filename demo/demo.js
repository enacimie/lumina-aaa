/* LUMINA demo controller. Renders everything from the worker's palette +
 * audit report; no palette value is hardcoded here. */

const $ = (id) => document.getElementById(id);
const WORKER = new Worker('worker.js', { type: 'module' });

let state = { palette: null, report: null, theme: 'light', cvd: 'none' };

/* ---------- CSS variable injection (mirrors tokens/lumina.css) ---------- */

const varName = (role) => `--lum-${role.replaceAll('.', '-')}`;

function injectTheme(name, values) {
  const rules = values.map(([role, hex]) => `  ${varName(role)}: ${hex};`).join('\n');
  const style = document.createElement('style');
  style.dataset.theme = name;
  style.textContent = `[data-theme="${name}"] {\n  color-scheme: ${name === 'dark' ? 'dark' : 'light'};\n${rules}\n  --lum-focus-ring-width: 2px;\n  --lum-focus-gap: 2px;\n  --lum-focus-ring-offset: 2px;\n}\n`;
  document.head.appendChild(style);
}

function injectPalette(palette) {
  for (const old of document.querySelectorAll('style[data-theme]')) old.remove();
  for (const [name, theme] of Object.entries(palette.themes)) {
    injectTheme(name, Object.entries(theme.values));
  }
}

/* ---------- status ---------- */

function setStatus(text, mode = '') {
  $('status').className = `status ${mode}`;
  $('status-text').textContent = text;
}

/* ---------- build ---------- */

function requestBuild() {
  const hex = $('brand-hex').value.trim().toUpperCase();
  setStatus('generating palette...', 'busy');
  WORKER.postMessage({ brand: hex, profile: $('profile').value, seed: Number($('seed').value) || 0 });
}

WORKER.onmessage = ({ data }) => {
  if (!data.ok) { setStatus(`error: ${data.error}`, 'error'); return; }
  state.palette = data.palette;
  state.report = data.report;
  injectPalette(data.palette);
  renderCert(data);
  renderStateTable();
  renderChart();
  renderTokens();
  renderAudit();
  setStatus(`done in ${(data.ms / 1000).toFixed(1)} s`);
};

WORKER.onerror = (e) => setStatus(`worker error: ${e.message}`, 'error');

/* ---------- certification panel ---------- */

function renderCert({ report }) {
  const c = report.certification;
  $('cert').hidden = false;
  $('cert-level').textContent = c.level;
  $('cert-blocking').textContent = c.blocking_failures;
  $('cert-warnings').textContent = c.warnings;
  $('cert-pairs').textContent = report.pairs.length;
  const hash = report.report?.hash ?? '-';
  $('cert-hash').textContent = hash === '-' ? '-' : hash.slice(0, 16) + '...';
  $('footer-hash').textContent = hash;
  // The heading and the panel share the feedback pair, so the status colour
  // is always measured against its own background (an audited pair).
  const ok = c.certifiable ? 'success' : 'error';
  $('cert-level').style.color = `var(--lum-feedback-${ok}-text)`;
  $('cert').style.background = `var(--lum-feedback-${ok}-background)`;
  $('cert').style.borderColor = `var(--lum-feedback-${ok}-border)`;
}

/* ---------- state-change table ---------- */

function valueOf(theme, role) { return state.palette.themes[theme].values[role]; }

function renderStateTable() {
  const tb = $('state-table').querySelector('tbody');
  tb.innerHTML = '';
  const rows = ['interactive.primary', 'interactive.secondary', 'interactive.ghost'];
  for (const base of rows) {
    const tr = document.createElement('tr');
    const cells = [base, 'default', 'hover', 'active'].map((suffix, i) => {
      const role = i === 0 ? `${base}.default` : `${base}.${suffix}`;
      const hex = valueOf(state.theme, role);
      return i === 0 ? `<td>${base}</td>`
        : `<td><span class="sw" style="background:${hex}"></span><span class="mono">${hex}</span></td>`;
    });
    tr.innerHTML = cells.join('');
    tb.appendChild(tr);
  }
}

/* ---------- chart ---------- */

function renderChart() {
  const series = Array.from({ length: 6 }, (_, i) => valueOf(state.theme, `chart.series.${i + 1}`));
  const axis = valueOf(state.theme, 'chart.axis');
  const grid = valueOf(state.theme, 'chart.grid');
  const label = valueOf(state.theme, 'chart.label');
  const svg = $('chart-svg');
  const W = 640, H = 320, M = { l: 40, r: 16, t: 16, b: 28 };
  const n = 24;
  const rnd = mulberry(1234);
  const data = series.map((_, s) => Array.from({ length: n }, (_, i) =>
    0.5 + 0.35 * Math.sin((i / n) * Math.PI * 2 * (1 + s * 0.35) + s) * (1 - s * 0.1) + (rnd() - 0.5) * 0.08));
  const x = (i) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const y = (v) => M.t + (1 - v) * (H - M.t - M.b);
  let out = '';
  for (let g = 0; g <= 4; g += 1) {
    const gy = M.t + (g / 4) * (H - M.t - M.b);
    out += `<line x1="${M.l}" y1="${gy}" x2="${W - M.r}" y2="${gy}" stroke="${grid}" stroke-width="1"/>`;
    out += `<text x="${M.l - 6}" y="${gy + 4}" fill="${axis}" font-size="10" text-anchor="end">${(1 - g / 4).toFixed(1)}</text>`;
  }
  data.forEach((ys, s) => {
    const pts = ys.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    out += `<polyline points="${pts}" fill="none" stroke="${series[s]}" stroke-width="2.5" ${state.cvd !== 'none' ? `stroke-dasharray="${[null, '10 4', '3 3', '10 4 2 4', '1 4', '8 3 2 3'][s] ?? ''}"` : ''}/>`;
  });
  out += `<text x="${W / 2}" y="${H - 6}" fill="${label}" font-size="10" text-anchor="middle">six series, distinct under the selected CVD simulation</text>`;
  svg.innerHTML = out;
  const legend = $('chart-legend');
  legend.innerHTML = '';
  series.forEach((hex, i) => {
    const span = document.createElement('span');
    span.className = 'legend-item';
    span.innerHTML = `<span class="sw" style="background:${hex}"></span>series ${i + 1} <span class="mono">${hex}</span>`;
    legend.appendChild(span);
  });
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- tokens ---------- */

function renderTokens() {
  const theme = state.palette.themes[state.theme];
  $('tokens-title').textContent = `Tokens, ${state.theme}`;
  const grid = $('token-grid');
  grid.innerHTML = '';
  for (const [role, hex] of Object.entries(theme.values)) {
    const btn = document.createElement('button');
    btn.className = 'token-card';
    btn.dataset.role = role;
    btn.innerHTML = `<div class="swatch" style="background:${hex}"></div>
      <div class="meta"><b>${role}</b><span class="mono">${hex}</span></div>`;
    btn.addEventListener('click', () => showSwatch(role, hex));
    grid.appendChild(btn);
  }
}

function showSwatch(role, hex) {
  const dlg = $('swatch-dialog');
  $('swatch-title').textContent = role;
  const token = state.palette.tokens[state.theme].find((t) => t.role === role);
  $('swatch-body').innerHTML =
    `<div class="swatch-preview" style="background:${hex}"></div>` +
    `<pre>hex       ${hex}
oklch     ${token ? `${token.oklch.l.toFixed(4)} ${token.oklch.c.toFixed(4)} ${token.oklch.h?.toFixed(2) ?? '-'}` : '-'}
luminance ${token ? token.relativeLuminance.toFixed(6) : '-'}
solvedBy  ${token ? token.derived.solvedBy : '-'}</pre>`;
  dlg.showModal();
}

/* ---------- audit matrix ---------- */

function renderAudit() {
  const pairs = state.report.pairs;
  const counts = {};
  for (const p of pairs) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const summary = $('audit-summary');
  summary.innerHTML = '';
  for (const k of ['pass', 'fail', 'warning', 'exception', 'not_applicable']) {
    const div = document.createElement('div');
    div.className = 'stat';
    div.innerHTML = `<b>${counts[k] ?? 0}</b><span class="chip ${k}">${k.replaceAll('_', ' ')}</span>`;
    summary.appendChild(div);
  }
  fillAuditTable();
}

function fillAuditTable() {
  const filter = $('audit-filter').value;
  const tb = $('audit-table').querySelector('tbody');
  tb.innerHTML = '';
  let rows = state.report.pairs;
  if (filter === 'pass') rows = rows.filter((p) => p.status === 'pass').slice(0, 40);
  else if (filter !== 'all') rows = rows.filter((p) => p.status === filter);
  const frag = document.createDocumentFragment();
  for (const p of rows.slice(0, 250)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="mono">${p.pair_id}</td><td>${p.class}</td>
      <td><span class="sw" style="background:${p.foreground_value}"></span><span class="mono">${p.foreground_value}</span></td>
      <td><span class="sw" style="background:${p.background_value}"></span><span class="mono">${p.background_value}</span></td>
      <td class="mono">${p.contrast_ratio_reported ?? '-'}</td>
      <td><span class="chip ${p.status}">${p.status.replaceAll('_', ' ')}</span></td>
      <td>${p.reason ?? p.note ?? ''}</td>`;
    frag.appendChild(tr);
  }
  tb.appendChild(frag);
}

/* ---------- wiring ---------- */

for (const b of document.querySelectorAll('.theme-btn')) {
  b.addEventListener('click', () => {
    state.theme = b.dataset.themeSet;
    document.documentElement.dataset.theme = state.theme;
    for (const x of document.querySelectorAll('.theme-btn')) {
      x.classList.toggle('is-active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    }
    renderStateTable(); renderChart(); renderTokens();
  });
}

for (const t of document.querySelectorAll('[data-tab]')) {
  t.addEventListener('click', () => {
    for (const x of document.querySelectorAll('[data-tab]')) {
      const active = x === t;
      x.classList.toggle('is-active', active);
      x.setAttribute('aria-selected', String(active));
    }
    for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `panel-${t.dataset.tab}`;
    if (t.dataset.tab === 'tokens') renderTokens();
  });
}

$('brand-color').addEventListener('input', (e) => { $('brand-hex').value = e.target.value.toUpperCase(); });
$('brand-hex').addEventListener('change', () => {
  const v = $('brand-hex').value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) $('brand-color').value = v;
});
$('regen').addEventListener('click', requestBuild);
$('audit-filter').addEventListener('change', fillAuditTable);
$('cvd').addEventListener('change', (e) => { state.cvd = e.target.value; renderChart(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) requestBuild();
});

requestBuild();
