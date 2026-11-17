# Framework accessibility audit (LUMINA oracle)

Reproducible WCAG 2.2 AAA audit of published design-system colour tokens, using
the **same** LUMINA pair-matrix oracle (`lib/audit.js`, `verifyAllPairs`) that
certifies LUMINA itself. The point is a fair, ecological comparison: how do the
design systems people actually use measure up against the same WCAG-derived
invariants, on their published hex values?

This is computational evidence for the LUMINA paper; it involves no human
participants.

## What it does

1. `extract-bootstrap.mjs` fetches the official Bootstrap 5.3.3 compiled CSS
   (pinned CDN URL) and extracts the `--bs-*` theme variables (light + dark).
2. `bundle:mcu` bundles `@material/material-color-utilities` with esbuild (the
   package uses extensionless internal imports that Node ESM cannot resolve
   directly; bundling fixes that).
3. `build-frameworks.mjs` reads real published tokens from pinned npm packages
   (Carbon, Fluent, Material 3, Ant Design, USWDS, Tailwind) plus the Bootstrap
   JSON, crosswalks them to a **common subset** of LUMINA roles, and writes
   `docs/paper/data/frameworks.json`.
4. `audit-all.mjs` runs `verifyAllPairs` on every crosswalked theme at the
   `wcag-aaa` profile and writes `docs/paper/data/framework-audit.json`.

## Reproduce

```bash
cd tools/framework-audit
npm ci          # exact versions from package-lock.json
npm run all     # extract -> bundle -> build -> audit
```

Outputs land in `../../docs/paper/data/frameworks.json` and
`../../docs/paper/data/framework-audit.json`. The oracle is imported from
`../../lib/audit.js` (no fork of the auditor).

## Sources (pinned)

| Framework | Version | Source |
| --- | --- | --- |
| Bootstrap | 5.3.3 | cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css |
| Carbon | 11.85.0 | npm @carbon/themes (white, g100) |
| Fluent | 1.0.0-alpha.24 | npm @fluentui/tokens (webLightTheme, webDarkTheme) |
| Material Design 3 | 0.4.0 (MCU) | npm @material/material-color-utilities, SchemeTonalSpot(seed #6750A4, contrast 0) |
| Ant Design | 6.7.1 | npm antd, theme.getDesignToken({algorithm: default/dark}) |
| USWDS | 3.14.0 | npm @uswds/uswds, dist/css/uswds.min.css semantic utilities (light only) |
| Tailwind CSS | 3.4.19 | npm tailwindcss/colors.js (primitive scales; comparator) |

## Fairness and threats (read `crosswalks.md`)

- The oracle is the WCAG-derived pair matrix, evaluated at the **WCAG AAA
  minimum** profile (`wcag-aaa`), not LUMINA's stricter `integral` design rules.
  LUMINA-specific design rules (chroma bands, primitive ramps, hue coherence)
  are NOT applied to other frameworks.
- Frameworks do not share LUMINA's 59-role model. Only a documented common
  subset is crosswalked; roles a framework does not define are left undefined
  and reported as `pending` (a coverage gap, not a conformance fail).
- The crosswalk is an interpretation (construct threat). Some mappings are
  approximate (e.g. M3 and Fluent have no dedicated focus-ring token; a brand
  colour is used as a proxy). Decorative borders are not functional UI
  boundaries. See `crosswalks.md` for every choice.
- `rgba` tokens are alpha-composited over the body background (rendered colour).
- Tailwind is utility-first and defines no semantic roles; it is audited as a
  primitive-scale comparator under a disclosed typical-usage interpretation,
  not as a semantic design system.
- Material 3 uses the tonal-spot scheme generated from the baseline seed; the
  exact primary differs slightly from the marketing baseline. The variant,
  seed and library version are recorded.

## Headline result (see framework-audit.json)

Popular design systems meet WCAG **AA** on most audited pairs but fall short of
**AAA** on many; focus-indicator contrast varies widely (Bootstrap's default
translucent focus ring is ~1.4:1, below the 3:1 minimum); and most systems
define fewer than 20 of the 59 roles (large coverage gaps). Material 3 dark is
notably strong. These are ecological findings about design practice, not a
"gotcha": most systems target AA, and AAA is the stricter bar needed for low
vision / public-sector / EAA / ADA contexts.