// Mutation / fault-injection study: does the auditor DETECT seeded defects?
// Addresses reviewer M2/M4 (verifier never validated as a detector).
// Ground truth: each mutant injects one known defect into a named relation.
// Detection = the targeted relation is reported non-pass (MUST-fail or
// SHOULD-warning) after mutation. False positives measured on clean palettes.
// Output: docs/paper/data/mutation-study.json
import { buildPalette, auditPalette } from '../lib/index.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'paper', 'data', 'mutation-study.json');

const { palette: ref } = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });
const base = auditPalette(ref);
const baseFails = new Set(base.certification.failure_ids);
const baseWarns = new Set(base.certification.warning_ids);

const clone = (p) => structuredClone(p);
const V = (p, t, role) => p.themes[t].values[role];
const set = (p, t, role, val) => { p.themes[t].values[role] = val; };

const mutants = [
  { id: 'MT-01', cls: 'contrast-text', verdict: 'fail', roles: ['text.primary'],
    desc: 'body text below 7:1 (light)', apply: p => set(p, 'light', 'text.primary', '#767676') },
  { id: 'MT-02', cls: 'contrast-text', verdict: 'fail', roles: ['text.primary'],
    desc: 'body text below 7:1 (dark)', apply: p => set(p, 'dark', 'text.primary', '#8A8A8A') },
  { id: 'MT-03', cls: 'contrast-text-boundary', verdict: 'fail', roles: ['text.primary'],
    desc: 'body text just under threshold', apply: p => set(p, 'light', 'text.primary', '#5F5F5F') },
  { id: 'MT-04', cls: 'contrast-nontext', verdict: 'fail', roles: ['interactive.primary.default'],
    desc: 'interactive fill below 3:1 vs surface', apply: p => set(p, 'light', 'interactive.primary.default', '#BFDBFE') },
  { id: 'MT-05', cls: 'focus-alias', verdict: 'fail', roles: ['focus.inner'],
    desc: 'focus inner ring aliased to fill (CR 1.0)', apply: p => set(p, 'light', 'focus.inner', V(p, 'light', 'interactive.primary.default')) },
  { id: 'MT-06', cls: 'focus-alias', verdict: 'fail', roles: ['focus.inner'],
    desc: 'focus inner ring aliased to fill (dark)', apply: p => set(p, 'dark', 'focus.inner', V(p, 'dark', 'interactive.primary.default')) },
  { id: 'MT-07', cls: 'missing-role', verdict: 'fail', roles: ['text.inverse'],
    desc: 'mandatory role removed (text.inverse)', apply: p => { delete p.themes.light.values['text.inverse']; } },
  { id: 'MT-08', cls: 'state-discriminability', verdict: 'warning', roles: ['interactive.primary.hover'],
    desc: 'hover identical to default (dE 0)', apply: p => set(p, 'light', 'interactive.primary.hover', V(p, 'light', 'interactive.primary.default')) },
  { id: 'MT-09', cls: 'cvd-separability', verdict: 'warning', roles: ['chart.series.2'],
    desc: 'two chart series identical', apply: p => set(p, 'light', 'chart.series.2', V(p, 'light', 'chart.series.1')) },
  { id: 'MT-10', cls: 'accent-chroma', verdict: 'warning', roles: ['interactive.primary.default'],
    desc: 'accent desaturated below chroma band', apply: p => set(p, 'light', 'interactive.primary.default', '#6B7280') },
  { id: 'MT-11', cls: 'surface-distinctness', verdict: 'warning', roles: ['background.raised'],
    desc: 'raised surface identical to default', apply: p => set(p, 'light', 'background.raised', V(p, 'light', 'background.default')) },
  { id: 'MT-12', cls: 'contrast-text', verdict: 'fail', roles: ['text.primary'],
    desc: 'body text below 7:1 (contrast theme)', apply: p => set(p, 'contrast', 'text.primary', '#767676') },
];

const nonpass = (arr) => (arr || []).filter(x => x.status === 'fail' || x.status === 'warning');
const results = [];
for (const m of mutants) {
  const p = clone(ref);
  m.apply(p);
  const rep = auditPalette(p);
  const all = [...rep.pairs, ...rep.distinctness_checks, ...rep.token_checks, ...rep.structure_checks, ...rep.primitive_checks];
  const targeted = nonpass(all).filter(x => m.roles.some(r => JSON.stringify(x).includes(r)));
  const newFails = rep.certification.failure_ids.filter(x => !baseFails.has(x));
  const newWarns = rep.certification.warning_ids.filter(x => !baseWarns.has(x));
  results.push({ id: m.id, cls: m.cls, desc: m.desc, expected: m.verdict,
    detected: targeted.length > 0, targeted_nonpass: targeted.length,
    new_failures: newFails.length, new_warnings: newWarns.length,
    sample_ids: targeted.slice(0, 3).map(x => x.check_id ?? x.pair_id) });
}

const fp = [];
fp.push({ id: 'FP-00', desc: 'unmutated reference', blocking: base.certification.blocking_failures });
for (const seed of [1, 42, 20260909]) {
  const { report: br } = buildPalette({ brand: '#1E40AF', profile: 'integral', seed });
  fp.push({ id: `FP-seed-${seed}`, desc: `benign seed ${seed}`, blocking: br.certification.blocking_failures, certifiable: br.certification.certifiable });
}

const byClass = {};
for (const r of results) {
  byClass[r.cls] = byClass[r.cls] || { total: 0, detected: 0 };
  byClass[r.cls].total += 1; if (r.detected) byClass[r.cls].detected += 1;
}
const detectedTotal = results.filter(r => r.detected).length;

const out = {
  description: 'Fault-injection study on the integral reference palette. Each mutant injects one known defect into a named relation; detection = that relation reported non-pass (MUST-fail or SHOULD-warning). False-positive controls are clean palettes.',
  baseline: { blocking_failures: base.certification.blocking_failures, warnings: base.certification.warning_ids.length },
  mutants: results,
  per_class: byClass,
  recall: detectedTotal / results.length,
  false_positive_controls: fp,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('mutation recall:', (out.recall * 100).toFixed(1) + '%', `(${detectedTotal}/${results.length})`);
console.log('per class:', JSON.stringify(byClass));
console.log('FP controls:', JSON.stringify(fp));
