# LUMINA-AAA: Formal Specification of Accessible Colour Systems

**Version 0.3.0. Algorithm 1.0.0. WCAG 2.2. Status: normative**

This document defines LUMINA, a deterministic generator and verifier for
WCAG 2.2 AAA colour systems. Everything stated here is implemented by
`lib/` and enforced by the audit in `lib/audit.js`; a palette that has not
been certified by that audit MUST NOT be described as LUMINA.

The reference values in this document were produced by
`buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 })`.

---

## 1. Conformance language

The key words MUST, MUST NOT, SHOULD, MAY are to be interpreted as described
in RFC 2119, mapped to audit policy as follows:

| Keyword | Audit policy      | Effect on certification      |
| ------- | ----------------- | ---------------------------- |
| MUST    | `requirement`     | violation blocks certification |
| SHOULD  | `recommendation`  | violation is reported as a warning |
| MAY     | `option`          | violation is not reported    |

Audit statuses: `pass`, `fail`, `warning`, `exception`, `not_applicable`,
`pending`. A pair exempt by WCAG (e.g. inactive controls, SC 1.4.3) or by an
explicit `exempt` / `exceptThemes` declaration reports `not_applicable` with
a reason; it never silently passes.

## 2. Colour model

2.1 All generation and verification is performed in **OKLCH** (CSS Color 4),
with publication as 8-bit sRGB hex (`#RRGGBB`). Publication is the only
quantisation step; every criterion is evaluated **on the published value**,
so a token can never pass on paper and fail on screen.

2.2 Conversions follow CSS Color 4. OKLab hue for achromatic colours
(`C < ACHROMATIC_EPSILON = 0.005`) is undefined; `hueDifference` returns
`null` in that case rather than a number.

2.3 Alpha composition is performed in gamma-encoded sRGB, as CSS does:
`out = fg * alpha + bg * (1 - alpha)` per 8-bit channel, then normalised. Composited
colours are published as the resulting solid, never as an alpha token
(section 7.6). Note for reviewers: composition must happen exactly once;
re-encoding an already gamma-encoded input shifts results (e.g. 35 %
`#1E40AF` over `#FFFFFF` is `#B0BCE3`, not `#D9DFF2`).

2.4 WCAG relative luminance and contrast follow WCAG 2.2 sections 7.2 to 7.5 with full
precision retained internally; rounding to two decimals is a presentation
concern only.

2.5 Colour difference uses **CIEDE2000** (`DeltaE2000`, k_L = k_C = k_H = 1),
validated against all 34 Sharma-Wu-Dalal reference pairs to four decimals.

## 3. Profiles

| Threshold | `wcag-aaa` | `aaa-plus` | `integral` |
| --- | --- | --- | --- |
| Body text CR | 7.0 | 7.5 | 7.5 |
| Large text CR | 4.5 | 5.0 | 7.5 |
| Non-text CR (SC 1.4.11) | 3.0 | 3.2 | 3.2 |
| Focus indicator CR (SC 2.4.13) | 3.0 | 3.2 | 3.2 |
| State change DeltaE2000 >= | n/a | 5 | 5 |
| Achromatic alt: Delta L* >= | n/a | 4 | 4 |
| Neutral chroma <= | n/a | 0.02 | 0.02 |
| Surface chroma <= | n/a | 0.04 | 0.04 |
| Accent-soft chroma <= | n/a | 0.09 | 0.09 |
| Accent chroma band | n/a | [0.06, 0.25] | [0.06, 0.25] |

## 4. Token architecture

4.1 A theme resolves exactly **59 mandatory roles** across six groups:
background (7), text (7), interactive (11), feedback (4 families x 4),
border (5) + focus (2), chart (11). Token ids follow the grammar
`lumina.<theme>.<layer>.<role_path>` with `role_path` of 2 to 5 segments.

4.2 Three themes are mandatory: `light`, `dark`, `contrast` (the latter
satisfies SC 1.4.6 enhanced-contrast expectations and `prefers-contrast`).

4.3 Every published token carries provenance: solving method, target
lightness, achieved chroma, design contrast ratio, binding background, and,
for composed tokens, the veil and alpha (LUM-TOK-002).

4.4 A **primitive layer** (neutral ramp and one ramp per semantic family)
MUST be published; it is the identity substrate the semantic layer is cut
from (LUM-TOK-001). Primitive ramps are monotonic in OKLCH lightness by
construction, and monotonicity is verified (LUM-IDE-006).

## 5. Generator

5.1 Generation is **deterministic**: identical `(brand, profile, seed)`
inputs produce byte-identical palettes and hashes. Aesthetic freedom
(neutral hue offset within 5 degrees, chart phase) is driven by a seeded
`mulberry32` PRNG (section 5.1).

5.2 The primary scale is solved, not assumed. `solvePrimary` performs a grid
search over OKLCH lightness (step 0.002) that simultaneously satisfies, for
the *published* values: label contrast, state discriminability (DeltaE2000
>= 5 and hue drift <= 5 degrees), chroma band, and gamut.

A solver margin `SOLVE_MARGIN = 0.06` is added to contrast targets; if the
audit still rejects, `adjustOrReject` escalates the margin in 0.04 steps up
to four times, then **rejects**. Infeasible constraint sets raise an error
rather than emitting a token that fails.

5.3 A two-pass strategy is used for contrast-solved tokens: pass one finds
the feasible lightness band; pass two maximises published chroma inside the
band subject to the kind's chroma ceiling (section 3). Maximising chroma therefore
never overshoots a neutral ceiling.

5.4 Feedback tints are produced by a fixed lightness offset
(`tintDeltaL` = -0.045/-0.05) from the family ramp, never by scaling toward
a contrast ratio, which collapses tints to black in the dark theme.

5.5 Chart series selection is greedy and CVD-aware. Candidates are
resolved once per (lightness, hue, chroma-variant) point into a pool
spanning a 10-degree hue grid with chroma variants {c, 0.62c}.

Selection picks one series at a time: each pick maximises the minimum
pairwise distance (CIEDE2000, under normal vision and all three CVD
simulations) against the already-selected series and the chart
background. Golden-angle spread is explicitly **not** used: it is blind
to what deuteranopes actually see.

5.6 The scrim (`background.overlay`) is composed from a veil derived from
the neutral family hue, at a per-theme design alpha and target lightness,
and published as the composited solid (section 7.6).

5.7 Achromatic brand colours have no extractable hue; the generator uses a
documented neutral anchor (`NEUTRAL_BRAND_HUE = 255 deg`, cool slate) rather
than an arbitrary fallback such as 0 deg.

## 6. Semantic hue derivation

6.1 `H_neutral = H_primary +/- 5 deg` (seeded), `H_info = H_primary`.

6.2 Semantic anchors success/warning/error start from canonical hues
(152/78/25 deg) and are pulled at most `SEMANTIC_HUE_PULL_MAX` toward the
brand hue, then separated so that every anchor keeps at least
`MIN_HUE_SEPARATION = 14 deg` from the brand hue.

The canonical anchors are already more than 14 deg apart, so the pull cannot
merge them. This prevents the v0.2 failure where a red-brand system made
`feedback.error` and `feedback.info` indistinguishable.

## 7. Contrast requirements (MUST unless noted)

7.1 All 16 text-on-background combinations reach the profile's body-text CR
in every theme (SC 1.4.3 / 1.4.6).

7.2 Every text or icon token against every *reachable* surface in its
component context reaches the applicable CR (SC 1.4.3/1.4.11); the pair
matrix encodes reachability, and pairs outside it are `not_applicable`
with a reason.

7.3 Text on `background.overlay` is **prohibited** (LUM-COL-002): scrims
carry no content.

7.4 `interactive.primary.focus` is a **declared alias** of
`interactive.primary.default` (class `alias`): SC 2.4.13 measures the focus
*indicator*, not the fill. Aliased pairs are `not_applicable` by design.

7.5 WCAG exempts inactive controls from contrast requirements
(SC 1.4.3 exception). LUMINA holds itself to a higher bar: `text.disabled`
pairs are audited as class `advisory-text` (threshold 3.0:1, policy SHOULD,
requirement LUM-TXT-004) and the generator solves them against a per-theme
design CR (4.6 light, 4.4 dark, 7.0 contrast).

In the reference palette all 12 disabled pairs pass (3.36 to 9.44:1), so
disabled text is not merely exempt but measurably legible.

The inactive-control exemption is still recorded on the distinctness pair
involving `interactive.disabled`, which reports `not_applicable` with that
reason where applicable.

7.6 Composed tokens are published as solids.

## 8. Focus model (SC 2.4.11 / 2.4.13)

The focus indication is a **double ring**, never a fill colour swap:

- `focus.ring` (outer) contrasts with the **page background** (profile
  focus CR, MUST);
- `focus.inner` (inner) contrasts with the **fill it surrounds** and with
  `focus.ring` (MUST);
- the focused/unfocused *border swap* on inputs is a SHOULD (advisory):
  SC 2.4.13 is satisfied by the ring area, and composition of translucent
  input borders fails in both themes when measured with correct single-pass
  alpha composition (1.88:1 light, 2.26:1 dark), so the requirement is
  carried by the ring tokens.

This model removes the critical v0.2 defect in which `focus.ring` equalled
`interactive.primary.default` (CR 1.00 against a 3.2 requirement).

## 9. Pair matrix

9.1 The audit evaluates a matrix of ~116 distinct pair kinds (348
instantiations across themes for the reference palette) covering all 59
roles. v0.2 audited 31 pairs and left 53 % of tokens unverified; that gap
is closed here and asserted by tests.

9.2 Classes include `text`, `text-large`, `advisory-text`, `non-text`,
`focus`, `distinct`, `alias`, `state-change`, `cvd` and `non-adjacent`,
with per-class criteria (contrast; DeltaE2000 >= 5 with the Delta L* >= 4
achromatic alternative; distinct values).

9.3 **State-change hue drift** (`|DeltaH_OKLCH| <= 5 degrees` where declared) applies
only when both colours are chromatic, defined as C above the *surface
chroma ceiling* (0.04). A colour at or below that ceiling IS a neutral by
definition (section 10.3), so its hue carries no identity and quantising one
channel by one LSB rotates it by several degrees. Below the ceiling the
check reports `not_applicable` with measured chroma.

9.4 CVD pairs (`LUM-CVD-001/002`) are satisfied by non-chromatic measures
as well (lightness separation, patterns); pairs may declare `reinforcedBy`
to record that.

9.5 Rules with no dedicated pair id are expressed elsewhere in the
matrix: text contrast on state backgrounds is audited by the
`LUM-TXT-001` pairs against `interactive.*.{hover,focus,active}`; the
Integral large-text demand (CR >= 7.5) is `LUM-TXT-002` with
`profile.largeText = 7.5`; text on composed backgrounds never arises
because the scrim policy (`LUM-COL-002`) prohibits it outright.

Appendix A is the complete normative requirement index; a test asserts
that every id emitted by any check section exists in it, and that every id
in it is either audited or explicitly scoped to integration.

## 10. Identity requirements

10.1 Neutrals (AAA+ / Integral): chroma <= 0.02; surfaces <= 0.04; hue coherence with the
neutral family per LUM-IDE-005, evaluated only in the lightness band
L in the range [0.25, 0.95] where hue is stable under 8-bit quantisation, with
tolerance 5 degrees at C >= 0.02 and 12 degrees below (SHOULD).

10.2 Accents: chroma within the profile band (SHOULD, LUM-IDE-004). At the
contrast extremes the enhanced profiles demand, the physical chroma ceiling
of the cyan, teal, green, lime and amber families can fall below 0.06: a dark
accent holding CR >= 12.7 against near-white, or a near-white hover fill
holding CR >= 15 against near-black. The audit reports this as a
warning instead of claiming conformance.

10.3 Achromatic guard: hue predicates are undefined for C < 0.005 and are
reported as `not_applicable`, never as failures.

10.4 Distinctness: `MUST_BE_DISTINCT` pairs differ (exact hex inequality);
`SHOULD_BE_DISTINCT` pairs SHOULD differ by DeltaE2000 >= 5 (SHOULD).

10.5 Scale coherence: primitive ramps are monotonic in lightness; state
progressions keep hue drift <= 5 degrees where chromatic (see section 9.3).

## 11. Hashing and certification

11.1 The palette digest is `SHA-256` over the **canonical JSON**
(recursively sorted object keys, no whitespace) of the certified fields
(system, versions, profile, seed, brand, theme values, pair outcomes,
certification), implemented in pure JS and validated against FIPS 180-4
vectors.

11.2 Certification: `certifiable = blocking_failures === 0`. Warnings and
`not_applicable` items are enumerated in `certification.warning_ids` /
per-pair reasons. `pending` never occurs in a completed build.

11.3 The audit report lists, per pair: class, tokens, published values,
contrast ratio, worst DeltaE2000 (where applicable), per-check measured/required
values, policy, and status.

## 12. Robustness statement

Across 25 brand hues (blue to black, including saturated and near-neutral
extremes) x 3 profiles (75 builds): **0 blocking failures in all 75**;
all 75 solved on the first attempt (no margin escalation);
25 builds certify with zero findings (all of them the baseline profile,
which does not force extreme text darkness or surface distinctness). The
remaining 50 builds (both enhanced profiles) emit SHOULD-level findings:
five surface-distinctness findings per build (the light and dark surfaces
are closer than DeltaE2000 >= 5, because surface hierarchy is carried by
borders and elevation), plus LUM-IDE-004 accent-chroma warnings
(physically unavoidable at the profiles' text CR), plus two builds that
also record a LUM-NTX-005 distinctness warning on the inactive control
(a SHOULD-level pair that WCAG exempts).

Generation is deterministic and single-threaded; wall-clock cost depends on
machine load and is not normative (the `ms` fields in generated data files
are recorded observations, not guarantees).

## 13. What changed from v0.2

See `docs/changelog.md`. Summary: the four wrong contrast ratios, the
invisible focus ring, the 31-of-59 audit gap, the 16 undefined pseudocode
functions, the invented hex values, the misreadings of SC 2.4.13, and the
achromatic-hue category errors of v0.2 are all eliminated by construction,
and each fix is enforced by a test in `tests/lumina.test.js` (58 tests).

## Appendix A. Normative requirement index

The registry of audit requirements (`REQUIREMENTS` in `lib/architecture.js`).
Every id emitted by the auditor resolves here; ids marked *(integration)*
are verified against the consuming CSS rather than token values.

| id | area | requirement | profile / scope | policy |
| --- | --- | --- | --- | --- |
| `LUM-TXT-001` | Normal text | CR >= profile.text | AAA+ / Integral | MUST |
| `LUM-TXT-002` | Large text | CR >= profile.largeText | AAA+ | MUST |
| `LUM-TXT-004` | Disabled text | CR >= 3.0 when informative | all | SHOULD |
| `LUM-NTX-001` | UI components | CR >= profile.nonText | AAA+ / Integral | MUST |
| `LUM-NTX-002` | Essential graphics | CR >= profile.nonText | AAA+ / Integral | MUST |
| `LUM-NTX-003` | Decorative separators | CR >= profile.nonText | AAA+ | SHOULD |
| `LUM-NTX-004` | Selection region | discernible + non-chromatic indicator | all | SHOULD |
| `LUM-NTX-005` | Inactive controls | CR >= 3.0 when informative | all | SHOULD |
| `LUM-NTX-006` | Modal scrim | discernible boundary | all | SHOULD |
| `LUM-FOC-001` | Focus visible | visible on keyboard focus | all | MUST |
| `LUM-FOC-002` | Focus contrast | CR >= profile.focus against adjacent colours | AAA+ / Integral | MUST |
| `LUM-FOC-003` | Focus area | >= 2 CSS px perimeter equivalent | Integral (integration) | MUST |
| `LUM-FOC-004` | Focus state change | SC 2.4.13: CR >= 3.0 between focused and unfocused pixels | all | MUST |
| `LUM-FOC-005` | Focus adjacency | non-adjacent pairs are reported not_applicable | all | OPTION |
| `LUM-STA-002` | State discriminability | DeltaE2000 >= 5 and |DeltaH| <= 5 deg between states of a component; the focus state is carried by the focus ring, as SC 2.4.13 measures the indicator rather than the fill | Integral | MUST |
| `LUM-STA-003` | Unfilled controls | discernible against the surface | AAA+ | SHOULD |
| `LUM-STA-004` | Regions | discernible against the surrounding surface | AAA+ | SHOULD |
| `LUM-COL-001` | Colour-only signalling | prohibited for critical states | all | MUST |
| `LUM-COL-002` | Text on scrims | essential text MUST NOT be placed on background.overlay; content sits on a solid panel | all | MUST |
| `LUM-CVD-001` | Chart series | DeltaE2000 >= 10 under protanopia, deuteranopia and tritanopia | AAA+ | MUST |
| `LUM-CVD-002` | Semantic colours | DeltaE2000 >= 10 under dichromacy, or non-chromatic reinforcement | AAA+ | SHOULD |
| `LUM-DIS-001` | Distinctness | tokens declared MUST_BE_DISTINCT must not share an sRGB value | all | MUST |
| `LUM-DIS-002` | Surface hierarchy | tokens declared SHOULD_BE_DISTINCT must not share an sRGB value; theme-exempt pairs report not_applicable with the exemption reason | all | SHOULD |
| `LUM-TOK-001` | Tokens | all mandatory tokens present in every theme | all | MUST |
| `LUM-TOK-002` | Metadata | complete metadata, no pending fields | all | MUST |
| `LUM-IDE-001` | Surface hierarchy | surfaces discernible from each other | AAA+ | SHOULD |
| `LUM-IDE-002` | Neutral chroma | C <= profile.chroma.neutralMax | AAA+ | SHOULD |
| `LUM-IDE-003` | Surface chroma | C <= profile.chroma.surfaceMax | AAA+ | SHOULD |
| `LUM-IDE-004` | Accent chroma | profile.chroma.accentMin <= C <= profile.chroma.accentMax | AAA+ | SHOULD |
| `LUM-IDE-005` | Hue coherence | neutrals derive from the brand hue within +/- 5 deg | AAA+ | SHOULD |
| `LUM-IDE-006` | Scale monotonicity | primitive codes are monotonic in OKLCH lightness | all | MUST |
| `LUM-IDE-007` | Soft tint chroma | C <= profile.chroma.softMax for accent-soft tokens | AAA+ | SHOULD |
| `LUM-IDE-008` | Ramp smoothness | 0.02 <= |DeltaL| <= profile lightness step max between consecutive primitive steps | AAA+ | SHOULD |
| `LUM-AUD-001` | Audit | reproducible, hashed report | all | MUST |
| `LUM-EXC-001` | Exceptions | registered, justified, dated | all | MUST |
| `LUM-THE-001` | Themes | light and dark present | all | MUST |
| `LUM-THE-002` | High contrast theme | present or forced-colors adaptation | Integral | MUST |

Hashing and certification are additionally covered by `LUM-AUD-001`
(reproducible, hashed report) and `LUM-EXC-001` (every recorded exception
carries an id and a written justification); both are emitted as structure
checks by the auditor itself.
