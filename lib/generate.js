/**
 * LUMINA-AAA / lib/generate.js
 *
 * The generative model of the specification (section 5). Every
 * function that v0.2 invoked without defining it is defined here:
 *
 *   toOKLCH, generateNeutralRamp, generateSemanticRamps, generateDarkSurface,
 *   assignLightTheme, assignDarkTheme, solvePrimary, optimizeColor,
 *   assembleTokens, verifyAllPairs, adjustOrReject, validateColorVision,
 *   wcagContrast, select
 *
 * The generator is deterministic: identical (brand, profile, seed, aesthetic
 * constraints, algorithm version) always produce identical tokens, which is
 * what section 5.1 requires.
 */

import {
  ACHROMATIC_EPSILON,
  CVD_TYPES,
  compositeAlpha,
  contrastRatio,
  deltaE2000,
  hexToOklch,
  hueDifference,
  lightnessForLuminance,
  luminanceBounds,
  maxChromaAt,
  oklchToHex,
  present,
  relativeLuminance,
  rgbToHex,
  simulateCvd,
} from './color.js';

import {
  ALGORITHM_VERSION,
  MUST_BE_DISTINCT,
  PAIR_MATRIX,
  PRIMITIVE_CHROMA,
  PRIMITIVE_FAMILIES,
  PRIMITIVE_STEPS,
  PROFILES,
  ROLE_COUNT,
  SEMANTIC_HUE_PULL_MAX,
  SEMANTIC_HUES,
  SOLVE_MARGIN,
  SPEC_VERSION,
  SYSTEM,
  THEME_DESIGN,
  THEMES,
  TOKEN_ROLES,
} from './architecture.js';

/* ------------------------------------------------------------------ *
 * Deterministic PRNG (mulberry32). The seed is part of the recorded
 * provenance; it drives only free aesthetic choices (neutral hue offset,
 * chart hue phase), never a constraint.
 * ------------------------------------------------------------------ */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < string.length; i += 1) {
    h ^= string.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const GOLDEN_ANGLE = 137.50776405003785;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const shortestHueDelta = (from, to) => {
  const d = ((to - from) % 360 + 540) % 360 - 180;
  return d;
};

/** `wcagContrast` (invoked but never defined in v0.2). */
export const wcagContrast = contrastRatio;

/** `toOKLCH` (invoked but never defined in v0.2). */
export const toOKLCH = hexToOklch;

/**
 * `select` (invoked but never defined in v0.2).
 * Deterministic selection: first candidate satisfying `predicate`, ties broken
 * by the smallest `rank`. Returns null when the candidate set is empty, which
 * the caller must treat as an infeasibility (section 5.2).
 */
export function select(candidates, predicate, rank = () => 0) {
  let best = null;
  let bestRank = Infinity;
  for (const c of candidates) {
    if (!predicate(c)) continue;
    const rk = rank(c);
    if (rk < bestRank) {
      best = c;
      bestRank = rk;
    }
  }
  return best;
}

/**
 * Pull a semantic hue anchor towards the brand hue by at most `maxPull`
 * degrees. Keeps warnings warm and errors red while making every generated
 * identity tonally coherent (section 6.1).
 */
function pullHue(anchor, brandHue, maxPull) {
  return (anchor + clamp(shortestHueDelta(anchor, brandHue), -maxPull, maxPull) + 360) % 360;
}

/**
 * Minimum circular hue separation between semantic families. Without it, a
 * red brand colour pulls the `error` anchor onto the `info` anchor and the two
 * quantise to the same 8-bit value, which is a LUM-DIS-001 violation. The
 * brand hue is the identity anchor and never moves; semantic anchors move
 * AWAY from it to restore the separation.
 */
export const MIN_HUE_SEPARATION = 14;

function enforceHueSeparation(anchorMap, brandHue, fixed = ['info'], min = MIN_HUE_SEPARATION) {
  const out = { ...anchorMap };
  const keys = Object.keys(out);
  for (const k of keys) {
    if (fixed.includes(k)) continue;
    const d = shortestHueDelta(brandHue, out[k]);
    if (Math.abs(d) < min) {
      const dir = d === 0 ? 1 : Math.sign(d);
      out[k] = (brandHue + dir * min + 360) % 360;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Hue derivation
 * ------------------------------------------------------------------ */

/**
 * Hue assumed when the brand colour carries no chroma. A graphite identity has
 * no hue to extract, and falling back to 0 would silently turn it into a red
 * system; a cool slate keeps it neutral.
 */
export const NEUTRAL_BRAND_HUE = 255;

export function deriveHues(brand, seed = 0) {
  const ok = hexToOklch(brand);
  // Achromatic brand: hue is meaningless, so substitute the documented neutral
  // anchor instead of whatever atan2(0, 0) happens to produce.
  const brandHue = ok.C < ACHROMATIC_EPSILON ? NEUTRAL_BRAND_HUE : ok.H;
  const brandChroma = ok.C;
  const brandLightness = ok.L;
  const rnd = mulberry32(hashSeed(String(seed)) ^ 0x9e3779b9);
  // section 6.1: H_neutral = H_primary +/- 5 degrees
  const neutralOffset = (rnd() * 2 - 1) * 5;
  const chartPhase = rnd() * GOLDEN_ANGLE;

  const semantic = enforceHueSeparation({
    success: pullHue(SEMANTIC_HUES.success, brandHue, SEMANTIC_HUE_PULL_MAX),
    warning: pullHue(SEMANTIC_HUES.warning, brandHue, SEMANTIC_HUE_PULL_MAX),
    error: pullHue(SEMANTIC_HUES.error, brandHue, SEMANTIC_HUE_PULL_MAX),
    info: brandHue,
  }, brandHue);

  const hues = {
    brand: brandHue,
    neutral: (brandHue + neutralOffset + 360) % 360,
    ...semantic,
    chart: Array.from({ length: 6 }, (_, i) => (brandHue + chartPhase + i * GOLDEN_ANGLE) % 360),
  };
  return { hues, brandChroma, brandLightness, neutralOffset, chartPhase };
}

/* ------------------------------------------------------------------ *
 * Constraint solver
 *
 * Exhaustive, bounded, deterministic search over OKLCH lightness at fixed
 * hue and chroma. Every candidate is quantised to 8-bit sRGB BEFORE its
 * constraints are evaluated, so a published token can never pass on paper
 * and fail on screen - the root cause of the wrong ratios in v0.2.
 * ------------------------------------------------------------------ */

const L_GRID_STEP = 0.002;

// maxChromaAt memoises internally; the separate cache this once had is gone.
const cachedMaxChroma = (L, H) => maxChromaAt(L, H, 0.4, 24);

/** OKLCH -> quantised sRGB hex, with chroma reduced into gamut. */
export function quantize(L, C, H) {
  return oklchToHex({ L, C, H });
}

/**
 * @param {object}   opts
 * @param {number}   opts.hue          authoring hue in degrees
 * @param {number}   opts.chroma       desired chroma (reduced to gamut if needed)
 * @param {function} opts.feasible     (hex) => boolean, hard constraints
 * @param {function} opts.score        (hex) => number, minimised over feasible set
 * @param {number[]} [opts.lRange]     inclusive search bounds for L
 * @returns {{hex:string, L:number, C:number, feasible:boolean}|null}
 */
export function optimizeColor({ hue, chroma, feasible, score, lRange = [0, 1] }) {
  let best = null;
  let bestScore = Infinity;
  const steps = Math.round((lRange[1] - lRange[0]) / L_GRID_STEP);
  for (let i = 0; i <= steps; i += 1) {
    const L = lRange[0] + i * L_GRID_STEP;
    if (L <= 0 || L >= 1) continue; // pure black/white carry no hue; handled separately
    const C = Math.min(chroma, cachedMaxChroma(L, hue));
    const hex = quantize(L, C, hue);
    if (!feasible(hex)) continue;
    const s = score(hex);
    if (s < bestScore) {
      bestScore = s;
      best = { hex, L, C };
    }
  }
  return best;
}

/**
 * Solve a colour reaching at least `tau` against every background in `against`.
 *
 * When no candidate in the search range satisfies the constraints the solver
 * does NOT silently relax them: it returns the best effort together with
 * `infeasible: true` and the section 5.2 bounds, so the auditor can report a
 * formal infeasibility instead of a false pass.
 */
function solveAgainst({ hue, chroma, against, tau, designCr, lRange, achromatic = false, chromaBand = null }) {
  const feasible = (hex) => against.every((bg) => contrastRatio(hex, bg) >= tau);
  const worstCr = (hex) => Math.min(...against.map((bg) => contrastRatio(hex, bg)));
  const score = (hex) => Math.abs(Math.log(worstCr(hex) / designCr));

  const candidates = [];
  if (achromatic) {
    // hue is irrelevant; search pure greys by luminance only
    for (let i = 0; i <= 1000; i += 1) {
      const v = i / 1000;
      const hex = rgbToHex({ r: v, g: v, b: v });
      candidates.push({ hex, L: hexToOklch(hex).L, C: 0 });
    }
  } else {
    const steps = Math.round((lRange[1] - lRange[0]) / L_GRID_STEP);
    for (let i = 0; i <= steps; i += 1) {
      const L = lRange[0] + i * L_GRID_STEP;
      if (L <= 0 || L >= 1) continue;
      const C = Math.min(chroma, cachedMaxChroma(L, hue));
      candidates.push({ hex: quantize(L, C, hue), L, C });
    }
  }

  const ok = select(candidates, (c) => feasible(c.hex), (c) => score(c.hex));
  if (ok) {
    // Second pass: the design contrast is the primary objective, but among
    // candidates within a small tolerance of it, prefer the most chromatic
    // one. This is the lexicographic form of the section 10.1 objective and
    // keeps accents inside the LUM-IDE-004 band instead of collapsing them
    // towards grey at the exact target contrast.
    const CHROMA_TOLERANCE = 0.12;
    // The aesthetic second pass must respect the chroma band of the token kind
    // (section 10.1), otherwise maximising chroma overshoots the neutral ceiling
    // or undershoots the accent floor.
    const inBand = (hex) => {
      if (!chromaBand) return true;
      const C = hexToOklch(hex).C;
      if (chromaBand.min != null && C < chromaBand.min) return false;
      if (chromaBand.max != null && C > chromaBand.max) return false;
      return true;
    };
    let shortlist = candidates.filter((c) => feasible(c.hex) && inBand(c.hex) && score(c.hex) <= score(ok.hex) + CHROMA_TOLERANCE);
    if (shortlist.length === 0) shortlist = [ok];
    // Rank on chroma first, then on contrast fidelity, so that equal-chroma
    // candidates are still ordered by how close they land on the design target
    // instead of by search order (which would always return the darkest).
    // Rank on the chroma of the PUBLISHED 8-bit value, not on the requested
    // chroma: quantisation can collapse a dark tint to pure grey, and ranking
    // on the requested value would then keep that collapsed colour.
    const publishedChroma = (hex) => hexToOklch(hex).C;
    const rank = (c) => -publishedChroma(c.hex) * 1000 + score(c.hex);
    const best = select(shortlist, () => true, rank);
    return { ...(best ?? ok), infeasible: false };
  }

  // best effort: maximise the worst contrast achieved, keep it flagged
  const best = candidates.reduce((acc, c) => (worstCr(c.hex) > worstCr(acc.hex) ? c : acc), candidates[0]);
  return {
    ...best,
    infeasible: true,
    infeasibility: against.map((bg) => luminanceBounds(relativeLuminance(bg), tau)),
  };
}

/* ------------------------------------------------------------------ *
 * Primitive ramps (section 4.4) - published, monotonic by construction
 * ------------------------------------------------------------------ */

/** `generateNeutralRamp` (invoked but never defined in v0.2). */
export function generateNeutralRamp({ hue, chromaMax, steps = PRIMITIVE_STEPS }) {
  return steps.map(({ step, L }) => ({
    step,
    L,
    C: L <= 0 || L >= 1 ? 0 : Math.min(chromaMax, cachedMaxChroma(L, hue)),
    H: hue,
    value: L >= 1 ? '#FFFFFF' : L <= 0 ? '#000000' : quantize(L, Math.min(chromaMax, cachedMaxChroma(L, hue)), hue),
  }));
}

/** `generateSemanticRamps` (invoked but never defined in v0.2). */
export function generateSemanticRamps(hues, chromaOverride = {}) {
  const ramps = {};
  for (const family of PRIMITIVE_FAMILIES) {
    const hue = family === 'neutral' ? hues.neutral : hues[family] ?? hues.brand;
    const chroma = chromaOverride[family] ?? PRIMITIVE_CHROMA[family];
    ramps[family] = generateNeutralRamp({ hue, chromaMax: chroma });
  }
  return ramps;
}

/** `generateDarkSurface` (invoked but never defined in v0.2). */
export function generateDarkSurface({ hue, chroma, luminanceRange = [0.005, 0.025], targetY }) {
  const y = clamp(targetY, luminanceRange[0], luminanceRange[1]);
  const L = lightnessForLuminance(y, hue, Math.min(chroma, 0.05));
  return quantize(L, Math.min(chroma, cachedMaxChroma(L, hue)), hue);
}

/* ------------------------------------------------------------------ *
 * Theme assembly
 * ------------------------------------------------------------------ */

const TAU = (profile, klass) => profile.contrast[klass] ?? profile.contrast['non-text'];

/**
 * Safety factor applied while solving, so that the published 8-bit value keeps
 * slack above the threshold (section 5.2 rationale). Escalating it is the only
 * knob `adjustOrReject` needs, which keeps the repair loop auditable: one
 * number, recorded in the report, instead of twenty hand-tuned design targets.
 */
const withMargin = (tau, margin) => tau * (1 + margin);

function backgroundOf(theme, role) {
  return theme.values[role];
}

/** Worst-case (lowest contrast) background for a foreground of given polarity. */
function bindingBackgrounds(values, roles, polarity) {
  const list = roles.map((rl) => values[rl]).filter(Boolean);
  if (list.length === 0) return [];
  if (polarity === 'dark-fg') {
    // dark foreground: the darker the background, the lower the contrast
    const minY = Math.min(...list.map(relativeLuminance));
    return list.filter((v) => Math.abs(relativeLuminance(v) - minY) < 1e-9);
  }
  const maxY = Math.max(...list.map(relativeLuminance));
  return list.filter((v) => Math.abs(relativeLuminance(v) - maxY) < 1e-9);
}

/**
 * `validateColorVision` (invoked but never defined in v0.2), used here as a
 * *generator* constraint rather than only as an audit.
 *
 * Greedy selection over a 10-degree hue grid: the first series anchors on the
 * brand hue and separates from the chart background; each later series is the
 * candidate that maximises the worst-case CIEDE2000 against every series
 * already chosen, simulated under protanopia, deuteranopia and tritanopia
 * (Machado, Oliveira & Fernandes, 2009, severity 1.0). Deterministic: the grid
 * is walked in a fixed order from the brand hue, and ties keep the first
 * candidate.
 */
export function solveChartSeries({ backgrounds, targets, brandHue, phase, chroma, tau, profile, band = null, count = 6 }) {
  const STEP = 10;
  const grid = Array.from({ length: Math.round(360 / STEP) }, (_, i) => (brandHue + phase + i * STEP) % 360);
  // Each hue is offered at every target lightness band and at a reduced chroma.
  // Under dichromacy two colours can still be separable when their CHROMA or
  // LIGHTNESS differ even if their hue collapses, so a single fixed
  // (hue, lightness) per hue starves the search; v0.2 had exactly that.
  const chromaVariants = [chroma, chroma * 0.62].filter((c) => c >= (band?.min ?? 0));

  const pool = [];
  for (const hue of grid) {
    for (let t = 0; t < targets.length; t += 1) {
      for (const c of chromaVariants) {
        const solved = solveAgainst({
          hue, chroma: c, against: backgrounds, tau,
          designCr: targets[t],
          lRange: [0.05, 0.95],
          chromaBand: band,
        });
        if (solved && !solved.infeasible) {
          pool.push({ hue, hex: solved.hex, L: solved.L, C: solved.C, designCr: targets[t] });
        }
      }
    }
  }
  if (pool.length < count) throw new Error(`infeasible chart series: only ${pool.length} of ${count} reachable`);

  const separation = (hex, picked) => {
    let worst = Infinity;
    for (const p of picked) {
      for (const type of CVD_TYPES) {
        worst = Math.min(worst, deltaE2000(simulateCvd(hex, type), simulateCvd(p.hex, type)));
      }
      // plain separation from what is already on screen counts too
      worst = Math.min(worst, deltaE2000(hex, p.hex));
    }
    return worst;
  };

  const picked = [];
  for (let n = 0; n < count; n += 1) {
    let best = null;
    for (const cand of pool) {
      if (picked.some((p) => p.hex === cand.hex)) continue;
      // The first series anchors on the brand hue for identity; later ones
      // maximise separation from everything already picked.
      const score = picked.length === 0 ? deltaE2000(cand.hex, backgrounds[0]) : separation(cand.hex, picked);
      const rank = -score * 1000 + hueDistance(cand.hue, brandHue) / 360;
      if (!best || rank < best.rank) best = { cand, score, rank };
    }
    if (!best) throw new Error(`infeasible chart series ${n + 1}`);
    picked.push({ ...best.cand, worstCvdDeltaE: present(best.score, 2) });
  }
  return picked;
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** `assignLightTheme` / `assignDarkTheme` (invoked but never defined in v0.2). */
function assignTheme(themeName, ctx) {
  const { hues, design, profile, margin } = ctx;
  const M = (tau) => withMargin(tau, margin);
  // Chroma band for the token kind being solved, so the aesthetic second pass
  // cannot push a neutral past its ceiling or an accent below its floor.
  const bandFor = (kind) => ({
    neutral: { min: null, max: profile.chroma.neutralMax },
    surface: { min: null, max: profile.chroma.surfaceMax },
    'accent-soft': { min: null, max: profile.chroma.softMax },
    accent: { min: profile.chroma.accentMin, max: profile.chroma.accentMax },
  }[kind] ?? null);
  const polarity = design.polarity;
  const fgPolarity = polarity === 'light' ? 'dark-fg' : 'light-fg';
  const values = {};
  const provenance = {};
  const nh = hues.neutral;
  const nc = design.neutralChroma;
  const sc = design.surfaceChroma;
  const ac = design.accentChroma;
  const soft = design.softChroma;

  const record = (role, hex, info) => {
    values[role] = hex;
    provenance[role] = { value: hex, ...info };
  };

  /* ---- 1. backgrounds ------------------------------------------- */
  for (const key of ['subtle', 'default', 'surface', 'raised', 'disabled', 'inverse']) {
    const d = design.backgrounds[key];
    const C = key === 'inverse' ? nc : sc;
    const hex = d.L >= 1 ? '#FFFFFF' : d.L <= 0 ? '#000000' : quantize(d.L, Math.min(C, cachedMaxChroma(d.L, nh)), nh);
    record(`background.${key}`, hex, { layer: 'semantic', kind: key === 'inverse' ? 'neutral' : 'surface', L: d.L, C: hexToOklch(hex).C, H: nh, solvedBy: 'lightness-target' });
  }

  /* ---- 2. neutral text ------------------------------------------ */
  const textBackgrounds = ['background.default', 'background.surface', 'background.subtle', 'background.raised'];
  for (const key of ['primary', 'secondary', 'disabled']) {
    const d = design.text[key];
    const against = bindingBackgrounds(values, textBackgrounds, fgPolarity);
    const solved = solveAgainst({
      hue: nh,
      chroma: nc,
      against,
      tau: M(key === 'disabled' ? TAU(profile, 'advisory-text') : TAU(profile, 'text')),
      designCr: d.cr,
      lRange: [0.02, 0.98],
      achromatic: nc === 0,
      chromaBand: bandFor('neutral'),
  });
    record(`text.${key}`, solved.hex, { layer: 'semantic', kind: 'neutral', L: solved.L, C: solved.C, H: nh, solvedBy: 'contrast', bindingBackground: against[0], designCr: d.cr });
  }

  // text.on-surface is bound to the raised/surface pair only
  {
    const d = design.text['on-surface'];
    const against = bindingBackgrounds(values, ['background.surface', 'background.raised'], fgPolarity);
    const solved = solveAgainst({ hue: nh, chroma: nc, against, tau: M(TAU(profile, 'text')), designCr: d.cr, lRange: [0.02, 0.98], achromatic: nc === 0 });
    record('text.on-surface', solved.hex, { layer: 'semantic', kind: 'neutral', L: solved.L, C: solved.C, H: nh, solvedBy: 'contrast', bindingBackground: against[0], designCr: d.cr });
  }

  // text.inverse sits on background.inverse, i.e. opposite polarity
  {
    const d = design.text.inverse;
    const invPolarity = polarity === 'light' ? 'light-fg' : 'dark-fg';
    const against = bindingBackgrounds(values, ['background.inverse'], invPolarity);
    const solved = solveAgainst({ hue: nh, chroma: nc, against, tau: M(TAU(profile, 'text')), designCr: d.cr, lRange: [0.02, 0.98], achromatic: nc === 0 });
    record('text.inverse', solved.hex, { layer: 'semantic', kind: 'neutral', L: solved.L, C: solved.C, H: nh, solvedBy: 'contrast', bindingBackground: against[0], designCr: d.cr });
  }

  /* ---- 2b. secondary and ghost fills ------------------------------ *
   * Solved before `text.link` because they are pure lightness targets with no
   * dependency, and because `text.link` is the label of both controls: it must
   * reach the text threshold against their darkest state, not only against the
   * page backgrounds. v0.2 omitted this, which is how a link ended up at 7.25:1
   * on a pressed secondary button.                                   */
  for (const kind of ['secondary', 'ghost']) {
    const d = design.interactive[kind];
    const base = quantize(d.L, Math.min(sc, cachedMaxChroma(d.L, nh)), nh);
    record(`interactive.${kind}.default`, base, { layer: 'semantic', kind: 'surface', state: 'default', L: d.L, C: hexToOklch(base).C, H: nh, solvedBy: 'lightness-target' });
    for (const [state, dL] of [['hover', d.hoverDL], ['active', d.activeDL]]) {
      if (dL === undefined) continue;
      const L = clamp(d.L + dL, 0.02, 0.98);
      const hex = quantize(L, Math.min(sc, cachedMaxChroma(L, nh)), nh);
      record(`interactive.${kind}.${state}`, hex, { layer: 'semantic', kind: 'surface', state, L, C: hexToOklch(hex).C, H: nh, solvedBy: 'lightness-offset', deltaL: dL });
    }
  }

  /* ---- 3. focus ring (outer) ------------------------------------- *
   * Solved before the accent so that section 8 can guarantee the ring
   * contrasts with the page, and after it so that `focus.inner` can be
   * solved against the real fills.                                    */
  {
    const d = design.focus;
    const against = bindingBackgrounds(values, ['background.default', 'background.surface'], fgPolarity);
    const solved = solveAgainst({ hue: nh, chroma: nc, against, tau: M(TAU(profile, 'focus')), designCr: d.ringCr, lRange: [0.02, 0.98], achromatic: nc === 0 , chromaBand: bandFor('neutral') });
    record('focus.ring', solved.hex, { layer: 'semantic', kind: 'neutral', state: 'focus', L: solved.L, C: solved.C, H: nh, solvedBy: 'contrast', bindingBackground: against[0], designCr: d.ringCr });
  }

  /* ---- 4. accent text (links) ------------------------------------ */
  {
    const d = design.text.link;
    const bgBinding = bindingBackgrounds(values, textBackgrounds, fgPolarity);
    const fillBinding = bindingBackgrounds(
      values,
      ['interactive.secondary.active', 'interactive.secondary.hover', 'interactive.ghost.hover'],
      fgPolarity
    );
    const against = [...bgBinding, ...fillBinding];
    const solved = solveAgainst({ hue: hues.brand, chroma: ac, against, tau: M(TAU(profile, 'text')), designCr: d.cr, lRange: [0.05, 0.95] , chromaBand: bandFor('neutral') });
    record('text.link', solved.hex, { layer: 'semantic', kind: 'accent', L: solved.L, C: solved.C, H: hues.brand, solvedBy: 'contrast', bindingBackground: against[0], designCr: d.cr, alsoBoundBy: fillBinding });
  }

  /* ---- 5. on-primary label --------------------------------------- */
  {
    const d = design.text['on-primary'];
    // In a light theme the accent fill is dark, so the label is the lightest
    // neutral; in a dark theme the fill is light, so the label is the darkest.
    const anchorL = polarity === 'light' ? 1.0 : 0.17;
    const anchorHex = anchorL >= 1 ? '#FFFFFF' : quantize(anchorL, Math.min(nc, cachedMaxChroma(anchorL, nh)), nh);
    record('text.on-primary', anchorHex, { layer: 'semantic', kind: 'neutral', L: hexToOklch(anchorHex).L, C: hexToOklch(anchorHex).C, H: nh, solvedBy: 'polarity-anchor', designCr: d.cr });
  }

  /* ---- 6. primary accent scale ----------------------------------- */
  const primary = solvePrimary({
    hue: hues.brand,
    chroma: ac,
    label: values['text.on-primary'],
    design: design.interactive.primary,
    profile,
    polarity,
    surface: values['background.surface'],
    ring: values['focus.ring'],
    margin,
  });
  for (const state of ['default', 'hover', 'active', 'focus']) {
    record(`interactive.primary.${state}`, primary[state].hex, { layer: 'semantic', kind: 'accent', state, ...primary[state], H: hues.brand, solvedBy: 'scale-constraint' });
  }

  /* ---- 7. focus inner ring --------------------------------------- *
   * Opposite polarity to `focus.ring`, and required to contrast with every
   * primary fill. This is the second half of the double ring mandated by
   * section 8; v0.2 declared the token but never gave it a value.     */
  {
    const d = design.focus;
    // Adjacency of the inner ring: the fill it wraps (inward) and the outer
    // ring (outward). Unfilled components draw no inner ring; their focus
    // indicator is border.focus. Requiring contrast against the page as well
    // is mathematically infeasible in a dark theme and is not what SC 1.4.11
    // or SC 2.4.13 ask for.
    const fills = ['default', 'hover', 'active', 'focus'].map((st) => values[`interactive.primary.${st}`]);
    const against = [...fills, values['focus.ring']];
    const innerPolarity = polarity === 'light' ? 'light-fg' : 'dark-fg';
    const solved = solveAgainst({ hue: nh, chroma: nc, against, tau: M(TAU(profile, 'focus')), designCr: d.innerCr, lRange: [0.02, 0.98], achromatic: nc === 0 , chromaBand: bandFor('accent') });
    record('focus.inner', solved.hex, { layer: 'semantic', kind: 'neutral', state: 'focus', L: solved.L, C: solved.C, H: nh, solvedBy: 'contrast', designCr: d.innerCr, note: 'inner half of the section 8 double ring' });
  }

  /* ---- 9. selection ---------------------------------------------- */
  {
    const d = design.interactive.selected;
    const tau = M(TAU(profile, 'text'));
    const solved = optimizeColor({
      hue: hues.brand,
      chroma: soft,
      feasible: (hex) => contrastRatio(values['text.primary'], hex) >= tau
        && contrastRatio(values['text.link'], hex) >= M(TAU(profile, 'text')) * 0.85,
      score: (hex) => -deltaE2000(hex, values['background.surface']),
      lRange: polarity === 'light' ? [0.80, 0.985] : [0.10, 0.42],
    });
    record('interactive.selected', solved.hex, { layer: 'semantic', kind: 'accent-soft', L: solved.L, C: solved.C, H: hues.brand, solvedBy: 'max-distinctness-under-contrast', designDeltaE: deltaE2000(solved.hex, values['background.surface']) });
    void d;
  }

  /* ---- 10. disabled control fill --------------------------------- */
  {
    const d = design.interactive.disabled;
    const solved = solveAgainst({
      hue: nh,
      chroma: sc,
      against: [values['text.disabled']],
      tau: M(TAU(profile, 'advisory-text')),
      designCr: d.cr,
      lRange: polarity === 'light' ? [0.80, 0.98] : [0.10, 0.40],
      achromatic: nc === 0,
      chromaBand: bandFor('neutral'),
  });
    record('interactive.disabled', solved.hex, { layer: 'semantic', kind: 'neutral', state: 'disabled', L: solved.L, C: solved.C, H: nh, solvedBy: 'contrast', designCr: d.cr });
  }

  /* ---- 11. feedback families ------------------------------------- */
  for (const family of ['success', 'warning', 'error', 'info']) {
    const hue = hues[family];
    const fd = design.feedback;
    // background: a soft tint, kept distinguishable from the surface
    const surface = values['background.surface'];
    // The tint is a fixed perceptual step DEEPER than the surface, at maximum
    // feasible chroma. Two reasons, both measured:
    //   1. A CR-ratio target collapses the tint towards black in dark themes
    //      (with a near-black surface, everything deeper quantises to the same
    //      8-bit value), which erased the difference between the success and
    //      error tints.
    //   2. Anchoring on lightness instead keeps the family hue visible, which
    //      is what makes the four feedback states separable under dichromacy.
    // Discernibility is MEASURED by the auditor (LUM-IDE-001), not assumed.
    const surfaceL = hexToOklch(surface).L;
    const tintL = clamp(surfaceL + fd.tintDeltaL, 0.04, 0.985);
    const tintC = Math.min(soft, cachedMaxChroma(tintL, hue));
    const bgHex = quantize(tintL, tintC, hue);
    record(`feedback.${family}.background`, bgHex, { layer: 'semantic', kind: 'accent-soft', L: tintL, C: hexToOklch(bgHex).C, H: hue, solvedBy: 'lightness-offset', tintDeltaL: fd.tintDeltaL, tintDirection: 'deeper-than-surface' });

    const text = solveAgainst({ hue, chroma: ac, against: [bgHex], tau: M(TAU(profile, 'text')), designCr: fd.textCr, lRange: [0.05, 0.95] , chromaBand: bandFor('neutral') });
    record(`feedback.${family}.text`, text.hex, { layer: 'semantic', kind: 'accent', L: text.L, C: text.C, H: hue, solvedBy: 'contrast', designCr: fd.textCr });

    for (const part of ['border', 'icon']) {
      const solved = solveAgainst({ hue, chroma: ac, against: [bgHex], tau: M(TAU(profile, 'non-text')), designCr: fd[`${part}Cr`], lRange: [0.05, 0.95] , chromaBand: bandFor('accent') });
      record(`feedback.${family}.${part}`, solved.hex, { layer: 'semantic', kind: 'accent', L: solved.L, C: solved.C, H: hue, solvedBy: 'contrast', designCr: fd[`${part}Cr`] });
    }
  }

  /* ---- 12. borders ------------------------------------------------ */
  const borderBackgrounds = ['background.default', 'background.surface', 'background.subtle', 'background.raised'];
  {
    const d = design.border;
    const against = bindingBackgrounds(values, borderBackgrounds, fgPolarity);
    for (const key of ['default', 'strong', 'subtle']) {
      const solved = solveAgainst({ hue: nh, chroma: nc, against, tau: M(key === 'subtle' ? 1.0 : TAU(profile, 'non-text')), designCr: d[`${key}Cr`], lRange: [0.05, 0.95], achromatic: nc === 0 , chromaBand: bandFor('accent') });
      record(`border.${key}`, solved.hex, { layer: 'semantic', kind: 'neutral', L: solved.L, C: solved.C, H: nh, solvedBy: 'contrast', designCr: d[`${key}Cr`] });
    }
    const focusBorder = solveAgainst({ hue: hues.brand, chroma: ac, against: bindingBackgrounds(values, borderBackgrounds, fgPolarity), tau: M(TAU(profile, 'focus')), designCr: d.focusCr, lRange: [0.05, 0.95] , chromaBand: bandFor('neutral') });
    record('border.focus', focusBorder.hex, { layer: 'semantic', kind: 'accent', state: 'focus', L: focusBorder.L, C: focusBorder.C, H: hues.brand, solvedBy: 'contrast', designCr: d.focusCr, note: 'adjacency against the surface is the requirement; the focused/unfocused border swap is advisory because the ring provides the SC 2.4.13 area' });

    const errorBorder = solveAgainst({ hue: hues.error, chroma: ac, against: bindingBackgrounds(values, borderBackgrounds, fgPolarity), tau: M(TAU(profile, 'non-text')), designCr: d.errorCr, lRange: [0.05, 0.95] , chromaBand: bandFor('accent') });
    record('border.error', errorBorder.hex, { layer: 'semantic', kind: 'accent', state: 'error', L: errorBorder.L, C: errorBorder.C, H: hues.error, solvedBy: 'contrast', designCr: d.errorCr });
  }

  /* ---- 13. data visualisation ------------------------------------- */
  {
    const cd = design.chart;
    const cbg = cd.backgroundL >= 1 ? '#FFFFFF' : cd.backgroundL <= 0 ? '#000000' : quantize(cd.backgroundL, Math.min(sc, cachedMaxChroma(cd.backgroundL, nh)), nh);
    record('chart.background', cbg, { layer: 'semantic', kind: 'surface', L: cd.backgroundL, C: hexToOklch(cbg).C, H: nh, solvedBy: 'lightness-target' });
    const csurf = cd.surfaceL >= 1 ? '#FFFFFF' : cd.surfaceL <= 0 ? '#000000' : quantize(cd.surfaceL, Math.min(sc, cachedMaxChroma(cd.surfaceL, nh)), nh);
    record('chart.surface', csurf, { layer: 'semantic', kind: 'surface', L: cd.surfaceL, C: hexToOklch(csurf).C, H: nh, solvedBy: 'lightness-target' });

    const label = solveAgainst({ hue: nh, chroma: nc, against: [cbg, csurf], tau: M(TAU(profile, 'text')), designCr: cd.labelCr, lRange: [0.02, 0.98], achromatic: nc === 0 , chromaBand: bandFor('accent') });
    record('chart.label', label.hex, { layer: 'semantic', kind: 'neutral', L: label.L, C: label.C, H: nh, solvedBy: 'contrast', designCr: cd.labelCr });

    const axis = solveAgainst({ hue: nh, chroma: nc, against: [cbg], tau: M(TAU(profile, 'non-text')), designCr: cd.axisCr, lRange: [0.05, 0.95], achromatic: nc === 0 , chromaBand: bandFor('neutral') });
    record('chart.axis', axis.hex, { layer: 'semantic', kind: 'neutral', L: axis.L, C: axis.C, H: nh, solvedBy: 'contrast', designCr: cd.axisCr });

    const grid = solveAgainst({ hue: nh, chroma: nc, against: [cbg], tau: 1.0, designCr: cd.gridCr, lRange: [0.05, 0.98], achromatic: nc === 0 , chromaBand: bandFor('neutral') });
    record('chart.grid', grid.hex, { layer: 'semantic', kind: 'neutral', L: grid.L, C: grid.C, H: nh, solvedBy: 'contrast', designCr: cd.gridCr });

    // `validateColorVision` integrated into generation: series hues are not a
    // fixed golden-angle spread (the v0.2 approach, which produced red/green
    // pairs that collapse under deuteranopia) but are selected greedily to
    // maximise the worst-case CIEDE2000 under dichromacy against the series
    // already chosen, while each still reaches its contrast target. Alternating
    // contrast targets keep adjacent series apart in lightness as well.
    const series = solveChartSeries({
      backgrounds: [cbg, csurf],
      targets: cd.seriesCr,
      brandHue: hues.brand,
      phase: hues.chart[0],
      chroma: ac,
      tau: M(TAU(profile, 'non-text')),
      profile,
      band: bandFor('accent'),
    });
    series.forEach((entry, i) => {
      record(`chart.series.${i + 1}`, entry.hex, {
        layer: 'semantic', kind: 'accent', L: entry.L, C: entry.C, H: entry.H,
        solvedBy: 'greedy-cvd-separation', designCr: entry.designCr,
        hueOrigin: 'greedy-10deg-grid', worstCvdDeltaE: entry.worstCvdDeltaE,
      });
    });
  }

  /* ---- 14. overlay (composed, section 7.6) ------------------------ */
  {
    // The veil is derived from the neutral family, not hardcoded: a fixed
    // slate veil silently became a 60-degree hue outlier against teal brands
    // (the one warning the robustness sweep kept reporting).
    const o = design.backgrounds.overlay;
    const bg = values['background.default'];
    const bgL = hexToOklch(bg).L;
    let best = null;
    for (let L = 0; L <= bgL + 1e-9; L += 0.002) {
      const veil = oklchToHex({ L, C: nc, H: nh });
      const composedL = hexToOklch(rgbToHex(compositeAlpha(veil, o.alpha, bg))).L;
      const err = Math.abs(composedL - o.targetL);
      if (!best || err < best.err) best = { err, veil };
    }
    const composited = rgbToHex(compositeAlpha(best.veil, o.alpha, bg));
    record('background.overlay', composited, { layer: 'semantic', kind: 'neutral', composed: true, veil: best.veil, alpha: o.alpha, base: bg, solvedBy: 'alpha-composition', note: 'published as the composited solid, as section 7.6 requires' });
  }

  return { name: themeName, label: design.label, polarity, values, provenance };
}

/** `solvePrimary` (invoked but never defined in v0.2). */
export function solvePrimary({ hue, chroma, label, design, profile, polarity, surface, ring, margin }) {
  const tauText = withMargin(TAU(profile, 'text'), margin);
  const tauNonText = withMargin(TAU(profile, 'non-text'), margin);
  // The focus fill is an alias of the default fill: SC 2.4.13 measures the
  // focus indicator (here the section 8 double ring), not the component fill.
  const offsets = { default: 0, hover: design.hoverDL, active: design.activeDL, focus: 0 };
  const dE = profile.stateChange.deltaE2000;
  const dhMax = profile.stateChange.hueDriftMax;

  let best = null;
  let bestScore = Infinity;
  const steps = Math.round(0.96 / L_GRID_STEP);
  for (let i = 0; i <= steps; i += 1) {
    const L0 = 0.02 + i * L_GRID_STEP;
    const candidate = {};
    let ok = true;
    for (const state of ['default', 'hover', 'active', 'focus']) {
      const L = clamp(L0 + offsets[state], 0.02, 0.98);
      const C = Math.min(chroma, cachedMaxChroma(L, hue));
      candidate[state] = { hex: quantize(L, C, hue), L, C };
    }
    // label contrast on every fill
    for (const state of ['default', 'hover', 'active', 'focus']) {
      if (contrastRatio(label, candidate[state].hex) < tauText) { ok = false; break; }
    }
    if (!ok) continue;
    // filled button boundary against the surface (SC 1.4.11)
    if (contrastRatio(candidate.default.hex, surface) < tauNonText) continue;
    // state discriminability: hover and active must each be tellable apart
    // from the default and from each other
    for (const [a, b] of [['hover', 'default'], ['active', 'default'], ['active', 'hover']]) {
      const x = candidate[a].hex;
      const y = candidate[b].hex;
      if (x === y) { ok = false; break; }
      const dH = hueDifference(x, y);
      if (dH !== null && dH > dhMax) { ok = false; break; }
      if (deltaE2000(x, y) < dE) { ok = false; break; }
    }
    if (!ok) continue;
    // the outer focus ring must not be swallowed by any fill it touches
    if (contrastRatio(ring, candidate.default.hex) < 1.0) continue;
    if (contrastRatio(ring, candidate.hover.hex) < 1.0) continue;
    if (contrastRatio(ring, candidate.active.hex) < 1.0) continue;

    const score = Math.abs(Math.log(contrastRatio(label, candidate.default.hex) / design.cr));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best) {
    throw Object.assign(new Error('infeasible primary scale'), {
      code: 'LUMINA_INFEASIBLE',
      detail: {
        hue, chroma, label, design, polarity, tauText,
        bounds: luminanceBounds(relativeLuminance(surface), TAU(profile, 'text')),
        hint: 'the brand colour cannot carry a label at the profile threshold; pick a lighter or darker brand colour, or lower the profile',
      },
    });
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Palette assembly
 * ------------------------------------------------------------------ */

/** `assembleTokens` (invoked but never defined in v0.2). */
export function assembleTokens({ theme, profileId, identity, version }) {
  return TOKEN_ROLES.map((def) => {
    const value = theme.values[def.role];
    if (value === undefined) throw new Error(`token not generated: ${def.role} (${theme.name})`);
    const prov = theme.provenance[def.role] ?? {};
    const oklch = hexToOklch(value);
    return {
      id: tokenId(theme.name, def.layer, def.role),
      role: def.role,
      value,
      colorSpace: 'sRGB',
      oklch: { l: round(oklch.L, 4), c: round(oklch.C, 4), h: round(oklch.H, 2) },
      relativeLuminance: round(relativeLuminance(value), 6),
      theme: theme.name,
      layer: def.layer,
      group: def.group,
      kind: def.kind,
      state: def.state,
      identity,
      profile: profileId,
      version,
      derived: {
        solvedBy: prov.solvedBy ?? null,
        hue: prov.H !== undefined ? round(prov.H, 2) : null,
        targetL: prov.L !== undefined ? round(prov.L, 4) : null,
        achievedC: prov.C !== undefined ? round(prov.C, 4) : null,
        designCr: prov.designCr ?? null,
        bindingBackground: prov.bindingBackground ?? null,
        composed: prov.composed ?? false,
        veil: prov.veil ?? null,
        alpha: prov.alpha ?? null,
        note: prov.note ?? null,
      },
      contrastTargets: [],
      exceptions: [],
    };
  });
}

const round = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? null : Number(v.toFixed(d)));

/**
 * Canonical token identifier (section 4.1).
 *
 *   token_id  ::= "lumina" "." theme "." layer "." role_path
 *   role_path ::= segment *( "." segment )        ; 2..5 segments
 *
 * v0.2 declared a 7-segment grammar in one place and a 6-segment grammar in
 * another, and its own examples matched neither. A single variable-length
 * role_path removes the contradiction; the state, when applicable, is the
 * trailing segment of role_path and is mirrored in the `state` field.
 */
export function tokenId(theme, layer, role) {
  return `${SYSTEM}.${theme}.${layer}.${role}`;
}

export function parseTokenId(id) {
  const parts = id.split('.');
  if (parts.length < 5 || parts[0] !== SYSTEM) throw new Error(`malformed token id: ${id}`);
  const [, theme, layer, ...segments] = parts;
  if (segments.length < 2 || segments.length > 5) throw new Error(`role_path must have 2..5 segments: ${id}`);
  if (!THEMES.includes(theme)) throw new Error(`unknown theme in token id: ${id}`);
  if (!['primitive', 'semantic', 'component'].includes(layer)) throw new Error(`unknown layer in token id: ${id}`);
  return {
    theme,
    layer,
    rolePath: segments.join('.'),
    segments,
    segmentCount: segments.length,
    state: segments[segments.length - 1],
  };
}

/* ------------------------------------------------------------------ *
 * Top level
 * ------------------------------------------------------------------ */

export const DEFAULT_AESTHETIC = {
  neutralChromaMax: 0.02,
  surfaceChromaMax: 0.04,
  accentChromaMin: 0.06,
  accentChromaMax: 0.25,
  hueDriftMax: 5,
  lightnessStepMin: 0.04,
  lightnessStepMax: 0.15,
};

export function generatePalette({
  brand = '#1E40AF',
  family = 'sapphire',
  profile: profileId = 'integral',
  seed = 20260908,
  aesthetic = DEFAULT_AESTHETIC,
  themes = THEMES,
  solveMargin = SOLVE_MARGIN,
} = {}) {
  const profile = PROFILES[profileId];
  if (!profile) throw new Error(`unknown profile: ${profileId}`);
  if (!(solveMargin >= 0 && solveMargin < 1)) throw new RangeError(`solveMargin out of range: ${solveMargin}`);
  const { hues, brandChroma, brandLightness, neutralOffset, chartPhase } = deriveHues(brand, seed);

  const primitives = generateSemanticRamps(hues, {
    neutral: aesthetic.neutralChromaMax * 0.7,
    brand: clamp(brandChroma || aesthetic.accentChromaMax * 0.7, aesthetic.accentChromaMin, aesthetic.accentChromaMax),
    success: 0.13,
    warning: 0.14,
    error: 0.15,
    info: clamp(brandChroma || 0.15, aesthetic.accentChromaMin, aesthetic.accentChromaMax),
  });

  const generatedThemes = {};
  for (const name of themes) {
    const design = THEME_DESIGN[name];
    if (!design) throw new Error(`unknown theme: ${name}`);
    generatedThemes[name] = assignTheme(name, { hues, design, profile, aesthetic, margin: solveMargin });
  }

  const ctx = {
    system: SYSTEM,
    identity: { name: `LUMINA ${capitalize(family)}`, family, brand, brandOklch: hexToOklch(brand) },
    specVersion: SPEC_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    wcagVersion: WCAG_VERSION_REF,
    profile: profileId,
    seed,
    aesthetic,
    hues,
    generator: { neutralOffset: round(neutralOffset, 4), chartPhase: round(chartPhase, 4), brandChroma: round(brandChroma, 4), brandLightness: round(brandLightness, 4), lGridStep: L_GRID_STEP, solveMargin },
  };

  const tokens = {};
  for (const name of themes) {
    tokens[name] = assembleTokens({ theme: generatedThemes[name], profileId, identity: ctx.identity.name, version: SPEC_VERSION });
  }

  return {
    meta: ctx,
    primitives,
    themes: generatedThemes,
    tokens,
    roleCount: ROLE_COUNT,
    pairMatrix: PAIR_MATRIX,
    mustBeDistinct: MUST_BE_DISTINCT,
    profile,
  };
}

const WCAG_VERSION_REF = '2.2';
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export { CVD_TYPES, simulateCvd, deltaE2000, hueDifference, luminanceBounds };
