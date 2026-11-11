// Dumps every quantity the paper figures need, from the live library.
// Nothing in the figures is hand-authored.
import { buildPalette } from '../lib/index.js';
import { simulateCvd, hexToOklch, relativeLuminance } from '../lib/color.js';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'docs', 'paper', 'data');
mkdirSync(outDir, { recursive: true });

const VIEWS = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];
const { palette, report } = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });

const themes = {};
for (const [name, theme] of Object.entries(palette.themes)) {
  themes[name] = theme.values;
}

// CVD-simulated chart series, light theme, plus the golden-angle baseline.
const light = palette.themes.light.values;
const solved = Array.from({ length: 6 }, (_, i) => light[`chart.series.${i + 1}`]);
const oklchToHex2 = (await import('../lib/color.js')).oklchToHex;
const budget = solved.map(s => hexToOklch(s));
const L = budget.reduce((a, b) => a + b.L, 0) / 6;
const C = budget.reduce((a, b) => a + b.C, 0) / 6;
const H0 = hexToOklch(light['interactive.primary.default']).H;
const goldenSeries = Array.from({ length: 6 }, (_, i) => oklchToHex2({ L, C, H: (H0 + i * 137.5) % 360 }));

const simulate = (series) => Object.fromEntries(VIEWS.map(v => [v, series.map(s => v === 'normal' ? s : simulateCvd(s, v))]));

const data = {
  seed: 20260908, brand: '#1E40AF', profile: 'integral',
  hash: report.report.hash,
  themes,
  roles: palette.roleCount,
  roleOrder: Object.keys(themes.light),
  chart: {
    background: light['chart.background'],
    seriesSolved: solved,
    seriesGolden: goldenSeries,
    simulated: { lumina: simulate(solved), golden: simulate(goldenSeries) },
  },
  focusDemo: Object.fromEntries(Object.entries(palette.themes).map(([name, theme]) => {
    const v = theme.values;
    return [name, { page: v['background.default'], fill: v['interactive.primary.default'],
      text: v['text.on-primary'], ring: v['focus.ring'], inner: v['focus.inner'] }];
  })),
};
writeFileSync(join(outDir, 'figs.json'), JSON.stringify(data, null, 2));
console.log('figs.json written;', palette.roleCount, 'roles, hash', report.report.hash.slice(0, 8));
