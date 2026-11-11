// Generates the paper's empirical data files from the live library.
import { buildPalette } from '/home/x/Escritorio/Code/lumina-aaa/lib/index.js';
import { writeFileSync, mkdirSync } from 'fs';

const OUT = '/home/x/Escritorio/Code/lumina-aaa/docs/paper/data';
mkdirSync(OUT, { recursive: true });

/* ---- 1. robustness sweep: 25 brands x 3 profiles ---- */
const brands = [
  '#1E40AF', '#2563EB', '#0EA5E9', '#06B6D4', '#14B8A6',
  '#10B981', '#22C55E', '#84CC16', '#EAB308', '#F59E0B',
  '#F97316', '#EF4444', '#DC2626', '#E11D48', '#EC4899',
  '#D946EF', '#A855F7', '#8B5CF6', '#6366F1', '#4F46E5',
  '#7C3AED', '#0F766E', '#B45309', '#475569', '#000000',
];
const profiles = ['wcag-aaa', 'aaa-plus', 'integral'];
const rows = [];
let clean = 0, warnOnly = 0, blocking = 0, adjustedCount = 0;
const warnReasons = {};
for (const profile of profiles) {
  for (const brand of brands) {
    const t0 = performance.now();
    const { palette, report, attempts, adjusted } = buildPalette({ brand, profile, seed: 20260908 });
    const ms = performance.now() - t0;
    const c = report.certification;
    const warningIds = c.warning_ids ?? [];
    for (const w of warningIds) {
      const kind = w.includes('::chroma') ? 'LUM-IDE-004 accent chroma below band'
        : w.includes('hue-coherence') ? 'LUM-IDE-005 hue coherence'
        : w; warnReasons[kind] = (warnReasons[kind] ?? 0) + 1;
    }
    if (c.blocking_failures > 0) blocking += 1;
    else if (warningIds.length === 0) clean += 1;
    else warnOnly += 1;
    if (adjusted) adjustedCount += 1;
    rows.push({ brand, profile, certifiable: c.certifiable, level: c.level,
      blocking_failures: c.blocking_failures, warnings: warningIds.length,
      pairs: report.pairs.length, tokens: palette.roleCount * 3, ms: Math.round(ms),
      attempts: attempts.length, adjusted, hash: report.report.hash.slice(0, 16) });
  }
}
writeFileSync(`${OUT}/sweep.json`, JSON.stringify({ generated: new Date().toISOString(),
  seed: 20260908, builds: rows.length, clean, warnings_only: warnOnly, blocking_failures: blocking,
  adjusted_count: adjustedCount, warning_kinds: warnReasons, results: rows }, null, 2));
console.log(`sweep: ${rows.length} builds, clean=${clean} warnings_only=${warnOnly} blocking=${blocking}`);
console.log('warning kinds:', JSON.stringify(warnReasons));
console.log('ms avg:', Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length));

/* ---- 2. reference palette key numbers ---- */
const { palette, report } = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });
const pairCounts = {};
for (const p of report.pairs) pairCounts[p.status] = (pairCounts[p.status] ?? 0) + 1;
const disabled = report.pairs.filter(p => /disabled/.test(p.foreground_token + p.background_token) && p.contrast_ratio_reported)
  .map(p => ({ pair_id: p.pair_id, fg: p.foreground_token, bg: p.background_token, cr: p.contrast_ratio_reported, status: p.status }));
const focus = report.pairs.filter(p => p.foreground_token.startsWith('focus.') || p.background_token.startsWith('focus.'));
writeFileSync(`${OUT}/reference-palette.json`, JSON.stringify({
  identity: report.report.identity, profile: 'integral', brand: '#1E40AF', seed: 20260908,
  spec_version: report.report.spec_version, algorithm_version: report.report.algorithm_version,
  hash: report.report.hash,
  roles: palette.roleCount, tokens: palette.roleCount * 3, pairs: report.pairs.length,
  pair_kinds: new Set(report.pairs.map(p => p.pair_id.split('::')[1])).size,
  pair_status_counts: pairCounts, certification: report.certification,
  thresholds: report.report.thresholds,
  disabled_pairs: disabled,
  focus_pairs: focus.map(p => ({ pair_id: p.pair_id, fg: p.foreground_token, bg: p.background_token,
    fg_value: p.foreground_value, bg_value: p.background_value, cr: p.contrast_ratio_reported, status: p.status })),
}, null, 2));
console.log('reference: roles', palette.roleCount, 'pairs', report.pairs.length, 'statuses', JSON.stringify(pairCounts));

/* ---- 3. chart series separability (normal vs CVD) ---- */
const { simulateCvd, deltaE2000 } = await import('/home/x/Escritorio/Code/lumina-aaa/lib/color.js');
const themes = {};
for (const [name, theme] of Object.entries(palette.themes)) {
  const series = Array.from({ length: 6 }, (_, i) => theme.values[`chart.series.${i + 1}`]);
  const bg = theme.values['chart.background'];
  const min = (vals) => {
    let m = Infinity;
    for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
      const d = deltaE2000(vals[i], vals[j]); if (d < m) m = d;
    }
    return m === Infinity ? null : m;
  };
  themes[name] = {
    series, background: bg,
    min_deltaE2000_normal: min(series),
    min_deltaE2000_deuteranopia: min(series.map(s => simulateCvd(s, 'deuteranopia'))),
    min_deltaE2000_protanopia: min(series.map(s => simulateCvd(s, 'protanopia'))),
    min_deltaE2000_tritanopia: min(series.map(s => simulateCvd(s, 'tritanopia'))),
  };
}
writeFileSync(`${OUT}/chart-series.json`, JSON.stringify(themes, null, 2));
console.log('chart min dE (light): normal', themes.light.min_deltaE2000_normal.toFixed(1),
  'deutan', themes.light.min_deltaE2000_deuteranopia.toFixed(1),
  'protan', themes.light.min_deltaE2000_protanopia.toFixed(1),
  'tritan', themes.light.min_deltaE2000_tritanopia.toFixed(1));
