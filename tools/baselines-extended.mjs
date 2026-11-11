// Extended baselines: published CVD-safe categorical palettes (Okabe-Ito / Wong,
// ColorBrewer Dark2) evaluated on the same chart backgrounds as the solver,
// addressing reviewer M6 (weak / tuned-to-fail baseline). Also keeps the
// equal-budget golden-angle and the v0.2 ecological comparator.
// Output: docs/paper/data/baselines-extended.json
import { buildPalette } from '../lib/index.js';
import { simulateCvd, deltaE2000 } from '../lib/color.js';
import { writeFileSync } from 'fs';

const VIEWS = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];
const view = (h, v) => v === 'normal' ? h : simulateCvd(h, v);
const minPair = (series, bg, v) => {
  let m = Infinity; const vals = [bg, ...series].map(h => view(h, v));
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) { const d = deltaE2000(vals[i], vals[j]); if (d < m) m = d; }
  return m;
};
const report = (s, bg) => Object.fromEntries(VIEWS.map(v => [v, +minPair(s, bg, v).toFixed(2)]));

// Published, fixed palettes (not tuned to the background).
const OKABE_ITO = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00'];
const COLORBREWER_DARK2 = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02'];

const { palette } = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });
const out = { description: 'Min pairwise DeltaE2000 (series + chart background) under four views for published CVD-safe palettes vs the LUMINA solver.', themes: {} };
for (const [name, theme] of Object.entries(palette.themes)) {
  const bg = theme.values['chart.background'];
  const solved = Array.from({ length: 6 }, (_, i) => theme.values[`chart.series.${i + 1}`]);
  out.themes[name] = {
    background: bg,
    lumina: { series: solved, minDeltaE2000: report(solved, bg) },
    okabeIto: { series: OKABE_ITO, minDeltaE2000: report(OKABE_ITO, bg) },
    colorBrewerDark2: { series: COLORBREWER_DARK2, minDeltaE2000: report(COLORBREWER_DARK2, bg) },
  };
}
writeFileSync('docs/paper/data/baselines-extended.json', JSON.stringify(out, null, 2));
for (const [n, t] of Object.entries(out.themes)) console.log(n.padEnd(9), 'LUMINA', JSON.stringify(t.lumina.minDeltaE2000), 'OKABE', JSON.stringify(t.okabeIto.minDeltaE2000), 'DARK2', JSON.stringify(t.colorBrewerDark2.minDeltaE2000));
