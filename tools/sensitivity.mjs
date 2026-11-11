// Sensitivity of the audit to the DeltaE2000 thresholds.
//
// The enhanced profiles use DeltaE2000 >= 5 for state discriminability and
// distinctness, and >= 10 for chart-series CVD separation. These are design
// constants. This script re-audits the reference palette at several
// thresholds to show how the verdicts move, without changing the library.
//
// Output: docs/paper/data/sensitivity.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPalette } from '../lib/index.js';
import { auditPalette } from '../lib/audit.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'paper', 'data', 'sensitivity.json');

const THRESHOLDS = [0, 3, 5, 7, 10, 12];
const base = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });

const rows = [];
for (const tau of THRESHOLDS) {
  const palette = structuredClone(base.palette);
  palette.profile = {
    ...palette.profile,
    stateChange: { ...palette.profile.stateChange, deltaE2000: tau },
    distinct: { ...palette.profile.distinct, deltaE2000Min: tau },
    cvd: { ...palette.profile.cvd, deltaE2000Min: tau },
  };
  const report = auditPalette(palette);
  const status = {};
  for (const p of report.pairs) status[p.status] = (status[p.status] ?? 0) + 1;
  rows.push({
    threshold: tau,
    isCurrent: tau === 5,
    blocking_failures: report.certification.blocking_failures,
    warnings: report.certification.warnings,
    certifiable: report.certification.certifiable,
    pair_status: status,
  });
}

const out = {
  description: 'audit verdicts on the reference palette as a function of the DeltaE2000 threshold for state-change, distinctness and CVD',
  reference: { brand: '#1E40AF', profile: 'integral', seed: 20260908 },
  current_threshold: 5,
  note: 'the profile thresholds are design constants; this table shows their sensitivity, not a perceptual validation',
  rows,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('sensitivity: wrote', OUT);
for (const r of rows) {
  console.log(`  tau=${String(r.threshold).padStart(2)} | blocking=${r.blocking_failures} warnings=${String(r.warnings).padStart(2)} | pass=${r.pair_status.pass ?? 0} n/a=${r.pair_status.not_applicable ?? 0} exception=${r.pair_status.exception ?? 0}`);
}
