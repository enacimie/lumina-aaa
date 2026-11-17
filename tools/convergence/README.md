# VLM validation layer (convergence)

Supporting validation for LUMINA-AAA. This is NOT a VLM methodology contribution;
it is one validation aid that corroborates the LUMINA deterministic verifier.
LUMINA is the contribution; the VLM layer is validation.

## Design

Controlled stimuli with KNOWN ground truth from the LUMINA oracle:

- 11 text stimuli: gray text on white, dense around the 4.5:1 and 7:1 thresholds.
- 8 focus stimuli: an outer focus ring (outline) on a white page, dense around
  3:1. The pair is ring-vs-page (the normative SC 2.4.13 change of contrast for
  an outer outline), not the non-normative ring-vs-fill pair.

The actual ratio of each stimulus is recomputed by `lib/color.js` (ground truth).
Three pure vision-language judges assess each stimulus image (estimate ratio +
WCAG AA/AAA verdict, or focus visibility). All judges run under IDENTICAL
conditions: image + prompt only, direct official API, no tools and no agent
environment, reasoning ('thinking') ENABLED on all three, generous max_tokens,
temperature 0. This identical-conditions requirement is essential for a valid
comparison.

Judges (official endpoints):

- Qwen4-Max-Preview (Alibaba token-plan MaaS; `enable_thinking: true`)
- DeepSeek-V4.1-Flash (official DeepSeek API; `thinking: {type: enabled}`)
- LongCat-2.5 (official Meituan LongCat API; `enable_thinking: true`)

## 3x3 protocol

VLM verdicts vary between executions even at temperature 0. The canonical
method is therefore '3x3': 3 judges x 3 runs per stimulus (9 judgments). Each
judge's stable verdict is the majority of its 3 runs; a cross-judge majority is
then compared with the oracle. Intra-judge disagreement is reported as a
reliability metric. Empty responses (reasoning can exhaust the token budget)
are retried.

## Reproduce

```bash
cd tools/convergence
npm install                 # puppeteer-core for rendering
export QWEN_API_KEY=...      # Alibaba token-plan key
export DEEPSEEK_API_KEY=...  # official DeepSeek key
export LONGCAT_API_KEY=...   # official LongCat key
npm run all3x3              # stimuli -> render -> judge3x3 -> analyze3x3
```

Requires system Chrome (`google-chrome-stable`; set executablePath in render.mjs
otherwise). Keys are read from the environment only; never commit them.

Outputs: `../../docs/paper/data/convergence-3x3.json` (every run of every judge)
and `../../docs/paper/data/convergence-summary-3x3.json` (stable accuracy, ratio
MAE, intra-judge disagreement, pairwise agreement, majority-of-3 vs oracle).
Intermediate files in `work/` (gitignored). `npm run all` runs the single-run
variant (`judge.py` / `analyze.py`), kept for reference; the paper uses 3x3.

## Result (19 stimuli, 3x3, thinking enabled)

- Stable per-judge accuracy vs oracle: Qwen 17/19, DeepSeek 15/19, LongCat 15/19.
- Intra-judge disagreement: DeepSeek 4/19, LongCat 5/19, Qwen 0/19; each majority
  absorbs the outliers.
- Pairwise agreement: 78.9-89.5%.
- Cross-judge majority matches the oracle on 16/19; unanimous on 13/19.
- Errors cluster at the thresholds (text-6.5/7/7.5 around 7:1; focus near 3:1).
  Majority misses: text-6.5 (6.48:1), text-7.5 (7.46:1), focus-1 (1.00:1).
- focus-1 (white ring on a white page, invisible): Qwen estimates 1.0; DeepSeek
  and LongCat estimate about 8:1 (the button fill, not the ring). Some VLMs
  attend to the salient component, not the focus indicator.
- This is a limits-of-tools study, not a validation of exact arithmetic (that
  rests on reference vectors + the differential check) nor a claim about human
  perception.

## Notes

- Reasoning models need a generous token budget (Qwen 32768, DeepSeek 65536,
  LongCat 65536) or the final answer can be empty; retry-on-empty covers the
  rest. Thinking is never disabled: it changes results substantially.
- Only these three judges are reported. Exploratory probes with other models
  are not part of the method and are not reported.
