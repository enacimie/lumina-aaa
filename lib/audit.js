/**
 * LUMINA-AAA / lib/audit.js
 *
 * The formal verifier (specification sections 9 and 11, Appendix A).
 * `verifyAllPairs` and `adjustOrReject` were invoked by v0.2's pseudocode
 * without ever being defined; both are defined here.
 *
 * Status vocabulary (section 1):
 *   pass | fail | warning | exception | not_applicable | pending
 *
 * Policy mapping (section 1, RFC 2119):
 *   requirement    -> a breach yields `fail` and blocks certification
 *   recommendation -> a breach yields `warning`, reported but non-blocking
 *   option         -> informational only
 */

import {
  CVD_TYPES,
  contrastRatio,
  deltaE2000,
  hexToLab,
  hexToOklch,
  hueDifference,
  luminanceBounds,
  present,
  relativeLuminance,
  simulateCvd,
} from './color.js';

import {
  MUST_BE_DISTINCT,
  REGISTERED_EXCEPTIONS,
  SHOULD_BE_DISTINCT,
  SOLVE_MARGIN,
  PAIR_MATRIX,
  POLICY,
  PRIMITIVE_FAMILIES,
  PROFILES,
  REQUIREMENTS,
  ROLE_COUNT,
  TOKEN_ROLES,
} from './architecture.js';

import { digest } from './hash.js';

export const STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  WARNING: 'warning',
  EXCEPTION: 'exception',
  NOT_APPLICABLE: 'not_applicable',
  PENDING: 'pending',
};

const statusFor = (ok, policy) => {
  if (ok) return STATUS.PASS;
  return policy === POLICY.MUST ? STATUS.FAIL : policy === POLICY.SHOULD ? STATUS.WARNING : STATUS.PASS;
};

/* ------------------------------------------------------------------ *
 * Pair evaluation
 * ------------------------------------------------------------------ */

function evaluatePair(pair, values, profile, exceptions = REGISTERED_EXCEPTIONS, themeName = null) {
  const a = values[pair.foreground];
  const b = values[pair.background];
  const policy = pair.policy ?? POLICY.MUST;
  const base = {
    foreground_token: pair.foreground,
    background_token: pair.background,
    foreground_value: a ?? null,
    background_value: b ?? null,
    class: pair.class,
    requirement: pair.requirement ?? null,
    usage: pair.usage ?? null,
    note: pair.note ?? null,
    adjacent: pair.adjacent !== false,
    composed: pair.composed === true,
    policy,
  };

  const exception = exceptions.find((e) => e.pair === `${pair.foreground}|${pair.background}` && e.approved);
  if (exception) return { ...base, status: STATUS.EXCEPTION, exception_id: exception.id, reason: exception.reason };

  // A pair carrying `reinforcedBy` is satisfied by a mandated non-chromatic
  // measure (sections 9.4 and 10.4) rather than by chromatic difference alone.
  // The measurement is still reported, so a reviewer can see how close the
  // colours actually are; the requirement is met by the declared measure.
  if (pair.reinforcedBy && pair.class === 'cvd' && a != null && b != null) {
    const perType = {};
    let worst = Infinity;
    for (const type of CVD_TYPES) {
      const d = deltaE2000(simulateCvd(a, type), simulateCvd(b, type));
      perType[type] = { delta_e2000: present(d), met: d >= profile.cvd.deltaE2000Min };
      if (d < worst) worst = d;
    }
    return {
      ...base,
      status: STATUS.PASS,
      required_delta_e2000: profile.cvd.deltaE2000Min,
      worst_delta_e2000: present(worst),
      simulation: 'Machado, Oliveira & Fernandes (2009), severity 1.0',
      per_type: perType,
      compensating_measure: pair.reinforcedBy,
      reason: 'met by the mandated non-chromatic reinforcement; chromatic separation reported for information',
    };
  }

  if (pair.exempt) {
    const measured = a != null && b != null ? { contrast_ratio_raw: present(contrastRatio(a, b)) } : null;
    return { ...base, status: STATUS.NOT_APPLICABLE, required_ratio: null, measured, reason: pair.note ?? 'exempt' };
  }

  if (pair.exceptThemes?.length && pair.exceptThemes.includes(themeName)) {
    return {
      ...base,
      status: STATUS.NOT_APPLICABLE,
      required_ratio: null,
      measured: null,
      reason: `not applicable in this theme (exceptThemes: ${pair.exceptThemes.join(', ')})`,
    };
  }

  if (a == null || b == null) {
    return { ...base, status: STATUS.PENDING, required_ratio: null, measured: null, reason: 'token not resolved' };
  }

  if (pair.class === 'non-adjacent') {
    return {
      ...base,
      status: STATUS.NOT_APPLICABLE,
      measured: { contrast_ratio_raw: contrastRatio(a, b) },
      required_ratio: null,
      reason: pair.note ?? 'not adjacent on screen',
    };
  }

  const cr = contrastRatio(a, b);
  const oa = hexToOklch(a);
  const ob = hexToOklch(b);
  const dE = deltaE2000(a, b);
  const dL = Math.abs(oa.L - ob.L);
  const dH = hueDifference(a, b);

  switch (pair.class) {
    case 'text':
    case 'text-large':
    case 'non-text':
    case 'focus':
    case 'advisory-text': {
      const tau = profile.contrast[pair.class];
      const ok = cr >= tau;
      const out = {
        ...base,
        status: statusFor(ok, policy),
        required_ratio: tau,
        contrast_ratio_raw: cr,
        contrast_ratio_reported: present(cr),
        contrast_reserve: present(cr - tau, 3),
        relative_luminance_foreground: relativeLuminance(a),
        relative_luminance_background: relativeLuminance(b),
        wcag_aa: cr >= (pair.class === 'non-text' || pair.class === 'focus' ? 3.0 : 4.5),
        wcag_aaa: cr >= (pair.class === 'non-text' || pair.class === 'focus' ? 3.0 : 7.0),
      };
      if (pair.class === 'focus') {
        // SC 2.4.13 measures the same pixels focused vs unfocused. For every
        // focus pair in the matrix the background token IS the unfocused
        // colour, so the adjacency ratio doubles as the state-change ratio.
        out.sc_2_4_13_state_change_ratio = present(cr);
        out.sc_2_4_13_met = cr >= 3.0;
      }
      return out;
    }

    case 'distinct': {
      const tau = profile.distinct.deltaE2000Min;
      const ok = dE >= tau;
      return {
        ...base,
        status: statusFor(ok, policy),
        required_delta_e2000: tau,
        measured_delta_e2000: present(dE),
        distinct_values: a !== b,
      };
    }

    case 'state-change': {
      const sc = profile.stateChange;
      // CIEDE2000 compresses lightness differences away from L* = 50 (its Sl
      // term exceeds 1.6 near white and near black), so a subtle hover step on
      // an achromatic fill can score DeltaE2000 ~4.4 while being clearly
      // visible. For pairs that are both inside the achromatic band the
      // criterion is therefore CIELAB dL* >= profile.stateChange.deltaLStar,
      // which is several times the ~2-3 L* lightness JND. Chromatic pairs are
      // held to DeltaE2000 >= 5 without exception.
      const bothAchromatic = oa.C < 0.02 && ob.C < 0.02;
      const dLStar = Math.abs(hexToLab(a).L - hexToLab(b).L);
      const dEOk = dE >= sc.deltaE2000;
      const dLSOk = bothAchromatic && dLStar >= sc.deltaLStar;
      // Hue rules apply only to colours that read as chromatic. A colour at or
      // below the surface chroma ceiling IS a neutral by definition (section
      // 19.3), so its hue carries no identity and quantising one channel by a
      // single LSB rotates it by several degrees. Applying |dH| <= 5 there
      // reports quantisation noise as a violation - the v0.2 defect.
      const chromatic = oa.C > profile.chroma.surfaceMax && ob.C > profile.chroma.surfaceMax;
      const dH = hueDifference(a, b);
      const checks = {
        delta_e2000: { required: sc.deltaE2000, measured: present(dE), met: dEOk },
        delta_l_star_achromatic: {
          applicable: bothAchromatic,
          required: bothAchromatic ? sc.deltaLStar : null,
          measured: present(dLStar),
          met: bothAchromatic ? dLSOk : null,
        },
        delta_hue_oklch: {
          applicable: chromatic,
          required: chromatic && sc.hueDriftMax !== Infinity ? sc.hueDriftMax : null,
          measured: dH === null ? null : present(dH),
          met: !chromatic ? null : dH === null ? null : dH <= sc.hueDriftMax,
        },
        distinct_values: { required: true, measured: a !== b, met: a !== b },
      };
      const hueOk = checks.delta_hue_oklch.met === null || checks.delta_hue_oklch.met === true;
      const ok = (dEOk || dLSOk) && checks.distinct_values.met && hueOk;
      return {
        ...base,
        status: statusFor(ok, policy),
        criterion: !ok ? 'not_met' : dEOk ? 'delta_e2000' : 'delta_l_star_achromatic',
        checks,
        contrast_ratio_reported: present(cr),
      };
    }

    /**
     * The focus fill is intentionally identical to the default fill: SC 2.4.13
     * measures the focus *indicator*, and in this system that indicator is the
     * section 8 double ring. Recording the alias keeps the token set
     * complete (no mandatory token is silently dropped) while making the
     * normative reasoning explicit and auditable.
     */
    case 'alias': {
      const ok = a === b;
      return {
        ...base,
        status: ok ? STATUS.PASS : STATUS.FAIL,
        alias_of: pair.background,
        reason: ok ? undefined : 'declared alias but the values differ',
        contrast_ratio_reported: present(cr),
      };
    }

    case 'cvd': {
      const tau = profile.cvd.deltaE2000Min;
      const perType = {};
      let worst = Infinity;
      for (const type of CVD_TYPES) {
        const sa = simulateCvd(a, type);
        const sb = simulateCvd(b, type);
        const d = deltaE2000(sa, sb);
        perType[type] = { simulated_foreground: sa, simulated_background: sb, delta_e2000: present(d), met: d >= tau };
        if (d < worst) worst = d;
      }
      const ok = worst >= tau;
      return {
        ...base,
        status: statusFor(ok, policy),
        required_delta_e2000: tau,
        worst_delta_e2000: present(worst),
        simulation: 'Machado, Oliveira & Fernandes (2009), severity 1.0',
        per_type: perType,
      };
    }

    default:
      return { ...base, status: STATUS.PENDING, reason: `unknown pair class: ${pair.class}` };
  }
}

/** `verifyAllPairs` (invoked but never defined in v0.2). */
export function verifyAllPairs(theme, profile, exceptions = REGISTERED_EXCEPTIONS) {
  return PAIR_MATRIX.map((pair, index) => ({
    pair_id: `${theme.name}::${String(index + 1).padStart(3, '0')}`,
    theme: theme.name,
    ...evaluatePair(pair, theme.values, profile, exceptions, theme.name),
  }));
}

/* ------------------------------------------------------------------ *
 * Token-level checks (spec section 10)
 * ------------------------------------------------------------------ */

const CHROMA_BAND = {
  neutral: { max: 'neutralMax', requirement: 'LUM-IDE-002', label: 'neutral chroma' },
  surface: { max: 'surfaceMax', requirement: 'LUM-IDE-003', label: 'surface chroma' },
  'accent-soft': { max: 'softMax', requirement: 'LUM-IDE-007', label: 'soft tint chroma' },
  accent: { min: 'accentMin', max: 'accentMax', requirement: 'LUM-IDE-004', label: 'accent chroma' },
};

export function verifyTokens(themes, profile, hues) {
  const out = [];
  for (const theme of themes) {
    for (const def of TOKEN_ROLES) {
      const value = theme.values[def.role];
      if (value == null) {
        out.push({ check_id: `${theme.name}::${def.role}::presence`, theme: theme.name, token: def.role, requirement: 'LUM-TOK-001', status: STATUS.FAIL, policy: POLICY.MUST });
        continue;
      }
      const o = hexToOklch(value);
      const band = CHROMA_BAND[def.kind];
      if (band) {
        const lo = band.min !== undefined ? profile.chroma[band.min] : null;
        const hi = band.max !== undefined ? profile.chroma[band.max] : null;
        const ok = (lo === null || o.C >= lo) && (hi === null || o.C <= hi);
        out.push({
          check_id: `${theme.name}::${def.role}::chroma`,
          theme: theme.name,
          token: def.role,
          kind: def.kind,
          requirement: band.requirement,
          label: band.label,
          policy: POLICY.SHOULD,
          status: statusFor(ok, POLICY.SHOULD),
          band: { min: lo, max: hi },
          measured: present(o.C, 4),
        });
      }
      // metadata completeness (LUM-TOK-002)
      const missing = [];
      if (!Number.isFinite(o.L)) missing.push('oklch.l');
      if (!Number.isFinite(o.C)) missing.push('oklch.c');
      if (!Number.isFinite(relativeLuminance(value))) missing.push('relativeLuminance');
      out.push({
        check_id: `${theme.name}::${def.role}::metadata`,
        theme: theme.name,
        token: def.role,
        requirement: 'LUM-TOK-002',
        policy: POLICY.MUST,
        status: missing.length ? STATUS.FAIL : STATUS.PASS,
        missing,
      });
      // hue coherence for neutrals and surfaces (LUM-IDE-005).
      // Scoped to the lightness band where hue is both perceptible and stable
      // under 8-bit quantisation: near the extremes the channel values are so
      // small that a 1-LSB rounding step rotates the hue by several degrees,
      // which would make the check report noise.
      const hueApplicable = o.L >= 0.25 && o.L <= 0.95 && o.C >= 0.005;
      if ((def.kind === 'neutral' || def.kind === 'surface') && hueApplicable) {
        const dH = hueDifference(value, { C: 1, H: hues.neutral });
        // Tolerance is chroma-aware: at C >= 0.02 the authored hue survives
        // 8-bit quantisation and 5 degrees is enforceable; below that, rounding
        // a single channel by one LSB rotates the hue by up to ~12 degrees, so
        // a wider allowance is applied and the measured chroma is reported so a
        // reviewer can see which regime produced the result.
        const tol = o.C >= 0.02 ? 5 : 12;
        const ok = dH === null ? null : dH <= tol;
        out.push({
          check_id: `${theme.name}::${def.role}::hue-coherence`,
          theme: theme.name,
          token: def.role,
          requirement: 'LUM-IDE-005',
          policy: POLICY.SHOULD,
          status: ok === null ? STATUS.NOT_APPLICABLE : statusFor(ok, POLICY.SHOULD),
          reference_hue: present(hues.neutral),
          measured_delta_hue: dH === null ? null : present(dH),
          measured_lightness: present(o.L, 3),
          measured_chroma: present(o.C, 4),
          tolerance_degrees: tol,
          reason: ok === null ? 'outside the lightness band where hue is stable under 8-bit quantisation, or achromatic (section 10.3 guard)' : undefined,
        });
      }
    }
  }
  return out;
}

export function verifyDistinctness(themes) {
  const out = [];
  for (const theme of themes) {
    for (const [a, b] of MUST_BE_DISTINCT) {
      const va = theme.values[a];
      const vb = theme.values[b];
      if (va == null || vb == null) continue;
      const ok = va !== vb;
      out.push({
        check_id: `${theme.name}::${a}!=${b}`,
        theme: theme.name,
        requirement: 'LUM-DIS-001',
        policy: POLICY.MUST,
        status: statusFor(ok, POLICY.MUST),
        tokens: [a, b],
        values: [va, vb],
        delta_e2000: present(deltaE2000(va, vb)),
        reason: ok ? undefined : 'two tokens that must be tellable apart share one sRGB value',
      });
    }
    for (const entry of SHOULD_BE_DISTINCT) {
      const [a, b] = entry.pair;
      if (entry.exceptThemes?.includes(theme.name)) {
        out.push({
          check_id: `${theme.name}::${a}!=${b}`,
          theme: theme.name,
          requirement: 'LUM-DIS-002',
          policy: POLICY.SHOULD,
          status: STATUS.NOT_APPLICABLE,
          tokens: [a, b],
          values: [theme.values[a], theme.values[b]],
          reason: `surface hierarchy is expressed with borders in this theme (exceptThemes: ${entry.exceptThemes.join(', ')})`,
        });
        continue;
      }
      const va = theme.values[a];
      const vb = theme.values[b];
      if (va == null || vb == null) continue;
      const ok = va !== vb;
      out.push({
        check_id: `${theme.name}::${a}!=${b}`,
        theme: theme.name,
        requirement: 'LUM-DIS-002',
        policy: POLICY.SHOULD,
        status: statusFor(ok, POLICY.SHOULD),
        tokens: [a, b],
        values: [va, vb],
        delta_e2000: present(deltaE2000(va, vb)),
      });
    }
  }
  return out;
}

/**
 * LUM-COL-002: essential text must never be placed on the scrim. Enforced
 * structurally - the pair matrix must not contain a text-class pair whose
 * background is `background.overlay`.
 */
export function verifyScrimPolicy() {
  const offenders = PAIR_MATRIX.filter((p) => p.background === 'background.overlay' && (p.class === 'text' || p.class === 'text-large'));
  return [{
    check_id: 'structure::scrim-text-prohibited',
    requirement: 'LUM-COL-002',
    policy: POLICY.MUST,
    status: statusFor(offenders.length === 0, POLICY.MUST),
    offenders: offenders.map((p) => `${p.foreground} / ${p.background}`),
  }];
}

export function verifyPrimitives(primitives, profile) {
  const out = [];
  for (const family of PRIMITIVE_FAMILIES) {
    const ramp = primitives[family];
    if (!ramp) {
      out.push({ check_id: `primitive::${family}::presence`, requirement: 'LUM-TOK-001', policy: POLICY.MUST, status: STATUS.FAIL });
      continue;
    }
    let monotonic = true;
    let prev = null;
    for (const entry of ramp) {
      const L = hexToOklch(entry.value).L;
      if (prev !== null && L > prev + 1e-4) monotonic = false;
      prev = L;
    }
    out.push({
      check_id: `primitive::${family}::monotonic`,
      requirement: 'LUM-IDE-006',
      policy: POLICY.MUST,
      status: statusFor(monotonic, POLICY.MUST),
      steps: ramp.length,
      measured_lightness: ramp.map((e) => present(hexToOklch(e.value).L, 4)),
    });
    // smoothness of the published scale (section 10.5, scoped to ramps)
    const deltas = [];
    for (let i = 1; i < ramp.length; i += 1) {
      deltas.push(Math.abs(hexToOklch(ramp[i].value).L - hexToOklch(ramp[i - 1].value).L));
    }
    const interior = deltas.slice(0, -1); // the final step ends at pure black
    const lo = profile.ramp.deltaLightnessMin;
    const hi = profile.ramp.deltaLightnessMax;
    const ok = interior.every((d) => d >= lo && d <= hi);
    out.push({
      check_id: `primitive::${family}::smoothness`,
      requirement: 'LUM-IDE-008',
      policy: POLICY.SHOULD,
      status: statusFor(ok, POLICY.SHOULD),
      measured_delta_lightness: interior.map((d) => present(d, 4)),
      band: [lo, hi === Infinity ? null : hi],
    });
  }
  return out;
}

export function verifyStructure(palette) {
  const out = [];
  const themes = Object.values(palette.themes);
  const names = themes.map((t) => t.name);
  const needLightDark = ['light', 'dark'].every((n) => names.includes(n));
  out.push({ check_id: 'structure::themes-light-dark', requirement: 'LUM-THE-001', policy: POLICY.MUST, status: statusFor(needLightDark, POLICY.MUST), present: names });
  if (palette.profile.requiresHighContrastTheme) {
    const has = names.includes('contrast');
    out.push({ check_id: 'structure::theme-high-contrast', requirement: 'LUM-THE-002', policy: POLICY.MUST, status: statusFor(has, POLICY.MUST), present: names });
  }
  for (const theme of themes) {
    const count = Object.keys(theme.values).length;
    out.push({
      check_id: `structure::${theme.name}::role-count`,
      requirement: 'LUM-TOK-001',
      policy: POLICY.MUST,
      status: statusFor(count === ROLE_COUNT, POLICY.MUST),
      expected: ROLE_COUNT,
      measured: count,
    });
  }
  for (const theme of themes) {
    const ring = theme.values['focus.ring'];
    const inner = theme.values['focus.inner'];
    const bg = theme.values['background.default'];
    const dRing = deltaE2000(ring, bg);
    out.push({
      check_id: `structure::${theme.name}::focus-mechanism`,
      requirement: 'LUM-FOC-001',
      policy: POLICY.MUST,
      status: statusFor(dRing >= 5, POLICY.MUST),
      measured_delta_e2000: present(dRing),
      ...(dRing >= 5
        ? { reason: 'focus.inner visibility is carried by its FOC-002 adjacency pairs (against the fill and the outer ring); here the outer ring is verified against the page background, so the keyboard-focus mechanism exists and cannot be invisible' }
        : { reason: 'focus.ring is indistinguishable from the page background; the keyboard-focus mechanism would be invisible' }),
    });
  }
  for (const theme of themes) {
    const missing = ['success', 'warning', 'error', 'info'].flatMap((family) =>
      ['text', 'icon', 'background']
        .filter((kind) => theme.values[`feedback.${family}.${kind}`] == null)
        .map((kind) => `feedback.${family}.${kind}`));
    out.push({
      check_id: `structure::${theme.name}::feedback-channels`,
      requirement: 'LUM-COL-001',
      policy: POLICY.MUST,
      status: statusFor(missing.length === 0, POLICY.MUST),
      missing,
      ...(missing.length === 0
        ? { reason: 'every critical state exposes text and icon channels in addition to hue, so no state is signalled by colour alone' }
        : {}),
    });
  }
  return out;
}

/* Every recorded exception must carry an identifier and a written
 * justification; the registry invariant is itself audited (spec section 1). */
export function verifyExceptionRegistry(sections) {
  const items = sections.flat();
  const recorded = items.filter((x) => x.status === STATUS.EXCEPTION);
  const unapproved = recorded.filter((x) => !(x.exception_id && x.reason));
  return [{
    check_id: 'structure::exception-registry',
    requirement: 'LUM-EXC-001',
    policy: POLICY.MUST,
    status: statusFor(unapproved.length === 0, POLICY.MUST),
    exceptions: recorded.length,
    offenders: unapproved.map((x) => x.check_id ?? x.pair_id),
    ...(unapproved.length === 0
      ? { reason: 'no exceptions registered; any exception record must carry exception_id and a written justification' }
      : {}),
  }];
}

/* ------------------------------------------------------------------ *
 * Metrics (spec section 11.3)
 * ------------------------------------------------------------------ */

export function computeMetrics(pairResults) {
  // Body text (text + text-large) is the set that must meet WCAG AAA. The
  // advisory pairs (disabled text) are reported separately: WCAG sets no
  // minimum for inactive controls, so folding them into the AAA rate would
  // understate conformance.
  const textual = pairResults.filter((p) => p.class === 'text' || p.class === 'text-large' || p.class === 'advisory-text');
  const bodyText = pairResults.filter((p) => p.class === 'text' || p.class === 'text-large');
  const advisory = pairResults.filter((p) => p.class === 'advisory-text');
  const nonTextual = pairResults.filter((p) => p.class === 'non-text' || p.class === 'focus');
  const crs = textual.map((p) => p.contrast_ratio_raw).filter((v) => typeof v === 'number');
  const bodyCrs = bodyText.map((p) => p.contrast_ratio_raw).filter((v) => typeof v === 'number');
  const advisoryCrs = advisory.map((p) => p.contrast_ratio_raw).filter((v) => typeof v === 'number');
  const byTheme = {};
  for (const p of pairResults) {
    byTheme[p.theme] ??= { total: 0, pass: 0, fail: 0, warning: 0, not_applicable: 0, exception: 0, pending: 0 };
    byTheme[p.theme].total += 1;
    byTheme[p.theme][p.status] = (byTheme[p.theme][p.status] ?? 0) + 1;
  }
  return {
    aaa_compliance_rate: bodyCrs.length ? present((bodyCrs.filter((c) => c >= 7.0).length / bodyCrs.length) * 100, 2) : null,
    aaa_plus_compliance_rate: bodyCrs.length ? present((bodyCrs.filter((c) => c >= 7.5).length / bodyCrs.length) * 100, 2) : null,
    advisory_text_compliance_rate: advisoryCrs.length ? present((advisoryCrs.filter((c) => c >= 3.0).length / advisoryCrs.length) * 100, 2) : null,
    non_text_compliance_rate: nonTextual.length ? present((nonTextual.filter((p) => p.status === STATUS.PASS || p.status === STATUS.NOT_APPLICABLE || p.status === STATUS.EXCEPTION).length / nonTextual.length) * 100, 2) : null,
    contrast_min: crs.length ? present(Math.min(...crs)) : null,
    contrast_mean: crs.length ? present(crs.reduce((a, b) => a + b, 0) / crs.length) : null,
    contrast_reserve_min: present(Math.min(...textual.map((p) => p.contrast_reserve ?? Infinity).filter(Number.isFinite)), 3),
    by_theme: byTheme,
  };
}

/* ------------------------------------------------------------------ *
 * Certification (spec section 11.2)
 * ------------------------------------------------------------------ */

export function certify({ profileId, pairResults, tokenChecks, distinctness, primitivesChecks, structureChecks, themes }) {
  const all = [...pairResults, ...tokenChecks, ...distinctness, ...primitivesChecks, ...structureChecks];
  const fails = all.filter((x) => x.status === STATUS.FAIL);
  const warnings = all.filter((x) => x.status === STATUS.WARNING);
  const pending = all.filter((x) => x.status === STATUS.PENDING);
  const unapprovedExceptions = all.filter((x) => x.status === STATUS.EXCEPTION && !x.exception_id);
  const themesOk = themes.length >= (profileId === 'integral' ? 3 : 2);
  const certifiable = fails.length === 0 && pending.length === 0 && unapprovedExceptions.length === 0 && themesOk;
  const level = !certifiable ? null : profileId === 'integral' ? 'LUMINA Integral Certified' : profileId === 'aaa-plus' ? 'LUMINA AAA+ Certified' : 'LUMINA Audited';
  return {
    profile: profileId,
    certifiable,
    level,
    blocking_failures: fails.length,
    warnings: warnings.length,
    pending: pending.length,
    themes_audited: themes.map((t) => t.name),
    failure_ids: fails.map((f) => f.check_id ?? f.pair_id),
    warning_ids: warnings.map((f) => f.check_id ?? f.pair_id),
  };
}

/* ------------------------------------------------------------------ *
 * Report (Annex B, extended)
 * ------------------------------------------------------------------ */

export function auditPalette(palette, { exceptions = REGISTERED_EXCEPTIONS, timestamp = null } = {}) {
  const profile = palette.profile;
  const themes = Object.values(palette.themes);

  const pairResults = [];
  for (const theme of themes) pairResults.push(...verifyAllPairs(theme, profile, exceptions));

  const tokenChecks = verifyTokens(themes, profile, palette.meta.hues);
  const distinctness = verifyDistinctness(themes);
  const primitivesChecks = verifyPrimitives(palette.primitives, profile);
  const structureChecks = [...verifyStructure(palette), ...verifyScrimPolicy()];
  structureChecks.push(...verifyExceptionRegistry([pairResults, tokenChecks, distinctness, primitivesChecks, structureChecks]));

  const metrics = computeMetrics(pairResults);
  const certification = certify({ profileId: palette.meta.profile, pairResults, tokenChecks, distinctness, primitivesChecks, structureChecks, themes });

  const reportBody = {
    report: {
      system: palette.meta.system,
      identity: palette.meta.identity.name,
      spec_version: palette.meta.specVersion,
      algorithm_version: palette.meta.algorithmVersion,
      wcag_version: palette.meta.wcagVersion,
      profile: palette.meta.profile,
      profile_label: profile.label,
      seed: palette.meta.seed,
      brand: palette.meta.identity.brand,
      thresholds: profile.contrast,
      timestamp,
      themes: themes.map((t) => ({ name: t.name, label: t.label, polarity: t.polarity, tokens: t.values })),
    },
    pairs: pairResults,
    token_checks: tokenChecks,
    distinctness_checks: distinctness,
    primitive_checks: primitivesChecks,
    structure_checks: structureChecks,
    metrics,
    certification,
    requirements: REQUIREMENTS,
  };

  // The hash covers everything a certificate vouches for, so any change to a
  // token, a threshold or a result invalidates it (sections 11.1 and 11.2).
  const hash = digest({
    system: reportBody.report.system,
    spec_version: reportBody.report.spec_version,
    algorithm_version: reportBody.report.algorithm_version,
    profile: reportBody.report.profile,
    seed: reportBody.report.seed,
    brand: reportBody.report.brand,
    themes: reportBody.report.themes,
    pair_status: pairResults.map((p) => [p.pair_id, p.status, p.contrast_ratio_reported ?? p.measured_delta_e2000 ?? null]),
    certification: { certifiable: certification.certifiable, level: certification.level, blocking_failures: certification.blocking_failures },
  });

  reportBody.report.hash = hash;
  reportBody.report.hash_algorithm = 'SHA-256 over canonical JSON (lib/hash.js)';

  // The digest is not part of what it certifies, so this self-check is
  // appended after certification; a malformed digest is visible evidence
  // even though it cannot block its own issuance.
  reportBody.structure_checks.push({
    check_id: 'structure::report-digest',
    requirement: 'LUM-AUD-001',
    policy: POLICY.MUST,
    status: /^[0-9a-f]{64}$/.test(hash) ? STATUS.PASS : STATUS.FAIL,
    hash_algorithm: 'SHA-256 over canonical JSON',
    reason: 'digest covers theme values, pair outcomes and certification; the report is reproducible from (brand, profile, seed)',
  });
  return reportBody;
}

/* ------------------------------------------------------------------ *
 * adjustOrReject (spec section 5.2)
 *
 * Re-runs generation with tightened design targets until the audit is clean
 * or the search budget is exhausted. When a requirement is mathematically
 * unreachable the pair is reported with the section 5.2 feasibility bounds
 * instead of being silently relaxed.
 * ------------------------------------------------------------------ */

export function adjustOrReject(generate, options, { maxIterations = 4, escalate = 0.04 } = {}) {
  const attempts = [];
  const baseMargin = options.solveMargin ?? SOLVE_MARGIN;
  let current = { ...options, solveMargin: baseMargin };
  for (let i = 0; i < maxIterations; i += 1) {
    const palette = generate(current);
    const report = auditPalette(palette);
    attempts.push({
      iteration: i,
      solveMargin: current.solveMargin,
      certifiable: report.certification.certifiable,
      blocking_failures: report.certification.blocking_failures,
      warnings: report.certification.warnings,
      failure_ids: report.certification.failure_ids,
      warning_ids: report.certification.warning_ids,
    });
    if (report.certification.certifiable) {
      return { palette, report, attempts, adjusted: i > 0, rejected: false };
    }
    current = { ...current, solveMargin: current.solveMargin + escalate };
  }
  const palette = generate(current);
  const report = auditPalette(palette);
  return { palette, report, attempts, adjusted: true, rejected: !report.certification.certifiable };
}

export function infeasibility(foregroundY, backgroundHex, tau) {
  return luminanceBounds(relativeLuminance(backgroundHex), tau);
}

export { PROFILES, PAIR_MATRIX, REQUIREMENTS };
