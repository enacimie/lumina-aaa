// Multi-seed robustness sweep: varies the stochastic seed on a fixed brand set,
// addressing reviewer M6 (single seed => robustness not probed across the
// stochastic space). Reports per-brand certifiability and solver escalation.
// Output: docs/paper/data/multiseed-sweep.json
import { buildPalette } from '../lib/index.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'paper', 'data', 'multiseed-sweep.json');

const brands = ['#1E40AF', '#0EA5E9', '#10B981', '#EAB308', '#F97316', '#EF4444', '#A855F7', '#000000'];
const profiles = ['wcag-aaa', 'aaa-plus', 'integral'];
const seeds = [20260908, 1, 42, 7];

const rows = [];
for (const profile of profiles) for (const brand of brands) for (const seed of seeds) {
  const t0 = performance.now();
  const { report, attempts, adjusted, rejected } = buildPalette({ brand, profile, seed });
  const ms = performance.now() - t0;
  const c = report.certification;
  rows.push({ brand, profile, seed, certifiable: c.certifiable, rejected,
    blocking: c.blocking_failures, warnings: (c.warning_ids ?? []).length,
    attempts: attempts.length, adjusted, ms: Math.round(ms) });
}

const byBrand = {};
for (const r of rows) {
  const k = `${r.brand}|${r.profile}`;
  byBrand[k] = byBrand[k] || { brand: r.brand, profile: r.profile, n: 0, certifiable: 0, adjusted: 0, blocking: 0 };
  byBrand[k].n++; if (r.certifiable) byBrand[k].certifiable++; if (r.adjusted) byBrand[k].adjusted++; if (r.blocking > 0) byBrand[k].blocking++;
}
const out = {
  description: 'Multi-seed sweep: 8 brands x 3 profiles x 4 seeds. Unit of analysis is the brand-profile; seeds probe the stochastic space (neutral hue offset, chart phase).',
  seeds, builds: rows.length,
  totals: { certifiable: rows.filter(r => r.certifiable).length, rejected: rows.filter(r => r.rejected).length,
    adjusted: rows.filter(r => r.adjusted).length, blocking_builds: rows.filter(r => r.blocking > 0).length },
  per_brand_profile: Object.values(byBrand),
  results: rows,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('multiseed builds:', rows.length, JSON.stringify(out.totals));
