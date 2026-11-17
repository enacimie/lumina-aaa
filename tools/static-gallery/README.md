# Static gallery + axe-core accessibility layer

Reproducible ecological validation layer for the LUMINA paper. Complements the
controlled-stimulus VLM convergence (`tools/convergence`) with rendered,
real-component pages.

## What it does

`generate.mjs` renders the released LUMINA tokens (`lib/`, `buildPalette`) as
static HTML pages with a rich component template (buttons, form with focus ring,
alerts, card, nav, chart series). Variants:

- 24 passing: 8 reference brands x `integral` profile x 3 themes (light/dark/contrast).
- 6 profile: reference brand x `wcag-aaa`/`aaa-plus` x 3 themes.
- 3 controlled DEFECTS (ground-truth fails): the reference palette with specific
  tokens mutated (invisible focus ring, low-contrast text), re-audited with
  `auditPalette` so the oracle verdict is known.

Pages land in `../../docs/gallery/out/`; the manifest (variant -> file -> oracle
certification / blocking failures / focus CR / body CR) in
`../../docs/paper/data/gallery-manifest.json`.

`axe-run.mjs` runs axe-core (WCAG A/AA) on each rendered page in headless Chrome
and writes `../../docs/paper/data/gallery-axe.json`.

## Reproduce

```bash
cd tools/static-gallery
npm install
npm run all      # generate pages + manifest, then axe audit
```

Requires system Chrome (`google-chrome-stable` or set executablePath in axe-run.mjs).

## Convergence / divergence vs the LUMINA oracle

The oracle audits AAA invariants on published tokens; axe audits rendered A/AA.
They measure different things, so agreement is meaningful and disagreement is
informative:

- Passing variants: axe reports 0 violations on all 30 pages (converges with the
  oracle's 0 blocking failures).
- Low-contrast-text defect: axe DOES flag it (`color-contrast`, 12 nodes). Converges.
- Invisible-focus defect (light and dark): axe reports 0 violations while the
  oracle reports 10 blocking failures. KEY DIVERGENCE: axe-core is blind to
  focus-indicator contrast/visibility (a known limitation). The deterministic
  oracle catches it. This motivates the LUMINA verifier.

Note: an early template draft left a card `<a>` unstyled, so it fell back to the
browser default link blue (#0000ee) and failed contrast on dark themes. That was
a template bug, NOT a LUMINA defect; it was fixed (`a { color: var(--lum-text-link); }`)
and is not reported as a finding.

## Next

- VLM-judge layer over the gallery pages (visual accessibility judgment), compared
  with the oracle and axe (multi-method convergence).
- CVD / state-discriminability stimuli.