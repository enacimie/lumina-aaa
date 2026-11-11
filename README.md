# LUMINA-AAA

Deterministic generator and verifier for WCAG 2.2 AAA colour systems.
Everything the specification promises is enforced by code and tested.

Repository: https://github.com/enacimie/lumina-aaa
Release snapshot: https://doi.org/10.5281/zenodo.24161840 (Zenodo)

The demo works on GitHub Pages as-is: the app is static, uses relative paths,
and the module worker resolves `../lib/index.js` from any subdirectory. Once
Pages is enabled on the `main` branch, the demo is at
`https://enacimie.github.io/lumina-aaa/demo/` and the study at
`https://enacimie.github.io/lumina-aaa/demo/study/`. The root `index.html`
redirects to the demo.

Style: this project follows `../guia_estilo_antiaia.md` (ASCII-clean
prose, no AI tics, verification scripts in its section 6). Two data files
carry non-ASCII characters as documented exceptions (section 1.1 of the
guide). `archive/chat-export-*.json` is the verbatim v0.2 evidence under
audit. `docs/paper/data/refs-verified.json` quotes bibliographic titles
exactly as returned by the verification APIs.

- `docs/specification.md`: normative specification (v0.3.0)
- `docs/changelog.md`: every defect found in the v0.2 document and its fix
- `lib/`: colour science, generator, auditor (pure ESM, no dependencies)
- `tools/build-tokens.js`: emits tokens, CSS and the signed audit report
- `tools/aaa-verify.mjs`: independent WCAG 2.2 AAA recomputation (token pairs
  and rendered DOM), writes `docs/paper/data/aaa-verification.json`
- `tools/study-e2e.mjs`: headless end-to-end check of the perceptual study
- `tests/lumina.test.js`: 58-test suite (`npm test`)
- `tokens/`, `reports/`: generated artifacts (reference: brand `#1E40AF`,
  profile `integral`, seed `20260908`)
- `demo/`: static web app to explore and test palettes (no build step;
  `npm run serve`, then open http://localhost:8123/demo/)
- `docs/paper/data/`: machine-generated empirical data for the evaluation
  (`tools/paper-data.mjs` regenerates it)
- `archive/`: the original v0.2 chat export, kept as evidence

## Usage

```sh
npm test          # 58 tests
npm run build     # regenerate tokens/ + reports/ (brand/flags in tools/build-tokens.js)
npm run serve     # serves demo/ at http://localhost:8123
node tools/aaa-verify.mjs   # independent AAA recomputation (needs Chrome)
node tools/study-e2e.mjs    # study runner end-to-end (needs Chrome)
```

Programmatic:

```js
import { buildPalette } from './lib/index.js';
const { palette, report } = buildPalette({ brand: '#1E40AF', profile: 'integral', seed: 20260908 });
// report.certification.level === 'LUMINA Integral Certified'
```

## Guarantees

- 59 mandatory token roles x 3 themes, ~116 audited pair kinds, all
  evaluated on published (quantised) values.
- Deterministic: identical inputs give an identical hash.
- 0 blocking failures across a 25-brand x 3-profile robustness sweep;
  residual warnings are enumerated SHOULD-level physics (accent chroma at
  extreme contrast), never silently dropped.

## License

The code is licensed under the GNU Affero General Public License v3.0 or
later, with a conditional linking exception (see `LICENSE`). The data and
the documentation are CC BY 4.0.
