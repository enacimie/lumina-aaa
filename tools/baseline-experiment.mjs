// Golden-angle baseline vs LUMINA CVD-aware selection, same L/C budget,
// plus the v0.2 categorical palette as an ecological comparator.
import { buildPalette } from '../lib/index.js';
import { simulateCvd, deltaE2000, hexToOklch, oklchToHex } from '../lib/color.js';
import { writeFileSync } from 'fs';

const VIEWS = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];
const view = (hex, v) => v === 'normal' ? hex : simulateCvd(hex, v);
const minPair = (series, bg, v) => {
  let m = Infinity;
  const vals = [bg, ...series].map(h => view(h, v));
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
    const d = deltaE2000(vals[i], vals[j]); if (d < m) m = d;
  }
  return m;
};
const report = (series, bg) => Object.fromEntries(VIEWS.map(v => [v, +minPair(series, bg, v).toFixed(2)]));

// Fixed categorical palettes published by the v0.2 specification (sections
// 13.2 and 13.3), on its own light and dark surfaces.
const V02_CATEGORICAL = {
  light: { series: ['#1E40AF', '#14532D', '#7C2D12', '#5B21B6', '#7F1D1D'], background: '#FFFFFF' },
  dark: { series: ['#93C5FD', '#86EFAC', '#FDE68A', '#C4B5FD', '#FCA5A5'], background: '#1E293B' },
};

const out = { description: 'golden-angle baseline vs LUMINA solver vs the v0.2 categorical palette, min pairwise DeltaE2000 against already-selected series and chart background', themes: {} };
const { palette } = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });
for (const [name, theme] of Object.entries(palette.themes)) {
  const bg = theme.values['chart.background'];
  const solved = Array.from({ length: 6 }, (_, i) => theme.values[`chart.series.${i + 1}`]);
  const budget = solved.map(s => hexToOklch(s));
  const L = budget.reduce((a, b) => a + b.L, 0) / 6;
  const C = budget.reduce((a, b) => a + b.C, 0) / 6;
  const H = hexToOklch(theme.values['interactive.primary.default']).H;
  const golden = Array.from({ length: 6 }, (_, i) => oklchToHex({ L, C, H: (H + i * 137.5) % 360 }));
  out.themes[name] = {
    budget: { L: +L.toFixed(4), C: +C.toFixed(4), brandHue: +H.toFixed(2) },
    lumina: { series: solved, minDeltaE2000: report(solved, bg) },
    goldenAngle: { series: golden, minDeltaE2000: report(golden, bg) },
  };
  if (V02_CATEGORICAL[name]) {
    const v02 = V02_CATEGORICAL[name];
    out.themes[name].v02Categorical = {
      series: v02.series,
      background: v02.background,
      minDeltaE2000: report(v02.series, v02.background),
    };
  }
}
writeFileSync('docs/paper/data/baseline-comparison.json', JSON.stringify(out, null, 2));
for (const [n, t] of Object.entries(out.themes)) {
  console.log(n.padEnd(9), 'LUMINA:', JSON.stringify(t.lumina.minDeltaE2000), 'GOLDEN:', JSON.stringify(t.goldenAngle.minDeltaE2000), 'V02:', t.v02Categorical ? JSON.stringify(t.v02Categorical.minDeltaE2000) : '-');
}
