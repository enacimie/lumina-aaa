// Objective recomputation audit of elicited LLM colour specifications.
// Multi-model / multi-prompt case study (reviewer M1/M2/M3). Each specimen was
// elicited from a named model under a disclosed prompt variant (terse = no role
// inventory; complete = disclosed 12-role inventory + explicit WCAG thresholds).
// Every declared quantity is re-derived from the published hex values.
// Output: docs/paper/data/elicited-audit.json
import { relativeLuminance } from '../lib/color.js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'docs', 'paper', 'data', 'elicited');
const OUT = join(here, '..', 'docs', 'paper', 'data', 'elicited-audit.json');

const contrast = (fg, bg) => {
  const a = relativeLuminance(fg), b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const r2 = (x) => +x.toFixed(2);

const specimens = [];
for (const f of readdirSync(DIR).filter(f => f.endsWith('.json')).sort()) {
  const model = f.replace(/\.json$/, '');
  const doc = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  for (const variant of ['terse', 'complete']) {
    const s = doc[variant];
    if (!s) continue;
    const roles = Object.keys(s.tokens);
    const ratios = s.declared_ratios.map(d => {
      const measured = contrast(d.fg, d.bg);
      const delta = d.declared - measured;
      return { ...d, measured: r2(measured), delta: r2(delta),
        wrong: Math.abs(delta) > 0.1, conservative: delta < 0, anti: delta > 0 };
    });
    const wrong = ratios.filter(x => x.wrong);
    const uncovered = roles.filter(r => !s.audited_roles.includes(r));
    const focusKey = ['focus.ring', 'focus', 'focus.indicator', 'focus.halo', 'focus-ring'].find(k => s.tokens[k]);
    const fillKey = ['interactive.primary.default', 'action.primary', 'accent', 'accent.default', 'brand'].find(k => s.tokens[k]);
    const focusCR = (focusKey && fillKey) ? r2(contrast(s.tokens[focusKey], s.tokens[fillKey])) : null;
    let conf = null;
    if (variant === 'complete') {
      const t = s.tokens;
      const checks = [
        ['body>=7', contrast(t['text.primary'], t['background.default']) >= 7],
        ['secondary>=4.5', contrast(t['text.secondary'], t['background.default']) >= 4.5],
        ['nontext>=3', contrast(t['interactive.primary.default'], t['background.default']) >= 3],
        ['focus>=3', contrast(t['focus.ring'], t['background.default']) >= 3],
      ];
      conf = { checks: checks.map(([n, ok]) => ({ name: n, ok })), failures: checks.filter(c => !c[1]).length };
    }
    specimens.push({ model, variant, roles: roles.length,
      declared: ratios.length, wrong_over_01: wrong.length,
      conservative: wrong.filter(x => x.conservative).length, anti: wrong.filter(x => x.anti).length,
      max_anti_delta: Math.max(0, ...wrong.filter(x => x.anti).map(x => x.delta)),
      uncovered: uncovered.length, coverage_gap_pct: r2(100 * uncovered.length / roles.length),
      focus_vs_fill_CR: focusCR, focus_invisible: focusCR !== null && focusCR < 1.2,
      focus_below3: focusCR !== null && focusCR < 3.0,
      undefined_functions: (s.pseudocode_functions || []).length, conformance: conf });
  }
}

const agg = (vs) => {
  const n = vs.length;
  const mean = (k) => r2(vs.reduce((a, x) => a + x[k], 0) / n);
  return { n, mean_wrong_over_01: mean('wrong_over_01'), mean_coverage_gap_pct: mean('coverage_gap_pct'),
    focus_invisible_count: vs.filter(x => x.focus_invisible).length,
    focus_below3_count: vs.filter(x => x.focus_below3).length,
    mean_undefined_functions: mean('undefined_functions') };
};
const out = {
  description: 'Recomputation audit of elicited specifications. terse = no inventory; complete = disclosed 12-role inventory + thresholds. All ratios re-derived from published hex.',
  specimens,
  aggregate: { terse: agg(specimens.filter(s => s.variant === 'terse')), complete: agg(specimens.filter(s => s.variant === 'complete')) },
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
for (const s of specimens) console.log(s.model.padEnd(9), s.variant.padEnd(8),
  'wrong', s.wrong_over_01, '(cons', s.conservative, '/anti', s.anti + ')',
  'covgap', s.coverage_gap_pct + '%', 'focusCR', s.focus_vs_fill_CR, 'invis', s.focus_invisible,
  'confFail', s.conformance ? s.conformance.failures : '-');
console.log('aggregate:', JSON.stringify(out.aggregate));
