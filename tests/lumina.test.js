/**
 * LUMINA-AAA test suite. No dependencies; runs on the Node built-in runner.
 *   node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACHROMATIC_EPSILON,
  hexToOklch,
  hexToLab,
  hueDifference,
  isChromatic,
  contrastRatio,
  compositeAlpha,
  deltaE2000,
  deltaE2000Lab,
  hexToRgb,
  linearize,
  delinearize,
  luminanceBounds,
  maxChromaAt,
  oklchToHex,
  relativeLuminance,
  rgbToHex,
  simulateCvd,
  CVD_MATRICES,
  CVD_TYPES,
} from '../lib/color.js';

import {
  PAIR_MATRIX,
  PROFILES,
  REQUIREMENTS,
  ROLE_COUNT,
  TOKEN_ROLES,
  MUST_BE_DISTINCT,
  SHOULD_BE_DISTINCT,
  THEMES,
  PRIMITIVE_STEPS,
} from '../lib/architecture.js';

import { sha256, canonicalJson, digest } from '../lib/hash.js';
import { readFileSync } from 'node:fs';
import { buildPalette, generatePalette, mulberry32, solvePrimary, deriveHues, solveChartSeries } from '../lib/index.js';
import { parseTokenId, tokenId } from '../lib/generate.js';

const REFERENCE_BRAND = '#1E40AF';

/* ================================================================== *
 * 1. Colour science
 * ================================================================== */

test('OKLab/OKLCH matches the canonical reference values', () => {
  // Reference values from Bjorn Ottosson's publication and CSS Color 4.
  const cases = [
    ['#FF0000', 0.6280, 0.2577, 29.234],
    ['#00FF00', 0.8664, 0.2948, 142.495],
    ['#0000FF', 0.4520, 0.3132, 264.052],
    ['#FFFFFF', 1.0, 0.0, null],
    ['#000000', 0.0, 0.0, null],
  ];
  for (const [hex, L, C, H] of cases) {
    const o = hexToOklch(hex);
    assert.ok(Math.abs(o.L - L) < 2e-4, `${hex} L ${o.L} != ${L}`);
    assert.ok(Math.abs(o.C - C) < 2e-4, `${hex} C ${o.C} != ${C}`);
    if (H === null) assert.ok(o.C < ACHROMATIC_EPSILON, `${hex} should be treated as achromatic`);
    else assert.ok(Math.abs(o.H - H) < 2e-3, `${hex} H ${o.H} != ${H}`);
  }
});

test('sRGB transfer function round-trips below the 8-bit quantum', () => {
  // The inverse cannot be exact through two transcendental operations; what
  // matters is that the residual is far below one 8-bit step (1/255 = 3.9e-3),
  // so no published hex can be affected by it.
  for (let i = 0; i <= 255; i += 1) {
    const v = i / 255;
    const back = delinearize(linearize(v));
    assert.ok(Math.abs(back - v) < 1e-5, `channel ${i}: residual ${Math.abs(back - v)}`);
  }
});

test('WCAG relative luminance matches the specification weights', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#FFFFFF'), 1);
  assert.ok(Math.abs(relativeLuminance('#00FF00') - 0.7152) < 1e-6);
  assert.ok(Math.abs(relativeLuminance('#FF0000') - 0.2126) < 1e-6);
  assert.ok(Math.abs(relativeLuminance('#0000FF') - 0.0722) < 1e-6);
});

test('WCAG contrast ratio reproduces known threshold greys', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 1e-9);
  // 4.54:1 is the classic minimum-AA grey; 4.48:1 for one step lighter
  assert.ok(Math.abs(contrastRatio('#767676', '#FFFFFF') - 4.54) < 0.01);
  assert.ok(Math.abs(contrastRatio('#777777', '#FFFFFF') - 4.48) < 0.01);
  assert.ok(Math.abs(contrastRatio('#595959', '#FFFFFF') - 7.0) < 0.02);
});

test('CIEDE2000 reproduces all 34 Sharma-Wu-Dalal reference pairs to 4 dp', () => {
  const S = [
    [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
    [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
    [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
    [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
    [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
    [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
    [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
    [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
    [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
    [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
    [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
    [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
    [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
    [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
    [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
    [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
    [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
    [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
    [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
    [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
    [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
    [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
    [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
    [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
    [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
    [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
    [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
    [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
    [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
    [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
    [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
    [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
    [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
    [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082],
  ];
  const failures = [];
  for (let i = 0; i < S.length; i += 1) {
    const [L1, a1, b1, L2, a2, b2, expected] = S[i];
    const got = deltaE2000Lab({ L: L1, a: a1, b: b1 }, { L: L2, a: a2, b: b2 });
    if (Math.abs(got - expected) >= 5e-5) failures.push(`pair ${i + 1}: expected ${expected}, got ${got}`);
  }
  assert.deepEqual(failures, []);
});

test('CVD matrices are row-stochastic', () => {
  for (const [type, m] of Object.entries(CVD_MATRICES)) {
    for (const row of m) assert.ok(Math.abs(row[0] + row[1] + row[2] - 1) < 1e-5, `${type} row does not sum to 1`);
  }
  assert.deepEqual(CVD_TYPES, ['protanopia', 'deuteranopia', 'tritanopia']);
});

test('CVD simulation leaves achromatic colours unchanged', () => {
  for (const type of CVD_TYPES) {
    for (const hex of ['#000000', '#FFFFFF', '#808080']) {
      assert.equal(simulateCvd(hex, type), hex, `${hex} under ${type}`);
    }
  }
});

test('alpha composition follows gamma-encoded sRGB, as CSS does', () => {
  // CSS blends the 8-bit sRGB values: 0.35*30 + 0.65*255 = 176 = 0xB0
  assert.equal(rgbToHex(compositeAlpha('#1E40AF', 0.35, '#FFFFFF')), '#B0BCE3');
  assert.equal(rgbToHex(compositeAlpha('#000000', 0.5, '#FFFFFF')), '#808080');
  // Composition must happen exactly once. A reviewer's script that re-encodes
  // the gamma-encoded input reports #D9DFF2 (CR 1.33) instead of #B0BCE3
  // (CR 1.88) - the conclusion survives, the number does not.
  assert.notEqual(rgbToHex(compositeAlpha('#1E40AF', 0.35, '#FFFFFF')), '#D9DFF2');
});

test('hue difference is undefined for achromatic colours, not a number', () => {
  // Pure white and a near-white: v0.2 produced a spurious 158 degree drift here.
  assert.equal(hueDifference('#FFFFFF', '#F8FAFC'), null);
  assert.equal(hueDifference('#000000', '#101014'), null);
  assert.ok(hueDifference('#1E40AF', '#1E3A8A') <= 5 + 1e-9);
  assert.ok(Math.abs(hueDifference('#FF0000', '#00FF00') - 113.2614) < 1e-3);
});

test('luminance bounds implement the section 5.2 feasibility test', () => {
  const b = luminanceBounds(0.95, 7.5);
  assert.ok(Math.abs(b.darkerMax - 0.0833) < 1e-3);
  assert.ok(b.feasible);
  const impossible = luminanceBounds(1.0, 100);
  assert.equal(impossible.feasible, false);
});

test('maxChromaAt stays inside the sRGB gamut', () => {
  for (const H of [0, 45, 90, 140, 200, 265, 300, 340]) {
    for (const L of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const C = maxChromaAt(L, H);
      const hex = oklchToHex({ L, C: C + 0.02, H });
      const back = hexToOklch(hex);
      for (const v of [hexToRgb(hex).r, hexToRgb(hex).g, hexToRgb(hex).b]) {
        assert.ok(v >= -1e-6 && v <= 1 + 1e-6, `out of gamut at L=${L} H=${H}`);
      }
      assert.ok(back.C <= C + 0.03, `chroma not reduced at L=${L} H=${H}`);
    }
  }
});

test('oklchToHex round-trips for in-gamut colours', () => {
  for (const hex of ['#1E40AF', '#93C5FD', '#0F172A', '#7C2D12', '#86EFAC', '#00FF00', '#808080']) {
    const o = hexToOklch(hex);
    assert.equal(oklchToHex(o), hex, hex);
  }
});

test('rgb hex helpers round-trip', () => {
  assert.deepEqual(hexToRgb('#123456'), { r: 0x12 / 255, g: 0x34 / 255, b: 0x56 / 255 });
  assert.equal(rgbToHex({ r: 0x12 / 255, g: 0x34 / 255, b: 0x56 / 255 }), '#123456');
  assert.equal(rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
  assert.equal(rgbToHex({ r: 1, g: 1, b: 1 }), '#FFFFFF');
});

/* ================================================================== *
 * 2. Hashing
 * ================================================================== */

test('SHA-256 matches the FIPS 180-4 test vectors', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256('The quick brown fox jumps over the lazy dog'),
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
  );
});

test('canonical JSON is order-independent', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.equal(digest({ b: 1, a: 2 }), digest({ a: 2, b: 1 }));
  assert.notEqual(digest({ a: 1 }), digest({ a: 2 }));
});

/* ================================================================== *
 * 3. Architecture integrity
 * ================================================================== */

test('the mandatory token set has 59 unique roles', () => {
  assert.equal(TOKEN_ROLES.length, 59);
  assert.equal(new Set(TOKEN_ROLES.map((r) => r.role)).size, 59);
  assert.equal(ROLE_COUNT, 59);
});

test('every mandatory role appears in at least one audited pair', () => {
  const used = new Set();
  for (const p of PAIR_MATRIX) {
    used.add(p.foreground);
    used.add(p.background);
  }
  const missing = TOKEN_ROLES.map((r) => r.role).filter((r) => !used.has(r));
  assert.deepEqual(missing, [], `roles never audited: ${missing.join(', ')}`);
});

test('no pair references a token that is not in the mandatory set', () => {
  // v0.2 referenced interactive.primary.border and interactive.secondary.border,
  // which did not exist anywhere.
  const known = new Set(TOKEN_ROLES.map((r) => r.role));
  const unknown = PAIR_MATRIX.flatMap((p) => [p.foreground, p.background]).filter((r) => !known.has(r));
  assert.deepEqual(unknown, [], `pairs reference undefined tokens: ${unknown.join(', ')}`);
});

test('exceptThemes applies only to the listed theme', () => {
  const { report } = REFERENCE;
  const find = (theme) => report.pairs.find((p) => p.theme === theme
    && p.foreground_token === 'background.default' && p.background_token === 'background.surface');
  const light = find('light');
  const dark = find('dark');
  const contrast = find('contrast');
  assert.notEqual(light.status, 'not_applicable', 'light must audit the pair');
  assert.notEqual(dark.status, 'not_applicable', 'dark must audit the pair');
  assert.equal(contrast.status, 'not_applicable', 'contrast is the excepted theme');
});

test('roles without a measured pair are documented exemptions', () => {
  const { report } = REFERENCE;
  const measured = new Set();
  for (const p of report.pairs) {
    if (p.status === 'pass' || p.status === 'fail' || p.status === 'warning' || p.status === 'exception') {
      measured.add(p.foreground_token);
      measured.add(p.background_token);
    }
  }
  const unmeasured = TOKEN_ROLES.map((r) => r.role).filter((r) => !measured.has(r));
  // border.subtle and chart.grid are declared exempt (decorative separator,
  // non-essential gridlines). Every other role must receive a measurement.
  assert.deepEqual(unmeasured.sort(), ['border.subtle', 'chart.grid']);
});

test('large text is audited, unlike v0.2', () => {
  const large = PAIR_MATRIX.filter((p) => p.class === 'text-large');
  assert.ok(large.length >= 4, 'LUM-TXT-002 needs auditable usages');
});

test('no text pair is declared against the scrim', () => {
  // LUM-COL-002: essential text never sits on background.overlay
  const offenders = PAIR_MATRIX.filter(
    (p) => p.background === 'background.overlay' && (p.class === 'text' || p.class === 'text-large'),
  );
  assert.equal(offenders.length, 0);
});

test('requirement identifiers are unique and pair requirements resolve', () => {
  const ids = REQUIREMENTS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const known = new Set(ids);
  const unresolved = PAIR_MATRIX.filter((p) => p.requirement && !known.has(p.requirement)).map((p) => p.requirement);
  assert.deepEqual([...new Set(unresolved)], []);
});

test('every requirement emitted by the audit resolves in the registry', () => {
  const known = new Set(REQUIREMENTS.map((r) => r.id));
  const emitted = new Set();
  for (const section of ['pairs', 'token_checks', 'distinctness_checks', 'primitive_checks', 'structure_checks']) {
    for (const item of REFERENCE.report[section]) {
      assert.ok(item.requirement, `${section} item without requirement id`);
      emitted.add(item.requirement);
    }
  }
  const unresolved = [...emitted].filter((id) => !known.has(id));
  assert.deepEqual(unresolved, [], `requirements emitted but not in the registry: ${unresolved.join(', ')}`);
  // every registered requirement is either exercised by the token audit or
  // explicitly scoped to integration (verified against the consuming CSS)
  const integration = new Set(REQUIREMENTS.filter((r) => r.scope === 'integration').map((r) => r.id));
  const unused = [...known].filter((id) => !emitted.has(id) && !integration.has(id));
  assert.deepEqual(unused, [], `registered requirements never emitted: ${unused.join(', ')}`);
});

test('LUM-FOC-003 integration: consuming CSS renders a >= 2 CSS px double ring', () => {
  const css = readFileSync(new URL('../demo/demo.css', import.meta.url), 'utf8');
  const outline = css.match(/outline:\s*var\(--lum-focus-ring-width,\s*(\d+)px\)\s+solid var\(--lum-focus-ring\)/);
  assert.ok(outline, 'focus-visible outline must use --lum-focus-ring-width with a >= 2px fallback');
  assert.ok(Number(outline[1]) >= 2, `focus ring fallback width ${outline[1]}px is below 2 CSS px`);
  const inner = css.match(/box-shadow:\s*0 0 0 calc\(var\(--lum-focus-ring-width,\s*\d+px\)\s*\+\s*var\(--lum-focus-gap,\s*2px\)\)\s+var\(--lum-focus-inner\)/);
  assert.ok(inner, 'the double ring must draw focus.inner outside focus.ring (section 8)');
});

test('distinctness lists reference defined tokens', () => {
  const known = new Set(TOKEN_ROLES.map((r) => r.role));
  for (const [a, b] of MUST_BE_DISTINCT) {
    assert.ok(known.has(a) && known.has(b), `${a}/${b}`);
  }
  for (const entry of SHOULD_BE_DISTINCT) {
    assert.ok(known.has(entry.pair[0]) && known.has(entry.pair[1]), entry.pair.join('/'));
  }
});

test('profiles expose the thresholds the specification declares', () => {
  assert.equal(PROFILES['wcag-aaa'].contrast.text, 7.0);
  assert.equal(PROFILES['aaa-plus'].contrast.text, 7.5);
  assert.equal(PROFILES['aaa-plus'].contrast['text-large'], 5.0);
  assert.equal(PROFILES.integral.contrast['text-large'], 7.5);
  assert.equal(PROFILES['aaa-plus'].stateChange.deltaE2000, 5.0);
  assert.equal(PROFILES['aaa-plus'].chroma.neutralMax, 0.02);
  assert.ok(PROFILES.integral.requiresHighContrastTheme);
  assert.ok(!PROFILES['aaa-plus'].requiresHighContrastTheme);
});

test('primitive steps are monotonic in lightness by construction', () => {
  for (let i = 1; i < PRIMITIVE_STEPS.length; i += 1) {
    assert.ok(PRIMITIVE_STEPS[i].L <= PRIMITIVE_STEPS[i - 1].L, `step ${i} increases lightness`);
  }
});

/* ================================================================== *
 * 4. Token identity grammar (section 13.1)
 * ================================================================== */

test('token ids follow the single declared grammar', () => {
  const examples = [
    tokenId('light', 'semantic', 'text.primary'),
    tokenId('dark', 'semantic', 'interactive.primary.hover'),
    tokenId('light', 'component', 'button.primary.background.focus'),
    tokenId('dark', 'semantic', 'feedback.error.text'),
  ];
  for (const id of examples) {
    const parsed = parseTokenId(id);
    assert.ok(parsed.segmentCount >= 2 && parsed.segmentCount <= 5, id);
    assert.equal(parsed.rolePath.split('.').length, parsed.segmentCount, id);
    assert.ok(['light', 'dark', 'contrast'].includes(parsed.theme), id);
    assert.ok(['primitive', 'semantic', 'component'].includes(parsed.layer), id);
  }
  assert.throws(() => parseTokenId('notlumina.light.semantic.text.primary'));
  assert.throws(() => parseTokenId('lumina.bogus.semantic.text.primary'));
});

/* ================================================================== *
 * 5. Generator
 * ================================================================== */

const REFERENCE = buildPalette({ brand: REFERENCE_BRAND, profile: 'integral', seed: 20260908 });

test('the reference palette certifies at LUMINA Integral with zero blocking failures', () => {
  const { report } = REFERENCE;
  assert.equal(report.certification.certifiable, true, JSON.stringify(report.certification.failure_ids));
  assert.equal(report.certification.blocking_failures, 0);
  // Five SHOULD-level distinctness findings: the light and dark surfaces are
  // closer than DeltaE2000 >= 5, because surface hierarchy is carried by
  // borders and elevation. They do not block certification.
  assert.equal(report.certification.warnings, 5);
  assert.equal(report.certification.level, 'LUMINA Integral Certified');
});

test('every theme resolves all 59 roles', () => {
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    assert.equal(Object.keys(theme.values).length, 59, theme.name);
  }
  assert.deepEqual(Object.keys(REFERENCE.palette.themes).sort(), ['contrast', 'dark', 'light']);
});

test('generation is deterministic for identical inputs', () => {
  const a = generatePalette({ brand: REFERENCE_BRAND, profile: 'integral', seed: 7 });
  const b = generatePalette({ brand: REFERENCE_BRAND, profile: 'integral', seed: 7 });
  assert.deepEqual(a.themes, b.themes);
  assert.deepEqual(a.tokens, b.tokens);
  const c = generatePalette({ brand: REFERENCE_BRAND, profile: 'integral', seed: 8 });
  assert.notDeepEqual(a.tokens, c.tokens, 'a different seed should be able to differ');
});

test('mulberry32 is deterministic', () => {
  const a = mulberry32(1);
  const b = mulberry32(1);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
});

test('every published token is inside the sRGB gamut', () => {
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    for (const [role, hex] of Object.entries(theme.values)) {
      assert.match(hex, /^#[0-9A-F]{6}$/, `${role}: ${hex}`);
      const { r, g, b } = hexToRgb(hex);
      for (const v of [r, g, b]) assert.ok(v >= 0 && v <= 1, `${role} out of gamut`);
    }
  }
});

test('every token records its own measured luminance and OKLCH', () => {
  for (const themeTokens of Object.values(REFERENCE.palette.tokens)) {
    for (const token of themeTokens) {
      assert.ok(Number.isFinite(token.relativeLuminance), token.id);
      assert.ok(Number.isFinite(token.oklch.l), token.id);
      assert.ok(Number.isFinite(token.oklch.c), token.id);
      assert.ok(Number.isFinite(token.oklch.h), token.id);
      assert.ok(token.derived.solvedBy, `${token.id} has no provenance`);
      assert.equal(token.contrastTargets.length, 0, 'targets are attached by the report, not pre-filled');
    }
  }
});

test('the focus indicator is the section 8 double ring, not a colour swap', () => {
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    const v = theme.values;
    // the ring must not be the fill it surrounds (the v0.2 critical defect)
    assert.notEqual(v['focus.ring'], v['interactive.primary.default'], theme.name);
    assert.notEqual(v['focus.inner'], v['interactive.primary.default'], theme.name);
    // and the two rings must be tellable apart
    assert.notEqual(v['focus.ring'], v['focus.inner'], theme.name);
    // the ring must reach the focus threshold against the page
    assert.ok(contrastRatio(v['focus.ring'], v['background.default']) >= PROFILES.integral.contrast.focus, theme.name);
    // the inner ring must reach it against the fill and against the outer ring
    assert.ok(contrastRatio(v['focus.inner'], v['interactive.primary.default']) >= PROFILES.integral.contrast.focus, theme.name);
    assert.ok(contrastRatio(v['focus.inner'], v['focus.ring']) >= PROFILES.integral.contrast.focus, theme.name);
  }
});

test('the focus fill is a declared alias of the default fill', () => {
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    const v = theme.values;
    assert.equal(v['interactive.primary.focus'], v['interactive.primary.default'], theme.name);
  }
});

test('text reaches the profile threshold on every background it is audited against', () => {
  const tau = PROFILES.integral.contrast.text;
  const backgrounds = ['background.default', 'background.surface', 'background.subtle', 'background.raised', 'background.disabled'];
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    for (const fg of ['text.primary', 'text.secondary']) {
      for (const bg of backgrounds) {
        const cr = contrastRatio(theme.values[fg], theme.values[bg]);
        assert.ok(cr >= tau, `${theme.name} ${fg} on ${bg} = ${cr.toFixed(2)}`);
      }
    }
  }
});

test('the primary label keeps its threshold in every interactive state', () => {
  const tau = PROFILES.integral.contrast.text;
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    for (const state of ['default', 'hover', 'active', 'focus']) {
      const cr = contrastRatio(theme.values['text.on-primary'], theme.values[`interactive.primary.${state}`]);
      assert.ok(cr >= tau, `${theme.name} on-primary over ${state} = ${cr.toFixed(2)}`);
    }
  }
});

test('neutrals respect their own chroma ceiling', () => {
  const max = PROFILES.integral.chroma.neutralMax;
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    for (const role of ['text.primary', 'text.secondary', 'border.default', 'border.strong', 'focus.ring', 'focus.inner']) {
      const C = hexToOklch(theme.values[role]).C;
      assert.ok(C <= max, `${theme.name} ${role} C=${C.toFixed(4)} > ${max}`);
    }
  }
});

test('accents stay inside the accent chroma band', () => {
  const { accentMin, accentMax } = PROFILES.integral.chroma;
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    for (const role of ['text.link', 'interactive.primary.default', 'border.focus']) {
      const C = hexToOklch(theme.values[role]).C;
      assert.ok(C >= accentMin && C <= accentMax, `${theme.name} ${role} C=${C.toFixed(4)}`);
    }
  }
});

test('primitive ramps are monotonic in published lightness', () => {
  for (const [family, ramp] of Object.entries(REFERENCE.palette.primitives)) {
    let prev = Infinity;
    for (const entry of ramp) {
      const L = hexToOklch(entry.value).L;
      assert.ok(L <= prev + 1e-4, `${family} step ${entry.step} is not monotonic`);
      prev = L;
    }
  }
});

test('chart series are separable under dichromacy', () => {
  const min = PROFILES.integral.cvd.deltaE2000Min;
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    const series = [1, 2, 3, 4, 5, 6].map((i) => theme.values[`chart.series.${i}`]);
    for (let i = 0; i < series.length; i += 1) {
      for (let j = i + 1; j < series.length; j += 1) {
        for (const type of CVD_TYPES) {
          const d = deltaE2000(simulateCvd(series[i], type), simulateCvd(series[j], type));
          assert.ok(d >= min, `${theme.name} series ${i + 1}/${j + 1} under ${type} = ${d.toFixed(2)}`);
        }
      }
    }
  }
});

test('solvePrimary rejects a genuinely infeasible constraint set instead of emitting a bad token', () => {
  // A white label needs a dark fill, while a black page needs a fill at least
  // 3.39:1 away from black, i.e. a light one. No colour satisfies both, so the
  // solver must report the infeasibility rather than silently emit something.
  assert.throws(
    () => solvePrimary({
      hue: 95, chroma: 0.2, label: '#FFFFFF', design: { cr: 12, hoverDL: -0.06, activeDL: -0.12 },
      profile: PROFILES.integral, polarity: 'light', surface: '#000000', ring: '#888888', margin: 0.06,
    }),
    /infeasible primary scale/,
  );
});

test('deriveHues keeps semantic families separated from the brand hue', () => {
  // A red brand used to pull the error anchor onto the info anchor, which made
  // the two icons quantise to the same value.
  for (const brand of ['#E11D48', '#DC2626', '#FF0000', '#F43F5E', '#FF6B00']) {
    const { hues } = deriveHues(brand, 1);
    assert.ok(hueDistance(hues.error, hues.info) >= 14, `${brand}: error/info ${hues.error} vs ${hues.info}`);
    assert.ok(hueDistance(hues.warning, hues.info) >= 14, `${brand}: warning/info`);
    assert.ok(hueDistance(hues.success, hues.info) >= 14, `${brand}: success/info`);
  }
});

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

test('solveChartSeries returns mutually separable series', () => {
  const picked = solveChartSeries({
    backgrounds: ['#FFFFFF', '#FFFFFF'],
    targets: [6.4, 3.9],
    brandHue: 265,
    phase: 12,
    chroma: 0.17,
    tau: 3.392,
    profile: PROFILES.integral,
    band: { min: 0.06, max: 0.25 },
    count: 6,
  });
  assert.equal(picked.length, 6);
  for (let i = 0; i < picked.length; i += 1) {
    for (let j = i + 1; j < picked.length; j += 1) {
      assert.notEqual(picked[i].hex, picked[j].hex, `${i}/${j}`);
      for (const type of CVD_TYPES) {
        const d = deltaE2000(simulateCvd(picked[i].hex, type), simulateCvd(picked[j].hex, type));
        assert.ok(d >= PROFILES.integral.cvd.deltaE2000Min, `${i}/${j} ${type} ${d.toFixed(2)}`);
      }
    }
  }
});

test('every chart series reaches the non-textual threshold', () => {
  const tau = PROFILES.integral.contrast['non-text'];
  for (const theme of Object.values(REFERENCE.palette.themes)) {
    for (let i = 1; i <= 6; i += 1) {
      const cr = contrastRatio(theme.values[`chart.series.${i}`], theme.values['chart.background']);
      assert.ok(cr >= tau, `${theme.name} series ${i} = ${cr.toFixed(2)}`);
    }
  }
});

test('achromatic and degenerate brand colours still certify', () => {
  for (const brand of ['#000000', '#FFFFFF', '#808080']) {
    const { report } = buildPalette({ brand, profile: 'integral', seed: 1 });
    assert.equal(report.certification.certifiable, true, `${brand}: ${report.certification.failure_ids.join(', ')}`);
  }
});

test('the report hash is stable across repeated audits of identical input', async () => {
  const { auditPalette } = await import('../lib/audit.js');
  const a = auditPalette(REFERENCE.palette, { timestamp: '2026-01-01T00:00:00.000Z' });
  const b = auditPalette(REFERENCE.palette, { timestamp: '2099-12-31T00:00:00.000Z' });
  assert.equal(a.report.hash, b.report.hash, 'the hash must not depend on the timestamp');
});

test('the report hash changes if any token value changes', async () => {
  const { auditPalette } = await import('../lib/audit.js');
  const a = auditPalette(REFERENCE.palette);
  const tampered = JSON.parse(JSON.stringify(REFERENCE.palette));
  tampered.themes.light.values['text.secondary'] = '#111111';
  const b = auditPalette(tampered);
  assert.notEqual(a.report.hash, b.report.hash);
});

test('metrics are coherent with the pair results', () => {
  const { report } = REFERENCE;
  assert.ok(report.metrics.aaa_compliance_rate >= 90);
  assert.ok(report.metrics.non_text_compliance_rate === 100);
  assert.ok(report.metrics.contrast_min >= PROFILES.integral.contrast['non-text']);
  for (const [name, t] of Object.entries(report.metrics.by_theme)) {
    assert.equal(t.fail, 0);
    assert.equal(t.pending, 0);
    // SHOULD-level surface-distinctness findings: 3 in light, 2 in dark, 0 in contrast.
    const expected = name === 'light' ? 3 : name === 'dark' ? 2 : 0;
    assert.equal(t.warning, expected, `${name} warnings`);
  }
});

test('every reported not_applicable carries a documented reason', () => {
  for (const p of REFERENCE.report.pairs.filter((x) => x.status === 'not_applicable')) {
    assert.ok(p.reason, `${p.pair_id} has no reason`);
  }
});

test('the three conformance profiles all certify on the reference brand', () => {
  for (const profile of ['wcag-aaa', 'aaa-plus', 'integral']) {
    const { report } = buildPalette({ brand: REFERENCE_BRAND, profile, seed: 20260908 });
    assert.equal(report.certification.certifiable, true, `${profile}: ${report.certification.failure_ids.join(', ')}`);
  }
});

/* ================================================================== *
 * 13. Independent AAA verification and study stimuli
 * ================================================================== */

test('the independent WCAG 2.2 implementation matches the library on sampled pairs', async () => {
  const { contrast } = await import('../tools/aaa-verify.mjs');
  const pairs = [
    ['#000000', '#FFFFFF'],
    ['#777777', '#FFFFFF'],
    ['#1E40AF', '#F5F7FD'],
    ['#93C5FD', '#151821'],
    ['#2548AF', '#FFFFFF'],
    ['#F5F7FD', '#1E40AF'],
  ];
  for (const [a, b] of pairs) {
    assert.ok(Math.abs(contrast(a, b) - contrastRatio(a, b)) < 1e-12, `${a}/${b}`);
  }
});

test('the independent token-pair check agrees with the audit on the reference palette', async () => {
  const { checkTokenPairs } = await import('../tools/aaa-verify.mjs');
  const result = checkTokenPairs(REFERENCE.report);
  assert.ok(result.pairs_checked >= 200, `checked ${result.pairs_checked}`);
  assert.equal(result.math_disagreements, 0);
  assert.equal(result.verdict_disagreements, 0);
  assert.equal(result.aaa_failures, 0);
});

test('the stimulus target is the CIEDE2000 between the two states', async () => {
  const { generateStimuli } = await import('../tools/make-stimuli.mjs');
  const { conditions } = generateStimuli();
  assert.equal(conditions.length, 64);
  for (const c of conditions) {
    assert.ok(Math.abs(c.measured_deltaE2000 - c.target_deltaE2000) < 0.6,
      `${c.background}/${c.view}/${c.type}/${c.target_deltaE2000}: ${c.measured_deltaE2000}`);
    assert.ok(c.contrast_ok,
      `${c.background}/${c.view}/${c.type}: base ${c.contrast_base} variant ${c.contrast_variant}`);
    assert.notEqual(c.base_hex, c.variant_hex);
  }
});

test('achromatic stimuli start from a neutral', async () => {
  const { generateStimuli } = await import('../tools/make-stimuli.mjs');
  const { conditions } = generateStimuli();
  for (const c of conditions.filter((x) => x.type === 'achromatic')) {
    assert.ok(hexToOklch(c.base_hex).C < 0.005, `${c.background}: base chroma ${hexToOklch(c.base_hex).C}`);
    assert.ok(hexToOklch(c.variant_hex).C < 0.005, `${c.background}: variant chroma ${hexToOklch(c.variant_hex).C}`);
  }
});

test('the simulated pair hits the same target difference', async () => {
  const { generateStimuli } = await import('../tools/make-stimuli.mjs');
  const { conditions } = generateStimuli();
  for (const c of conditions) {
    if (c.view === 'normal') {
      assert.equal(c.base_simulated, c.base_hex);
      assert.equal(c.variant_simulated, c.variant_hex);
    } else {
      // A neutral can survive a dichromacy simulation unchanged, so the pair
      // identity is not the invariant; the measured difference is.
      const d = deltaE2000(c.base_simulated, c.variant_simulated);
      assert.ok(Math.abs(d - c.target_deltaE2000) < 0.6,
        `${c.background}/${c.view}/${c.type}/${c.target_deltaE2000}: ${d.toFixed(2)}`);
    }
  }
});
