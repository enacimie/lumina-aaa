// Run the SAME LUMINA oracle (verifyAllPairs) on every crosswalked framework
// theme at the WCAG AAA profile. Fair comparison: WCAG-derived invariants on
// published hex; missing roles -> pending (coverage gap). Aggregates AA vs AAA.
import { verifyAllPairs } from '../../lib/audit.js';
import { PROFILES, TOKEN_ROLES, PAIR_MATRIX } from '../../lib/architecture.js';
import { readFileSync, writeFileSync } from 'fs';

const { frameworks } = JSON.parse(readFileSync('../../docs/paper/data/frameworks.json', 'utf8'));
const profile = PROFILES['wcag-aaa'];
const CONTRAST = ['text', 'text-large', 'non-text', 'focus', 'advisory-text'];
const out = { oracle: 'LUMINA verifyAllPairs (lib/audit.js)', profile: 'wcag-aaa', pairKinds: PAIR_MATRIX.length, rolesTotal: TOKEN_ROLES.length, frameworks: [] };

for (const f of frameworks) {
  const meta = f.meta || { decorative: [], focusProxy: false };
  const deco = new Set(meta.decorative || []);
  const isDeco = (p) => deco.has(p.foreground_token) || deco.has(p.background_token);
  const scorable = (p) => p.status === 'pass' || p.status === 'fail' || p.status === 'warning';
  const entry = { name: f.name, version: f.version, source: f.source, kind: f.kind, meta, themes: {} };
  for (const [tname, values] of Object.entries(f.themes)) {
    const pairs = verifyAllPairs({ name: tname, values }, profile);
    const resolved = pairs.filter((p) => p.status !== 'pending');
    const cpAll = resolved.filter((p) => CONTRAST.includes(p.class));
    // Functional contrast pairs exclude roles the crosswalk marks decorative
    // (WCAG 1.4.11 exempts decorative elements). The scorable denominator also
    // excludes not_applicable / exception pairs, so rates are comparable.
    const cpFunctional = cpAll.filter((p) => !isDeco(p));
    const cp = cpFunctional.filter(scorable);
    const textPairs = cp.filter((p) => p.class === 'text' || p.class === 'text-large');
    const fails = cp.filter((p) => p.status === 'fail');
    // Core headline pairs exclude interpretation-sensitive border/feedback roles;
    // full functional counts are kept as a sensitivity analysis.
    const isInterp = (p) => /^(border|feedback)\./.test(p.foreground_token) || /^(border|feedback)\./.test(p.background_token);
    const core = cp.filter((p) => !isInterp(p));
    const coreText = core.filter((p) => p.class === 'text' || p.class === 'text-large');
    const coreFails = core.filter((p) => p.status === 'fail');
    const focusBg = pairs.find((p) => p.foreground_token === 'focus.ring' && p.background_token === 'background.default');
    const bodyBg = pairs.find((p) => p.foreground_token === 'text.primary' && p.background_token === 'background.default');
    entry.themes[tname] = {
      rolesProvided: Object.keys(values).length,
      pairsResolved: resolved.length,
      pairsPending: pairs.length - resolved.length,
      contrastPairsAll: cpAll.length,
      decorativeExcluded: cpAll.filter(isDeco).length,
      notApplicableException: cpFunctional.length - cp.length,
      contrastPairs: cp.length,
      wcagAA: cp.filter((p) => p.wcag_aa).length,
      wcagAAA: cp.filter((p) => p.wcag_aaa).length,
      textPairs: textPairs.length,
      textAAA: textPairs.filter((p) => p.wcag_aaa).length,
      blockingFailures: fails.length,
      coreContrastPairs: core.length,
      coreAA: core.filter((p) => p.wcag_aa).length,
      coreAAA: core.filter((p) => p.wcag_aaa).length,
      coreTextPairs: coreText.length,
      coreTextAAA: coreText.filter((p) => p.wcag_aaa).length,
      coreBlockingFailures: coreFails.length,
      interpretiveExcluded: cp.length - core.length,
      focusProxy: !!meta.focusProxy,
      bodyTextCR: bodyBg ? bodyBg.contrast_ratio_reported : null,
      focusRingCR: focusBg ? focusBg.contrast_ratio_reported : null,
      failures: fails.map((p) => ({ pair: `${p.foreground_token} / ${p.background_token}`, class: p.class, cr: p.contrast_ratio_reported ?? p.measured_delta_e2000, required: p.required_ratio ?? p.required_delta_e2000 })),
    };
  }
  out.frameworks.push(entry);
}
writeFileSync('../../docs/paper/data/framework-audit.json', JSON.stringify(out, null, 2));

console.log(`Oracle: LUMINA verifyAllPairs | profile wcag-aaa | ${PAIR_MATRIX.length} pair kinds | ${TOKEN_ROLES.length} roles`);
console.log('CORE = text + interactive non-text + focus (border/feedback excluded). Full functional in parentheses. * = focus proxy.\n');
console.log('FRAMEWORK'.padEnd(20), 'THEME'.padEnd(6), 'coreN'.padEnd(6), 'coreAA'.padEnd(7), 'coreAAA'.padEnd(8), 'coreText'.padEnd(9), 'fullAA/AAA'.padEnd(11), 'focusCR');
for (const f of out.frameworks) {
  for (const [t, x] of Object.entries(f.themes)) {
    console.log(
      f.name.padEnd(20), t.padEnd(6),
      `${x.coreContrastPairs}`.padEnd(6),
      `${x.coreAA}`.padEnd(7), `${x.coreAAA}`.padEnd(8),
      `${x.coreTextAAA}/${x.coreTextPairs}`.padEnd(9),
      `${x.wcagAA}/${x.wcagAAA} (n=${x.contrastPairs})`.padEnd(11),
      `${x.focusRingCR ?? '-'}${x.focusProxy ? '*' : ''}`);
  }
}