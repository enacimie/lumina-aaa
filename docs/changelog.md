# LUMINA Changelog

## 0.3.0: Formal rebuild (from the v0.2 audit)

The v0.2 JSON export was audited structurally and computationally. Every
defect found is listed below with its disposition. Version 0.3.0 is a full
regeneration from a formal OKLCH generator + auditor (`lib/`), not a patch.

### File/format defects (v0.2 JSON)

- All 4 assistant messages had `content: ""`; prose only existed in
  `content_list[].content`. Disposition: the source is retired to `archive/`; v0.3 is a
  specification, not a chat export.
- 51.6 % byte-identical duplication between `chat.messages` and
  `chat.history.messages`. Disposition: eliminated (single normative document).

### Wrong or unverifiable values

- 4 declared contrast ratios were wrong (e.g. `#374151` vs `#FFFFFF`
  declared 9.9, actually 10.31). Disposition: all ratios are now *measured on the
  published hex* by the auditor; nothing is hand-declared (sections 2.1 and 11.3).
- 4 hex values did not exist in any palette (invented). Disposition: impossible by
  construction: tokens are emitted only by the generator, and every audit
  check reads the same published values.
- No primitive layer was published despite being normative. Disposition: `tokens/primitives.json`
  is emitted and audited (LUM-TOK-001, LUM-IDE-006 monotonicity).

### Critical accessibility defects

- **Invisible focus indicator**: `focus.ring` equalled
  `interactive.primary.default` (CR 1.00 vs 3.2 required). Disposition: double-ring
  model (section 8 of the spec): outer ring vs page background, inner ring vs
  fill and ring; both audited as MUST.
- SC 2.4.13 was misinterpreted as "focus colour differs from fill". Disposition:
  Corrected: the criterion is the indicator area (the ring); the fill is a
  declared alias (`alias` pair class). SC 2.4.12 and SC 1.4.13, never cited
  in v0.2, are now covered.
- 53 % of mandatory tokens (31 of 59) were never audited; 2 referenced
  tokens were undefined. Disposition: the pair matrix covers all 59 roles (~107 pair
  kinds, 321 instantiations); coverage asserted by tests.
- Text-on-scrim was never prohibited. Disposition: LUM-COL-002 added and audited.
- Translucent input focus borders were declared AAA-safe. Disposition: measured
  after correct (single-pass, gamma-encoded) alpha composition:
  1.88:1 light / 2.26:1 dark; the requirement moved to the ring tokens and
  the border swap is a documented SHOULD.

### Colour-science errors

- Hue drift checks applied to achromatic/near-neutral colours (v0.2
  reported a spurious 158-degree "drift" for white). Disposition: `hueDifference` returns
  `null` below C = 0.005; drift checks apply only to chromatic colours
  (above the surface ceiling 0.04); lightness band L within [0.25, 0.95] guards
  quantisation noise (spec sections 9.3 and 10.1).
- State-change discrimination used a |DeltaL| band, a category error (DeltaL
  measures a ramp, not discriminability). Disposition: DeltaE2000 >= 5, with the Delta L* >= 4
  alternative only for both-achromatic pairs (CIEDE2000 compresses DeltaL far
  from L* = 50).
- Feedback tints in the dark theme collapsed to `#000000` because they
  were derived from a contrast ratio. Disposition: fixed lightness offsets instead
  (spec section 5.4).
- Chart series used golden-angle spread, blind to colour-vision
  deficiency. Disposition: greedy CVD-aware selection maximising minimum CIEDE2000
  under normal/deutan/protan/tritan simulation (spec section 5.5).
- `feedback.info` collided with `error` for red-brand systems (hue difference 0 degrees).
  Disposition: `MIN_HUE_SEPARATION = 14 deg` enforced between semantic anchors and brand
  hue.
- Neutral families carried false colour names (a C <= 0.02 slate labelled
  "green/orange/red"). Disposition: family naming derives from measured OKLCH hue.

### Normative gaps

- 16 functions referenced by v0.2 pseudocode were undefined. Disposition: all exist
  and are tested: `toOKLCH` (as `hexToOklch`), `generateNeutralRamp`,
  `generateSemanticRamps`, `generateDarkSurface`, `assignLightTheme` /
  `assignDarkTheme` (as `assignTheme`), `solvePrimary`, `solveSemanticRamps`,
  `assembleTokens`, `verifyAllPairs`, `adjustOrReject`, `validateColorVision`,
  `wcagContrast` / `contrast` (as `contrastRatio`), `select`, and
  `optimizeColor`. The solver's internal helpers (`solveAgainst`, `deriveHues`,
  `quantize`, `maxChromaAt`, `luminanceBounds`, `lightnessForLuminance`,
  `hueDifference`, `compositeAlpha`, `simulateCvd`, `deltaE2000`,
  `enforceHueSeparation`) are defined and tested too.
- RFC 2119 policy mapping was undefined. Disposition: the policy table in section 1; the auditor attaches
  `policy` to every check and `MUST` violations block certification.

### Verification added

- CIEDE2000 validated against all 34 Sharma-Wu-Dalal reference pairs
  (4 decimals, all pass).
- SHA-256/canonical JSON validated against FIPS 180-4 vectors.
- 53-test suite (`npm test`): colour science, hashing, architecture
  integrity, token grammar, generator determinism, audit outcomes.
- Robustness sweep: 25 brands x 3 profiles = 75 builds, 0 blocking
  failures; findings are always enumerated, never silently dropped.
- Alpha composition note: the original audit script double-encoded its
  composite (reported `#D9DFF2`/1.33:1); correct composition gives
  `#B0BCE3`/1.88:1. The conclusion (translucent focus borders fail) is
  unchanged; the number was corrected here first.

### Performance

- Build time reduced from ~11 s to ~4.2 s per palette (measured on an
  idle development machine; wall-clock cost is load-dependent and not
  normative) by memoising
  `hexToRgb`/`hexToOklch`/`hexToLab`/`relativeLuminance`/`contrastRatio`
  on hex keys and `maxChromaAt` on a (L, H) grid key.

## Hardening log (0.3.0 development history)

Fixes applied after the first full regeneration, in review order. Each is
enforced by the 53-test suite.

- **Test suite brought to green.** (49/49 at the time; 51/51 after the
  registry work below.) Failures found and fixed while
  running it: `parseTokenId` API mismatch; a test tolerance that assumed an
  exact inverse for the sRGB transfer function (residual is 9.7e-6, far
  below the 8-bit quantum, test rewritten to assert that); `compositeAlpha`
  test expectation corrected (see next item); `hueDifference` reference
  pair replaced (the original pair differed by 13.8 degrees, not 5).
- **Correction to our own audit**: the alpha-composition figure reported
  for translucent focus borders during the original review
  (`#D9DFF2`, 1.33:1) was produced by a script that re-encoded an
  already-gamma-encoded input.
  - Correct single-pass composition gives `#B0BCE3` (1.88:1 light) and
    `#47607F` (2.26:1 dark).
  - The conclusion (translucent input focus borders fail SC 2.4.13 in
    both themes, so the requirement is carried by the ring tokens) is
    unchanged; the numbers are now asserted by a test so they cannot
    drift again.
- **Achromatic brand hue**: a brand below `ACHROMATIC_EPSILON` (e.g.
  `#000000`) used to inherit hue 0 from `atan2(0, 0)`, silently becoming a
  red system. Now anchored to `NEUTRAL_BRAND_HUE = 255` (cool slate),
  documented in the spec (section 5.7).
- **State-change hue-drift guard**: the `|dH| <= 5` check now applies only
  when both colours are chromatic (above the surface chroma ceiling 0.04).
  A near-neutral fill read as neutral by definition; quantising one channel
  by one LSB rotated its hue by up to 8 degrees and produced false
  violations (the `#000000` build failed `dark::091` this way).
- **Overlay veil derivation**: the scrim veil was a hardcoded slate
  (`#070B14`), a ~60-degree hue outlier against teal brands. It is now
  solved per theme from the neutral family hue at the design alpha and
  target lightness; the residual hue-coherence warning disappeared.
- **Performance**: full build reduced from ~11 s to ~4.2 s (single thread,
  Node 22) by memoising `hexToRgb`, `hexToOklch`, `hexToLab`,
  `relativeLuminance` and `contrastRatio` on hex keys and `maxChromaAt` on
  a (L, H) grid key. The duplicate solver-level chroma cache was removed.
- **Robustness sweep re-run** (25 brands x 3 profiles = 75 builds):
  0 blocking failures in all 75; 55 certify with zero findings; the other
  20 emit only LUM-IDE-004 accent-chroma warnings (physically unavoidable
  at extreme contrast) or the documented inactive-control exemption notice.
- **Spec section 7.5 corrected**: disabled text is not reported as
  `not_applicable`; it is audited as class `advisory-text` (3.0:1, SHOULD,
  LUM-TXT-004) and solved to a design CR of 4.6. All 12 disabled pairs pass
  in the reference palette (3.36-9.44:1). The generator exceeds what WCAG
  requires for inactive controls (nothing).
- **Demo accessibility fixes**, found by inspecting the Firefox
  accessibility tree:
  - A wrapper `<label>` contained two inputs (invalid HTML; the hex
    input had zero associated labels); each control now has a real
    `<label for>` (visually hidden), and the field is a `role="group"`
    labelled by its visible caption.
  - An invalid `aria-details` pointing at an interactive control was
    removed; `autocomplete="off"` and a format hint via
    `aria-describedby` were added.
  - `input:disabled` / `select:disabled` now use the audited disabled
    tokens.
- **Requirement registry closed (final verification pass).** The new
  registry-coverage test surfaced four gaps of the exact class the system
  exists to prevent - declared requirements that no check ever emitted.
  - `LUM-DIS-002`: the auditor emitted it, the registry lacked it; added
    to the registry.
  - `LUM-COL-001`, `LUM-AUD-001`, `LUM-EXC-001`: registered, never
    emitted. The auditor now emits structure checks for them:
    - feedback text/icon channels per theme (`LUM-COL-001`, colour-only
      signalling);
    - the outer focus ring vs the page background per theme
      (`LUM-FOC-001`, the check that would have caught v0.2's CR 1.00
      focus ring);
    - the exception-registry invariant (`LUM-EXC-001`);
    - a report-digest self-check (`LUM-AUD-001`).
  - Three genuinely redundant ids were removed and their rules
    documented in spec section 9.5 (`LUM-TXT-003`, `LUM-TXT-005`,
    `LUM-STA-001`).
  - `LUM-FOC-003` (ring area, a CSS-level property) is registered with
    `scope: 'integration'` and enforced by a test on the consuming demo
    CSS.
  - The spec gained Appendix A, the complete normative requirement
    index, plus two stale cross-reference fixes (section 4.4, 9.4).
- **Artifacts**: tokens and audit report regenerated; reference hash
  `8310c587049be4baeddb9c3b5ff84618670b8cfb6bceae45ac5aa0e6262fdcfe`.
- **Final consistency pass.** Cross-references to the v0.2 section numbers
  were replaced by the v0.3 ones in the specification, the code comments and
  the paper; the profile table, the semantic hue anchors, the role-group
  counts, the pair-class list and the disabled-text design CR were corrected
  against the code. The paper's duplication figure (51.6 % to 50.0 %) and the
  sweep warning description (a LUM-NTX-005 distinctness warning, not an
  exemption notice) were re-derived from the archive and the audit. The
  figure generator now suppresses the PDF creation timestamp, so `figs/*.pdf`
  are byte-deterministic. The report hash is unchanged; only the token
  metadata notes and the derived `tokensHash` moved.
- **Audit-fix pass (2026-11-10).** The `exceptThemes` guard in `lib/audit.js`
  returned `not_applicable` for every theme instead of only the listed one,
  which silently exempted the surface-distinctness pairs in the light and
  dark themes. With the guard fixed, those pairs are audited: the reference
  palette reports 5 SHOULD-level distinctness findings (the surfaces are
  deliberately close, because hierarchy is carried by borders and elevation),
  and the enhanced sweep profiles report the same 5 findings per build. The
  report hash moves to
  `8310c587049be4baeddb9c3b5ff84618670b8cfb6bceae45ac5aa0e6262fdcfe`; the
  token values and `tokensHash` are unchanged. Two regression tests were
  added (`exceptThemes` scope and role coverage), bringing the suite to 53.

## Post-release additions (2026-01-11)

The system version is unchanged (0.3.0). These additions cover validation and
the study apparatus.

### Audit metric correction

- `computeMetrics` reports the AAA compliance rate over body text (text and
  text-large) only. The advisory pairs (disabled text, which WCAG exempts from
  any minimum) are reported as a separate `advisory_text_compliance_rate`.
  The previous rate mixed the two and understated conformance. The report hash
  is unchanged.

### Independent AAA verification

- `tools/aaa-verify.mjs` is a second opinion that imports nothing from `lib/`.
  It recomputes the WCAG 2.2 contrast of every audited pair from the published
  hex values with a from-scratch implementation of the relative-luminance
  formula. It also loads the demo in headless Chrome and recomputes the
  contrast of every rendered text node from the browser's computed styles,
  classifying each node against the AAA thresholds and against the audit's own
  pair classes.
- `docs/paper/data/aaa-verification.json`: 222 audited pairs recomputed, 0
  arithmetic disagreements, 0 verdict disagreements, 0 AAA failures; 177
  rendered text nodes, 0 failures. The 29 rendered text pairs outside the pair
  matrix all clear AAA.
- `demo/demo.js`: the certification panel now uses the feedback background that
  matches its text colour, so the heading pair is an audited pair. The dark
  theme previously rendered the success text on the raised background at 6.68:1
  (below the 7:1 AAA threshold).

### Study apparatus

- `tools/make-stimuli.mjs` corrected. The target CIEDE2000 is now the distance
  between the two states, not the distance from the background. The achromatic
  pairs now start from a neutral, not from the brand colour. The generator
  verifies that both states keep a 7:1 text contrast against the background,
  and emits both the raw pair (clinical cohort) and the simulated pair
  (simulation cohort).
- `demo/study/`: two cohorts. The simulation cohort (normal vision) judges the
  simulated pair; the clinical cohort (diagnosed dichromacy) judges the raw
  pair for its own deficiency. The practice block (10 trials, with feedback)
  hands over to the main block (640 trials for simulation, 160 for clinical).
- `docs/paper/study-protocol.md`: the design gains the clinical cohort, the
  stimulus description matches the generator, and the analysis plan compares
  the clinical threshold with the simulation threshold.
- `tools/study-e2e.mjs`: headless end-to-end check of both cohorts, the
  practice handover and the pair each cohort sees.

## 0.2.0 (archived)

Original chat-export specification; superseded. Retained for evidence in
`archive/chat-export-1788860678731.json`.
