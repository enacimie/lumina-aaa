// Generates the stimulus set for the perceptual study protocol.
//
// For each (background, view, pair type, DeltaE target) it finds the state
// colour that sits at the target CIEDE2000 from the resting colour under that
// view, then writes docs/paper/data/stimuli.json. The study page (demo/study/)
// reads that file.
//
// The target is the distance BETWEEN THE TWO STATES, not the distance from the
// background. The resting colour is a real palette component (the primary
// interactive colour for chromatic pairs, a neutral at the secondary-text
// lightness for achromatic pairs). The state colour moves away from the
// background, so a hover step increases contrast instead of losing it.
//
// Each condition carries the raw pair (for the clinical cohort, who see the
// stimulus directly) and the simulated pair (for the simulation cohort, who
// see what a dichromat would see). Both are emitted so the runner does not
// have to re-derive them.
//
// Output: docs/paper/data/stimuli.json

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CVD_TYPES,
  contrastRatio,
  deltaE2000,
  hexToOklch,
  oklchToHex,
  simulateCvd,
} from '../lib/color.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT = join(ROOT, 'docs', 'paper', 'data', 'stimuli.json');
const TOKENS = join(ROOT, 'tokens');

const TARGETS = [3, 5, 7, 10];
const VIEWS = ['normal', ...CVD_TYPES];
const PAIR_TYPES = ['chromatic', 'achromatic'];
const BASE_CONTRAST_MIN = 7.0;

const THEMES = {
  light: {
    background: JSON.parse(readFileSync(join(TOKENS, 'theme.light.json'), 'utf8')).tokens['background.default'],
    chromatic: JSON.parse(readFileSync(join(TOKENS, 'theme.light.json'), 'utf8')).tokens['interactive.primary.default'],
    achromatic: JSON.parse(readFileSync(join(TOKENS, 'theme.light.json'), 'utf8')).tokens['text.secondary'],
    direction: -1, // darker state on a light background
  },
  dark: {
    background: JSON.parse(readFileSync(join(TOKENS, 'theme.dark.json'), 'utf8')).tokens['background.default'],
    chromatic: JSON.parse(readFileSync(join(TOKENS, 'theme.dark.json'), 'utf8')).tokens['interactive.primary.default'],
    achromatic: JSON.parse(readFileSync(join(TOKENS, 'theme.dark.json'), 'utf8')).tokens['text.secondary'],
    direction: +1, // lighter state on a dark background
  },
};

const viewOf = (hex, view) => (view === 'normal' ? hex : simulateCvd(hex, view));

/**
 * Neutral at the lightness whose contrast against the background is the
 * profile minimum, on the side that leaves the most room to move away from
 * the background. Solving for the minimum (rather than reusing a text token)
 * keeps the largest headroom for the largest DeltaE target.
 */
function achromaticBaseFor(bgHex, direction, tau = BASE_CONTRAST_MIN + 0.2) {
  let lo = 0.02;
  let hi = 0.98;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const cr = contrastRatio(oklchToHex({ L: mid, C: 0, H: 0 }), bgHex);
    if (direction < 0) {
      if (cr > tau) lo = mid; else hi = mid;
    } else if (cr > tau) hi = mid; else lo = mid;
  }
  return oklchToHex({ L: (lo + hi) / 2, C: 0, H: 0 });
}

/** Find the state colour at `target` CIEDE2000 from the resting colour. */
function solveVariant(baseHex, target, view, type, direction) {
  const base = hexToOklch(baseHex);
  const steps = 400;
  let best = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const L = direction < 0
      ? base.L - t * (base.L - 0.02)
      : base.L + t * (0.98 - base.L);
    const C = type === 'achromatic' ? 0 : Math.min(base.C, 0.18);
    const hex = oklchToHex({ L, C, H: base.H });
    const d = deltaE2000(viewOf(hex, view), viewOf(baseHex, view));
    if (best === null || Math.abs(d - target) < Math.abs(best.d - target)) {
      best = { L, C, hex, d };
    }
  }
  return best;
}

export function generateStimuli() {
  const conditions = [];
  for (const [bgName, theme] of Object.entries(THEMES)) {
    for (const type of PAIR_TYPES) {
      const baseHex = type === 'achromatic'
        ? achromaticBaseFor(theme.background, theme.direction)
        : theme.chromatic;
      for (const view of VIEWS) {
        for (const target of TARGETS) {
          const solved = solveVariant(baseHex, target, view, type, theme.direction);
          const baseSim = viewOf(baseHex, view);
          const variantSim = viewOf(solved.hex, view);
          const contrastBase = contrastRatio(baseHex, theme.background);
          const contrastVariant = contrastRatio(solved.hex, theme.background);
          conditions.push({
            background: bgName,
            background_hex: theme.background,
            view,
            type,
            target_deltaE2000: target,
            base_hex: baseHex,
            variant_hex: solved.hex,
            base_simulated: baseSim,
            variant_simulated: variantSim,
            measured_deltaE2000: Number(solved.d.toFixed(2)),
            measured_deltaE2000_raw: Number(deltaE2000(baseHex, solved.hex).toFixed(2)),
            contrast_base: Number(contrastBase.toFixed(2)),
            contrast_variant: Number(contrastVariant.toFixed(2)),
            contrast_ok: contrastBase >= BASE_CONTRAST_MIN && contrastVariant >= BASE_CONTRAST_MIN,
            trials: 10,
          });
        }
      }
    }
  }
  return {
    description: 'stimulus set for the perceptual validation of the state-discriminability threshold',
    protocol: 'study-protocol.md (distributed with the manuscript)',
    factors: {
      targets: TARGETS,
      backgrounds: Object.keys(THEMES),
      views: VIEWS,
      pair_types: PAIR_TYPES,
    },
    base_contrast_min: BASE_CONTRAST_MIN,
    note: 'the target is the CIEDE2000 between the two states; base_simulated/variant_simulated are the pair a normal observer sees, base_hex/variant_hex are the pair a dichromat sees',
    conditions,
  };
}

export { achromaticBaseFor, solveVariant, THEMES, TARGETS, VIEWS, PAIR_TYPES, BASE_CONTRAST_MIN };

function main() {
  const out = generateStimuli();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('stimuli: wrote', OUT, 'with', out.conditions.length, 'conditions');
  const bad = out.conditions.filter((c) => !c.contrast_ok);
  console.log('contrast violations:', bad.length);
  for (const c of bad) {
    console.log(' ', c.background, c.view, c.type, 'target', c.target_deltaE2000,
      'base', c.contrast_base, 'variant', c.contrast_variant);
  }
  const byType = {};
  for (const c of out.conditions) byType[c.type] = (byType[c.type] ?? 0) + 1;
  console.log('by type:', JSON.stringify(byType));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
