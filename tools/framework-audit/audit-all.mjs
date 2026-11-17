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
  const entry = { name: f.name, version: f.version, source: f.source, kind: f.kind, themes: {} };
  for (const [tname, values] of Object.entries(f.themes)) {
    const pairs = verifyAllPairs({ name: tname, values }, profile);
    const resolved = pairs.filter((p) => p.status !== 'pending');
    const cp = resolved.filter((p) => CONTRAST.includes(p.class));
    const textPairs = cp.filter((p) => p.class === 'text' || p.class === 'text-large');
    const fails = resolved.filter((p) => p.status === 'fail');
    const focusBg = pairs.find((p) => p.foreground_token === 'focus.ring' && p.background_token === 'background.default');
    const bodyBg = pairs.find((p) => p.foreground_token === 'text.primary' && p.background_token === 'background.default');
    entry.themes[tname] = {
      rolesProvided: Object.keys(values).length,
      pairsResolved: resolved.length,
      pairsPending: pairs.length - resolved.length,
      contrastPairs: cp.length,
      wcagAA: cp.filter((p) => p.wcag_aa).length,
      wcagAAA: cp.filter((p) => p.wcag_aaa).length,
      textPairs: textPairs.length,
      textAAA: textPairs.filter((p) => p.wcag_aaa).length,
      blockingFailures: fails.length,
      bodyTextCR: bodyBg ? bodyBg.contrast_ratio_reported : null,
      focusRingCR: focusBg ? focusBg.contrast_ratio_reported : null,
      failures: fails.map((p) => ({ pair: `${p.foreground_token} / ${p.background_token}`, class: p.class, cr: p.contrast_ratio_reported ?? p.measured_delta_e2000, required: p.required_ratio ?? p.required_delta_e2000 })),
    };
  }
  out.frameworks.push(entry);
}
writeFileSync('../../docs/paper/data/framework-audit.json', JSON.stringify(out, null, 2));

console.log(`Oracle: LUMINA verifyAllPairs | profile wcag-aaa | ${PAIR_MATRIX.length} pair kinds | ${TOKEN_ROLES.length} roles\n`);
console.log('FRAMEWORK'.padEnd(20), 'THEME'.padEnd(6), 'roles'.padEnd(7), 'pairs'.padEnd(9), 'contrast'.padEnd(9), 'AA'.padEnd(5), 'AAA'.padEnd(5), 'textAAA'.padEnd(9), 'fails'.padEnd(6), 'bodyCR'.padEnd(8), 'focusCR');
for (const f of out.frameworks) {
  for (const [t, x] of Object.entries(f.themes)) {
    console.log(
      f.name.padEnd(20), t.padEnd(6),
      `${x.rolesProvided}/${out.rolesTotal}`.padEnd(7),
      `${x.pairsResolved}/${out.pairKinds}`.padEnd(9),
      `${x.contrastPairs}`.padEnd(9),
      `${x.wcagAA}`.padEnd(5), `${x.wcagAAA}`.padEnd(5),
      `${x.textAAA}/${x.textPairs}`.padEnd(9),
      `${x.blockingFailures}`.padEnd(6),
      `${x.bodyTextCR ?? '-'}`.padEnd(8),
      `${x.focusRingCR ?? '-'}`);
  }
}