// Uniform hue sweep: 360 brand hues at 1 degree steps (OKLCH L=0.45, C=0.15),
// integral profile, fixed seed. Addresses the curated-sample concern: a uniform
// sample of the hue circle, reporting certifiability, blocking failures, margin
// escalations and rejections. Output: docs/paper/data/hue-sweep.json
import { buildPalette } from '../lib/index.js';
import { oklchToHex } from '../lib/color.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'paper', 'data', 'hue-sweep.json');
const SEED = 20260908;
const rows = [];
let certifiable = 0, blocking = 0, escalated = 0, rejected = 0;
for (let h = 0; h < 360; h += 1) {
  const brand = oklchToHex({ L: 0.45, C: 0.15, H: h });
  try {
    const { report, adjusted } = buildPalette({ brand, profile: 'integral', seed: SEED });
    const c = report.certification;
    if (c.certifiable) certifiable += 1;
    if (c.blocking_failures > 0) blocking += 1;
    if (adjusted) escalated += 1;
    rows.push({ hue: h, brand, certifiable: c.certifiable, blocking_failures: c.blocking_failures, warnings: (c.warning_ids ?? []).length, adjusted });
  } catch (e) {
    rejected += 1;
    rows.push({ hue: h, brand, rejected: true, error: String(e.message ?? e).slice(0, 80) });
  }
}
const out = {
  description: 'Uniform hue sweep: 360 brand hues at 1 degree (OKLCH L=0.45, C=0.15), integral profile, seed 20260908. Reports certifiability, blocking failures, margin escalations and rejections over a uniform sample of the hue circle.',
  seed: SEED, profile: 'integral', hues: 360, certifiable, blocking_failures: blocking, margin_escalations: escalated, rejected,
  rows,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`hue-sweep: 360 hues | certifiable=${certifiable} blocking=${blocking} escalated=${escalated} rejected=${rejected}`);
