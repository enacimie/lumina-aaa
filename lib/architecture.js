/**
 * LUMINA-AAA / lib/architecture.js
 *
 * The normative architecture of the system, expressed as executable data.
 * Everything the specification declares in prose (mandatory token set, pair
 * matrix, profiles, aesthetic bands) lives here so that the auditor and the
 * generator cannot drift from the document.
 *
 * Requirement identifiers follow Annex C of the specification.
 */

export const SYSTEM = 'lumina';
export const SPEC_VERSION = '0.3.0';
export const ALGORITHM_VERSION = '1.0.0';
export const WCAG_VERSION = '2.2';

/** RFC 2119 strength, mapped to audit policy (spec section 1). */
export const POLICY = {
  MUST: 'requirement',      // DEBE      -> `fail` blocks certification
  SHOULD: 'recommendation', // DEBERIA   -> `warning`, reported, non-blocking
  MAY: 'option',            // PUEDE     -> informational
};

/* ------------------------------------------------------------------ *
 * 1. Conformance profiles (spec section 3)
 * ------------------------------------------------------------------ */

export const PROFILES = {
  'wcag-aaa': {
    label: 'WCAG 2.2 AAA minimum',
    contrast: { text: 7.0, 'text-large': 4.5, 'non-text': 3.0, focus: 3.0, 'advisory-text': 3.0 },
    stateChange: { deltaE2000: 0, deltaLStar: 0, hueDriftMax: Infinity },
    ramp: { deltaLightnessMin: 0, deltaLightnessMax: Infinity },
    cvd: { deltaE2000Min: 0 },
    distinct: { deltaE2000Min: 0 },
    chroma: { neutralMax: Infinity, surfaceMax: Infinity, softMax: Infinity, accentMin: 0, accentMax: Infinity },
    requiresHighContrastTheme: false,
  },
  'aaa-plus': {
    label: 'LUMINA AAA+',
    contrast: { text: 7.5, 'text-large': 5.0, 'non-text': 3.2, focus: 3.2, 'advisory-text': 3.0 },
    stateChange: { deltaE2000: 5.0, deltaLStar: 4.0, hueDriftMax: 5 },
    ramp: { deltaLightnessMin: 0.02, deltaLightnessMax: 0.15 },
    cvd: { deltaE2000Min: 10 },
    distinct: { deltaE2000Min: 5 },
    chroma: { neutralMax: 0.02, surfaceMax: 0.04, softMax: 0.09, accentMin: 0.06, accentMax: 0.25 },
    requiresHighContrastTheme: false,
  },
  integral: {
    label: 'LUMINA Integral',
    contrast: { text: 7.5, 'text-large': 7.5, 'non-text': 3.2, focus: 3.2, 'advisory-text': 3.0 },
    stateChange: { deltaE2000: 5.0, deltaLStar: 4.0, hueDriftMax: 5 },
    ramp: { deltaLightnessMin: 0.02, deltaLightnessMax: 0.15 },
    cvd: { deltaE2000Min: 10 },
    distinct: { deltaE2000Min: 5 },
    chroma: { neutralMax: 0.02, surfaceMax: 0.04, softMax: 0.09, accentMin: 0.06, accentMax: 0.25 },
    requiresHighContrastTheme: true,
  },
};

/** Safety margin applied when *solving* colours, so that published 8-bit values keep slack. */
export const SOLVE_MARGIN = 0.06;

/* ------------------------------------------------------------------ *
 * 2. Semantic hue anchors
 *
 * Semantic families keep recognisable anchors (a warning must read warm, an
 * error must read red) but are pulled towards the brand hue by a bounded
 * amount, so every generated identity stays coherent without breaking the
 * colour conventions users already know. Spec section 6.2.
 * ------------------------------------------------------------------ */

export const SEMANTIC_HUES = {
  success: 152,
  warning: 78,
  error: 25,
  /** `info` is the brand family itself; resolved at generation time. */
  info: null,
};

/** Maximum pull of a semantic anchor towards the brand hue, in degrees. */
export const SEMANTIC_HUE_PULL_MAX = 8;

/* ------------------------------------------------------------------ *
 * 3. Mandatory token set - 59 roles per theme (spec section 4.1)
 *
 * `kind` drives the chroma band that applies (spec section 10.1).
 * `state` mirrors the trailing segment of the role path (spec section 4.1).
 * ------------------------------------------------------------------ */

const r = (role, layer, kind, extra = {}) => ({
  role,
  layer,
  group: role.split('.')[0],
  state: extra.state ?? null,
  kind,
  ...extra,
});

export const TOKEN_ROLES = [
  // 14.1 backgrounds
  r('background.default', 'semantic', 'surface'),
  r('background.surface', 'semantic', 'surface'),
  r('background.subtle', 'semantic', 'surface'),
  r('background.raised', 'semantic', 'surface'),
  r('background.inverse', 'semantic', 'neutral'),
  r('background.overlay', 'semantic', 'neutral', { composed: true }),
  r('background.disabled', 'semantic', 'surface'),
  // 14.2 text
  r('text.primary', 'semantic', 'neutral'),
  r('text.secondary', 'semantic', 'neutral'),
  r('text.disabled', 'semantic', 'neutral'),
  r('text.on-primary', 'semantic', 'neutral'),
  r('text.on-surface', 'semantic', 'neutral'),
  r('text.inverse', 'semantic', 'neutral'),
  r('text.link', 'semantic', 'accent'),
  // 14.3 interaction
  r('interactive.primary.default', 'semantic', 'accent', { state: 'default' }),
  r('interactive.primary.hover', 'semantic', 'accent', { state: 'hover' }),
  r('interactive.primary.active', 'semantic', 'accent', { state: 'active' }),
  r('interactive.primary.focus', 'semantic', 'accent', { state: 'focus' }),
  r('interactive.secondary.default', 'semantic', 'surface', { state: 'default' }),
  r('interactive.secondary.hover', 'semantic', 'surface', { state: 'hover' }),
  r('interactive.secondary.active', 'semantic', 'surface', { state: 'active' }),
  r('interactive.ghost.default', 'semantic', 'surface', { state: 'default' }),
  r('interactive.ghost.hover', 'semantic', 'surface', { state: 'hover' }),
  r('interactive.selected', 'semantic', 'accent-soft'),
  r('interactive.disabled', 'semantic', 'neutral'),
  // 14.4 feedback
  ...['success', 'warning', 'error', 'info'].flatMap((f) => [
    r(`feedback.${f}.background`, 'semantic', 'accent-soft'),
    r(`feedback.${f}.text`, 'semantic', 'accent'),
    r(`feedback.${f}.border`, 'semantic', 'accent'),
    r(`feedback.${f}.icon`, 'semantic', 'accent'),
  ]),
  // 14.5 borders and focus
  r('border.default', 'semantic', 'neutral'),
  r('border.strong', 'semantic', 'neutral'),
  r('border.subtle', 'semantic', 'neutral'),
  r('border.focus', 'semantic', 'accent'),
  r('border.error', 'semantic', 'accent'),
  r('focus.ring', 'semantic', 'neutral', { state: 'focus' }),
  r('focus.inner', 'semantic', 'neutral', { state: 'focus' }),
  // 14.6 data visualisation
  r('chart.background', 'semantic', 'surface'),
  r('chart.surface', 'semantic', 'surface'),
  r('chart.label', 'semantic', 'neutral'),
  r('chart.axis', 'semantic', 'neutral'),
  r('chart.grid', 'semantic', 'neutral'),
  r('chart.series.1', 'semantic', 'accent'),
  r('chart.series.2', 'semantic', 'accent'),
  r('chart.series.3', 'semantic', 'accent'),
  r('chart.series.4', 'semantic', 'accent'),
  r('chart.series.5', 'semantic', 'accent'),
  r('chart.series.6', 'semantic', 'accent'),
];

export const ROLE_COUNT = TOKEN_ROLES.length;

/* ------------------------------------------------------------------ *
 * 4. Alias compatibility (spec section 7.4 / new requirement LUM-DIS-001)
 *
 * Two tokens may legitimately resolve to the same sRGB value when their roles
 * are compatible (e.g. `text.primary` and `chart.label`). They MUST NOT when
 * the two have to be tellable apart on screen. v0.2 had no such rule, which is
 * why `focus.ring` and `interactive.primary.default` ended up identical and
 * the focus indicator became invisible on the primary button.
 * ------------------------------------------------------------------ */

export const MUST_BE_DISTINCT = [
  // Functional conflicts: two roles that must be tellable apart on screen.
  ['focus.ring', 'interactive.primary.default'],
  ['focus.ring', 'interactive.primary.hover'],
  ['focus.ring', 'interactive.primary.active'],
  ['focus.ring', 'interactive.primary.focus'],
  ['focus.ring', 'focus.inner'],
  ['focus.inner', 'interactive.primary.default'],
  ['focus.inner', 'interactive.primary.hover'],
  ['focus.inner', 'interactive.primary.active'],
  ['focus.inner', 'interactive.primary.focus'],
  ['border.focus', 'border.default'],
  ['border.error', 'border.default'],
  ['border.strong', 'border.default'],
  ['interactive.primary.hover', 'interactive.primary.default'],
  ['interactive.primary.active', 'interactive.primary.default'],
  ['interactive.secondary.hover', 'interactive.secondary.default'],
  ['interactive.secondary.active', 'interactive.secondary.default'],
  ['interactive.ghost.hover', 'interactive.ghost.default'],
  ['interactive.disabled', 'background.disabled'],
  ['chart.series.1', 'chart.series.2'],
  ['chart.series.2', 'chart.series.3'],
  ['chart.series.3', 'chart.series.4'],
  ['chart.series.4', 'chart.series.5'],
  ['chart.series.5', 'chart.series.6'],
  ['chart.series.6', 'chart.series.1'],
  ['feedback.success.icon', 'feedback.error.icon'],
  ['feedback.success.icon', 'feedback.warning.icon'],
  ['feedback.error.icon', 'feedback.warning.icon'],
  ['feedback.info.icon', 'feedback.error.icon'],
  ['feedback.success.text', 'feedback.error.text'],
  ['feedback.success.background', 'feedback.error.background'],
];

/**
 * Hierarchy conflicts: aesthetic, not functional, so a breach is a warning
 * (section 10.4). Surface hierarchy may legitimately be expressed with borders
 * instead of fills, which is what the high-contrast theme does; those pairs
 * are `not_applicable` there.
 */
export const SHOULD_BE_DISTINCT = [
  { pair: ['background.default', 'background.surface'], exceptThemes: ['contrast'] },
  { pair: ['background.surface', 'background.subtle'] },
  { pair: ['background.surface', 'background.raised'], exceptThemes: ['contrast'] },
  { pair: ['background.default', 'background.disabled'] },
  { pair: ['background.inverse', 'background.default'] },
];

/**
 * Approved exceptions (spec section 11.2, requirement LUM-EXC-001). Each
 * carries an identifier, a written justification and a date. An approved
 * exception yields the `exception` status instead of `not_applicable`, so a
 * MUST requirement is never silently dropped.
 */
export const REGISTERED_EXCEPTIONS = [
  {
    id: 'EXC-2026-001',
    pair: 'border.focus|border.default',
    approved: true,
    date: '2026-11-10',
    reason: 'SC 2.4.13 measures the contrast between the same pixels in the focused and unfocused states. On an input, that contrast is provided by the focus ring (LUM-FOC-002), not by a border colour swap, so a border colour pair cannot carry it. The ring pairs are the audited requirement.',
  },
];

/* ------------------------------------------------------------------ *
 * 5. Per-theme design targets
 *
 * `L` / `C` are OKLCH authoring values. `cr` is the design contrast the solver
 * aims for against the binding background; the profile threshold is a hard
 * floor, the design value is the aesthetic intent. Both are checked.
 * ------------------------------------------------------------------ */

export const THEME_DESIGN = {
  light: {
    label: 'Light',
    polarity: 'light',
    neutralChroma: 0.014,
    surfaceChroma: 0.008,
    accentChroma: 0.17,
    softChroma: 0.055,
    backgrounds: {
      subtle: { L: 0.92 },
      default: { L: 0.976 },
      surface: { L: 0.995 },
      raised: { L: 1.0 },
      disabled: { L: 0.895 },
      inverse: { L: 0.235 },
      overlay: { targetL: 0.506, alpha: 0.62 },
    },
    text: {
      primary: { cr: 17.5 },
      secondary: { cr: 11.0 },
      disabled: { cr: 4.6 },
      'on-primary': { cr: 8.4 },
      'on-surface': { cr: 16.5 },
      inverse: { cr: 15.0 },
      link: { cr: 8.6 },
    },
    interactive: {
      // design contrast of the *label* against the fill
      primary: { cr: 8.0, hoverDL: -0.06, activeDL: -0.12 },
      secondary: { L: 0.995, hoverDL: -0.075, activeDL: -0.15 },
      ghost: { L: 1.0, hoverDL: -0.075 },
      selected: { cr: 8.0 },
      disabled: { cr: 3.2 },
    },
    feedback: {
      tintDeltaL: -0.045,
      textCr: 8.4,
      borderCr: 3.6,
      iconCr: 3.6,
    },
    border: { defaultCr: 4.9, strongCr: 8.0, subtleCr: 2.2, focusCr: 8.0, errorCr: 5.2 },
    focus: { ringCr: 12.0, innerCr: 8.4 },
    chart: {
      backgroundL: 1.0,
      surfaceL: 0.982,
      labelCr: 15.0,
      axisCr: 4.8,
      gridCr: 1.6,
      seriesCr: [6.4, 3.9, 6.4, 3.9, 6.4, 3.9],
    },
  },

  dark: {
    label: 'Dark',
    polarity: 'dark',
    neutralChroma: 0.016,
    surfaceChroma: 0.018,
    accentChroma: 0.11,
    softChroma: 0.07,
    backgrounds: {
      subtle: { L: 0.178 },
      default: { L: 0.212 },
      surface: { L: 0.252 },
      raised: { L: 0.296 },
      disabled: { L: 0.12 },
      inverse: { L: 0.94 },
      overlay: { targetL: 0.1346, alpha: 0.66 },
    },
    text: {
      primary: { cr: 14.0 },
      secondary: { cr: 9.6 },
      disabled: { cr: 4.4 },
      'on-primary': { cr: 8.4 },
      'on-surface': { cr: 13.0 },
      inverse: { cr: 15.0 },
      link: { cr: 8.6 },
    },
    interactive: {
      primary: { cr: 8.2, hoverDL: 0.06, activeDL: -0.06 },
      secondary: { L: 0.252, hoverDL: -0.075, activeDL: -0.15 },
      ghost: { L: 0.212, hoverDL: -0.075 },
      selected: { cr: 8.0 },
      disabled: { cr: 3.2 },
    },
    feedback: {
      tintDeltaL: -0.05,
      textCr: 8.6,
      borderCr: 3.8,
      iconCr: 3.8,
    },
    border: { defaultCr: 4.0, strongCr: 7.5, subtleCr: 2.0, focusCr: 8.0, errorCr: 4.6 },
    focus: { ringCr: 12.0, innerCr: 8.4 },
    chart: {
      backgroundL: 0.212,
      surfaceL: 0.30,
      labelCr: 13.0,
      axisCr: 4.2,
      gridCr: 1.7,
      seriesCr: [8.2, 4.6, 8.2, 4.6, 8.2, 4.6],
    },
  },

  contrast: {
    label: 'High contrast',
    polarity: 'light',
    neutralChroma: 0.0,
    surfaceChroma: 0.0,
    accentChroma: 0.19,
    softChroma: 0.05,
    backgrounds: {
      subtle: { L: 0.9 },
      default: { L: 1.0 },
      surface: { L: 1.0 },
      raised: { L: 1.0 },
      disabled: { L: 0.9 },
      inverse: { L: 0.0 },
      overlay: { targetL: 0.3211, alpha: 0.8 },
    },
    text: {
      primary: { cr: 21.0 },
      secondary: { cr: 16.0 },
      disabled: { cr: 7.0 },
      'on-primary': { cr: 10.0 },
      'on-surface': { cr: 21.0 },
      inverse: { cr: 21.0 },
      link: { cr: 10.5 },
    },
    interactive: {
      primary: { cr: 10.0, hoverDL: -0.08, activeDL: -0.16 },
      secondary: { L: 1.0, hoverDL: -0.08, activeDL: -0.16 },
      ghost: { L: 1.0, hoverDL: -0.075 },
      selected: { cr: 10.0 },
      disabled: { cr: 4.5 },
    },
    feedback: {
      tintDeltaL: -0.05,
      textCr: 10.5,
      borderCr: 5.0,
      iconCr: 5.0,
    },
    border: { defaultCr: 8.0, strongCr: 21.0, subtleCr: 4.5, focusCr: 5.0, errorCr: 8.0 },
    focus: { ringCr: 21.0, innerCr: 10.0 },
    chart: {
      backgroundL: 1.0,
      surfaceL: 1.0,
      labelCr: 21.0,
      axisCr: 8.0,
      gridCr: 3.0,
      seriesCr: [9.0, 5.0, 9.0, 5.0, 9.0, 5.0],
    },
  },
};

export const THEMES = ['light', 'dark', 'contrast'];

/* ------------------------------------------------------------------ *
 * 6. Mandatory pair matrix (spec section 9)
 *
 * v0.2 audited 31 pairs over 59 mandatory tokens, so 53 % of the tokens were
 * never measured and two referenced tokens did not exist. The matrix below
 * covers all 59 roles. `adjacent: false` records pairs that are deliberately
 * not adjacent on screen and are therefore reported as `not_applicable`
 * instead of being silently failed.
 * ------------------------------------------------------------------ */

const P = (foreground, background, klass, extra = {}) => ({ foreground, background, class: klass, ...extra });

export const PAIR_MATRIX = [
  /* --- 15.1 textual pairs, normal text ---------------------------- */
  P('text.primary', 'background.default', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.primary', 'background.surface', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.primary', 'background.subtle', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.primary', 'background.raised', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.secondary', 'background.default', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.secondary', 'background.surface', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.secondary', 'background.subtle', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.secondary', 'background.raised', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.on-surface', 'background.surface', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.on-surface', 'background.raised', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.on-primary', 'interactive.primary.default', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.on-primary', 'interactive.primary.hover', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.on-primary', 'interactive.primary.active', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.on-primary', 'interactive.primary.focus', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'background.default', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'background.surface', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'background.subtle', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'background.raised', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'interactive.secondary.default', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'interactive.secondary.hover', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'interactive.secondary.active', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'interactive.ghost.default', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.link', 'interactive.ghost.hover', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.primary', 'interactive.selected', 'text', { requirement: 'LUM-TXT-001' }),
  P('text.inverse', 'background.inverse', 'text', { requirement: 'LUM-TXT-001' }),
  // No text token is paired with the scrim: section 7.3 requires essential
  // content to sit on a solid panel, and LUM-COL-002 prohibits text on a scrim
  // outright. `background.overlay` is audited as a region below.
  P('feedback.success.text', 'feedback.success.background', 'text', { requirement: 'LUM-TXT-001' }),
  P('feedback.warning.text', 'feedback.warning.background', 'text', { requirement: 'LUM-TXT-001' }),
  P('feedback.error.text', 'feedback.error.background', 'text', { requirement: 'LUM-TXT-001' }),
  P('feedback.info.text', 'feedback.info.background', 'text', { requirement: 'LUM-TXT-001' }),
  P('chart.label', 'chart.background', 'text', { requirement: 'LUM-TXT-001' }),

  /* --- 15.1b large text usages ------------------------------------ *
   * v0.2 defined thresholds for large text (LUM-TXT-002/003) but never
   * listed a single large-text pair, which made both requirements
   * unauditable. These rows name the concrete usages.                  */
  P('text.primary', 'background.surface', 'text-large', { requirement: 'LUM-TXT-002', usage: 'display headings' }),
  P('text.on-primary', 'interactive.primary.default', 'text-large', { requirement: 'LUM-TXT-002', usage: 'large button labels' }),
  P('feedback.error.text', 'feedback.error.background', 'text-large', { requirement: 'LUM-TXT-002', usage: 'alert titles' }),
  P('chart.label', 'chart.background', 'text-large', { requirement: 'LUM-TXT-002', usage: 'chart titles' }),

  /* --- 9.6 disabled text: WCAG-exempt, LUMINA-advised -------------- */
  P('text.disabled', 'background.default', 'advisory-text', { requirement: 'LUM-TXT-004', policy: POLICY.SHOULD }),
  P('text.disabled', 'background.surface', 'advisory-text', { requirement: 'LUM-TXT-004', policy: POLICY.SHOULD }),
  P('text.disabled', 'background.disabled', 'advisory-text', { requirement: 'LUM-TXT-004', policy: POLICY.SHOULD }),
  P('text.disabled', 'interactive.disabled', 'advisory-text', { requirement: 'LUM-TXT-004', policy: POLICY.SHOULD }),

  /* --- 15.2 non-textual pairs -------------------------------------- */
  P('border.default', 'background.default', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('border.default', 'background.surface', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('border.default', 'background.subtle', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('border.default', 'background.raised', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('border.default', 'interactive.secondary.default', 'non-text', { requirement: 'LUM-NTX-001', note: 'functional border of a secondary button' }),
  P('border.strong', 'background.surface', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('border.strong', 'background.default', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('border.subtle', 'background.surface', 'non-text', { requirement: 'LUM-NTX-003', exempt: true, note: 'decorative separator, exempt under section 1' }),
  P('border.error', 'background.surface', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('border.error', 'background.default', 'non-text', { requirement: 'LUM-NTX-001' }),
  P('interactive.primary.default', 'background.surface', 'non-text', { requirement: 'LUM-NTX-001', note: 'filled button boundary, SC 1.4.11' }),
  P('interactive.selected', 'background.surface', 'distinct', { requirement: 'LUM-NTX-004', policy: POLICY.SHOULD, note: 'selection region; section 9.4 mandates a non-chromatic indicator as well' }),
  P('interactive.secondary.default', 'background.surface', 'alias', { requirement: 'LUM-STA-003', note: 'unfilled control: the fill is intentionally the surface, and the control is identified by border.default' }),
  P('interactive.disabled', 'background.surface', 'distinct', { requirement: 'LUM-NTX-005', policy: POLICY.SHOULD, note: 'WCAG exempts inactive controls' }),
  P('background.overlay', 'background.default', 'distinct', { requirement: 'LUM-NTX-006', policy: POLICY.SHOULD, composed: true, note: 'modal scrim boundary' }),

  /* feedback: border and icon against their own background, and the
     background against the surface so the alert region is discernible */
  ...['success', 'warning', 'error', 'info'].flatMap((f) => [
    P(`feedback.${f}.border`, `feedback.${f}.background`, 'non-text', { requirement: 'LUM-NTX-001' }),
    P(`feedback.${f}.icon`, `feedback.${f}.background`, 'non-text', { requirement: 'LUM-NTX-002' }),
    P(`feedback.${f}.background`, 'background.surface', 'distinct', { requirement: 'LUM-STA-004', policy: POLICY.SHOULD }),
  ]),

  /* --- 18 data visualisation --------------------------------------- */
  P('chart.axis', 'chart.background', 'non-text', { requirement: 'LUM-NTX-002' }),
  P('chart.surface', 'chart.background', 'distinct', { requirement: 'LUM-STA-004', policy: POLICY.SHOULD, exceptThemes: ['contrast'] }),
  P('chart.grid', 'chart.background', 'non-text', { requirement: 'LUM-NTX-003', exempt: true, note: 'gridlines are not essential graphics, exempt under section 1' }),
  ...[1, 2, 3, 4, 5, 6].map((n) => P(`chart.series.${n}`, 'chart.background', 'non-text', { requirement: 'LUM-NTX-002' })),

  /* --- 11 focus: adjacency-correct double ring ---------------------- *
   * SC 1.4.11 and SC 2.4.13 both measure against ADJACENT colours. With the
   * double ring mandated by section 8 the outer ring touches the page
   * background and the inner ring; the inner ring touches the outer ring and
   * the component fill. `focus.ring` is therefore NOT adjacent to
   * `interactive.primary.default`, and v0.2's mandatory row pairing them
   * directly was based on a wrong adjacency model. It is kept below as an
   * explicit `not_applicable` record so the reasoning stays auditable.  */
  P('focus.ring', 'background.default', 'focus', { requirement: 'LUM-FOC-002' }),
  P('focus.ring', 'background.surface', 'focus', { requirement: 'LUM-FOC-002' }),
  P('focus.ring', 'focus.inner', 'focus', { requirement: 'LUM-FOC-002' }),
  P('focus.inner', 'interactive.primary.default', 'focus', { requirement: 'LUM-FOC-002' }),
  P('focus.inner', 'interactive.primary.hover', 'focus', { requirement: 'LUM-FOC-002' }),
  P('focus.inner', 'interactive.primary.active', 'focus', { requirement: 'LUM-FOC-002' }),
  P('focus.inner', 'interactive.primary.focus', 'focus', { requirement: 'LUM-FOC-002' }),
  // On unfilled components no inner ring is drawn: focus there is carried by
  // border.focus (see the border.focus pairs), which is the SC 2.4.13 indicator.
  P('border.focus', 'background.surface', 'focus', { requirement: 'LUM-FOC-002' }),
  P('border.focus', 'border.default', 'non-text', { requirement: 'LUM-FOC-004', note: 'measured for information only: SC 2.4.13 asks for 3:1 between the same pixels focused and unfocused, and on an input that area is provided by the focus ring rather than by a border colour swap' }),
  P('focus.ring', 'interactive.primary.default', 'non-adjacent', { requirement: 'LUM-FOC-005', policy: POLICY.MAY, adjacent: false, note: 'separated by focus.inner; recorded to document the adjacency model' }),

  /* --- 16.3 state discriminability --------------------------------- */
  P('interactive.primary.hover', 'interactive.primary.default', 'state-change', { requirement: 'LUM-STA-002' }),
  P('interactive.primary.active', 'interactive.primary.default', 'state-change', { requirement: 'LUM-STA-002' }),
  P('interactive.primary.focus', 'interactive.primary.default', 'alias', { requirement: 'LUM-STA-002', note: 'the fill does not change on keyboard focus; discriminability is carried by focus.ring and focus.inner, which is what SC 2.4.13 measures' }),
  P('interactive.primary.active', 'interactive.primary.hover', 'state-change', { requirement: 'LUM-STA-002' }),
  P('interactive.secondary.hover', 'interactive.secondary.default', 'state-change', { requirement: 'LUM-STA-002' }),
  P('interactive.secondary.active', 'interactive.secondary.default', 'state-change', { requirement: 'LUM-STA-002' }),
  P('interactive.ghost.hover', 'interactive.ghost.default', 'state-change', { requirement: 'LUM-STA-002' }),

  /* --- 18.5 / 13.2 colour vision deficiency ------------------------ */
  ...[1, 2, 3, 4, 5, 6].flatMap((a) => [1, 2, 3, 4, 5, 6]
    .filter((b) => b > a)
    .map((b) => P(`chart.series.${a}`, `chart.series.${b}`, 'cvd', { requirement: 'LUM-CVD-001' }))),
  P('feedback.error.icon', 'feedback.success.icon', 'cvd', { requirement: 'LUM-CVD-002', policy: POLICY.SHOULD, reinforcedBy: 'icon + text label + border (section 9.4)', note: 'section 9.4 already mandates non-chromatic reinforcement' }),
  P('feedback.warning.icon', 'feedback.error.icon', 'cvd', { requirement: 'LUM-CVD-002', policy: POLICY.SHOULD, reinforcedBy: 'icon + text label + border (section 9.4)' }),
  P('feedback.info.icon', 'feedback.success.icon', 'cvd', { requirement: 'LUM-CVD-002', policy: POLICY.SHOULD, reinforcedBy: 'icon + text label + border (section 9.4)' }),
  P('interactive.selected', 'background.surface', 'cvd', { requirement: 'LUM-CVD-002', policy: POLICY.SHOULD, reinforcedBy: 'check indicator + border (section 9.4)' }),

  /* --- 19 surface hierarchy ---------------------------------------- */
  P('background.default', 'background.surface', 'distinct', { requirement: 'LUM-IDE-001', policy: POLICY.SHOULD, exceptThemes: ['contrast'] }),
  P('background.surface', 'background.subtle', 'distinct', { requirement: 'LUM-IDE-001', policy: POLICY.SHOULD }),
  P('background.surface', 'background.raised', 'distinct', { requirement: 'LUM-IDE-001', policy: POLICY.SHOULD, exceptThemes: ['contrast'] }),
  P('background.default', 'background.disabled', 'distinct', { requirement: 'LUM-IDE-001', policy: POLICY.SHOULD }),
  P('background.inverse', 'background.default', 'distinct', { requirement: 'LUM-IDE-001', policy: POLICY.SHOULD }),
  P('background.overlay', 'background.surface', 'distinct', { requirement: 'LUM-IDE-001', policy: POLICY.SHOULD }),
];

/* ------------------------------------------------------------------ *
 * 7. Annex C - requirement matrix
 * ------------------------------------------------------------------ */

export const REQUIREMENTS = [
  { id: 'LUM-TXT-001', area: 'Normal text', requirement: 'CR >= profile.text', profile: 'AAA+ / Integral', strength: POLICY.MUST },
  { id: 'LUM-TXT-002', area: 'Large text', requirement: 'CR >= profile.largeText', profile: 'AAA+', strength: POLICY.MUST },
  { id: 'LUM-TXT-004', area: 'Disabled text', requirement: 'CR >= 3.0 when informative', profile: 'all', strength: POLICY.SHOULD },
  { id: 'LUM-NTX-001', area: 'UI components', requirement: 'CR >= profile.nonText', profile: 'AAA+ / Integral', strength: POLICY.MUST },
  { id: 'LUM-NTX-002', area: 'Essential graphics', requirement: 'CR >= profile.nonText', profile: 'AAA+ / Integral', strength: POLICY.MUST },
  { id: 'LUM-NTX-003', area: 'Decorative separators', requirement: 'CR >= profile.nonText', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-NTX-004', area: 'Selection region', requirement: 'discernible + non-chromatic indicator', profile: 'all', strength: POLICY.SHOULD },
  { id: 'LUM-NTX-005', area: 'Inactive controls', requirement: 'CR >= 3.0 when informative', profile: 'all', strength: POLICY.SHOULD },
  { id: 'LUM-NTX-006', area: 'Modal scrim', requirement: 'discernible boundary', profile: 'all', strength: POLICY.SHOULD },
  { id: 'LUM-FOC-001', area: 'Focus visible', requirement: 'visible on keyboard focus', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-FOC-002', area: 'Focus contrast', requirement: 'CR >= profile.focus against adjacent colours', profile: 'AAA+ / Integral', strength: POLICY.MUST },
  { id: 'LUM-FOC-003', area: 'Focus area', requirement: '>= 2 CSS px perimeter equivalent', profile: 'Integral', strength: POLICY.MUST, scope: 'integration', note: 'measured on the consuming CSS (demo), not on token values' },
  { id: 'LUM-FOC-004', area: 'Focus state change', requirement: 'SC 2.4.13: CR >= 3.0 between focused and unfocused pixels', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-FOC-005', area: 'Focus adjacency', requirement: 'non-adjacent pairs are reported not_applicable', profile: 'all', strength: POLICY.MAY },
  { id: 'LUM-STA-002', area: 'State discriminability', requirement: 'DeltaE2000 >= 5 and |DeltaH| <= 5 deg between states of a component; the focus state is carried by the focus ring, as SC 2.4.13 measures the indicator rather than the fill', profile: 'Integral', strength: POLICY.MUST },
  { id: 'LUM-STA-003', area: 'Unfilled controls', requirement: 'discernible against the surface', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-STA-004', area: 'Regions', requirement: 'discernible against the surrounding surface', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-COL-001', area: 'Colour-only signalling', requirement: 'prohibited for critical states', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-COL-002', area: 'Text on scrims', requirement: 'essential text MUST NOT be placed on background.overlay; content sits on a solid panel', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-CVD-001', area: 'Chart series', requirement: 'DeltaE2000 >= 10 under protanopia, deuteranopia and tritanopia', profile: 'AAA+', strength: POLICY.MUST },
  { id: 'LUM-CVD-002', area: 'Semantic colours', requirement: 'DeltaE2000 >= 10 under dichromacy, or non-chromatic reinforcement', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-DIS-001', area: 'Distinctness', requirement: 'tokens declared MUST_BE_DISTINCT must not share an sRGB value', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-DIS-002', area: 'Surface hierarchy', requirement: 'tokens declared SHOULD_BE_DISTINCT must not share an sRGB value; theme-exempt pairs report not_applicable with the exemption reason', profile: 'all', strength: POLICY.SHOULD },
  { id: 'LUM-TOK-001', area: 'Tokens', requirement: 'all mandatory tokens present in every theme', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-TOK-002', area: 'Metadata', requirement: 'complete metadata, no pending fields', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-IDE-001', area: 'Surface hierarchy', requirement: 'surfaces discernible from each other', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-IDE-002', area: 'Neutral chroma', requirement: 'C <= profile.chroma.neutralMax', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-IDE-003', area: 'Surface chroma', requirement: 'C <= profile.chroma.surfaceMax', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-IDE-004', area: 'Accent chroma', requirement: 'profile.chroma.accentMin <= C <= profile.chroma.accentMax', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-IDE-005', area: 'Hue coherence', requirement: 'neutrals derive from the brand hue within +/- 5 deg', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-IDE-006', area: 'Scale monotonicity', requirement: 'primitive codes are monotonic in OKLCH lightness', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-IDE-007', area: 'Soft tint chroma', requirement: 'C <= profile.chroma.softMax for accent-soft tokens', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-IDE-008', area: 'Ramp smoothness', requirement: '0.02 <= |DeltaL| <= profile lightness step max between consecutive primitive steps', profile: 'AAA+', strength: POLICY.SHOULD },
  { id: 'LUM-AUD-001', area: 'Audit', requirement: 'reproducible, hashed report', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-EXC-001', area: 'Exceptions', requirement: 'registered, justified, dated', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-THE-001', area: 'Themes', requirement: 'light and dark present', profile: 'all', strength: POLICY.MUST },
  { id: 'LUM-THE-002', area: 'High contrast theme', requirement: 'present or forced-colors adaptation', profile: 'Integral', strength: POLICY.MUST },
];

/* ------------------------------------------------------------------ *
 * 8. Primitive ramp (spec section 4.4)
 *
 * v0.2 declared four token layers but never published the primitive one.
 * Codes are monotonic in OKLCH lightness by construction (LUM-IDE-006).
 * ------------------------------------------------------------------ */

export const PRIMITIVE_STEPS = [
  { step: 0, L: 1.0 },
  { step: 50, L: 0.978 },
  { step: 100, L: 0.955 },
  { step: 200, L: 0.905 },
  { step: 300, L: 0.845 },
  { step: 400, L: 0.755 },
  { step: 500, L: 0.655 },
  { step: 600, L: 0.555 },
  { step: 700, L: 0.455 },
  { step: 800, L: 0.36 },
  { step: 900, L: 0.27 },
  { step: 950, L: 0.205 },
  { step: 1000, L: 0.0 },
];

export const PRIMITIVE_FAMILIES = ['neutral', 'brand', 'success', 'warning', 'error', 'info'];

/** Chroma profile per primitive family, as a factor of the family base chroma. */
export const PRIMITIVE_CHROMA = {
  neutral: 0.014,
  brand: 0.17,
  success: 0.13,
  warning: 0.14,
  error: 0.15,
  info: 0.15,
};
