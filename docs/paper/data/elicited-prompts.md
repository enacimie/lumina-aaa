# Elicitation prompt protocol (multi-model case study, RQ2)

Disclosed protocol for the seven-model elicitation. The verbatim chat transcripts
were not archived; this is the structured prompt specification that determines the
outputs. Each model was queried once per variant (single run), temperature 0,
via its official chat API. The extracted tokens, declared ratios and audited-role
lists are in `docs/paper/data/elicited/*.json`; the recomputation audit is
`tools/audit-elicited.mjs`.

## Task (both variants)

"Author a WCAG 2.2 AAA colour specification for a UI design system. Publish a
palette as design tokens (hex), declare the contrast ratio for each pair you
audit, list the roles you audited, and give pseudocode for any derivation. Cover
light and dark themes."

## Variant `terse`

The task above, with NO role inventory and NO explicit thresholds. The model
chooses which roles to define and audit.

## Variant `complete`

The task above, PLUS a disclosed 12-role inventory and explicit WCAG thresholds:

Roles (12):
- background.default
- background.surface
- text.primary
- text.secondary
- interactive.primary.default
- interactive.primary.hover
- focus.ring
- border.default
- feedback.error.text
- feedback.success.text
- chart.series.1
- chart.series.2

Thresholds given: body text >= 7:1 (AAA), large text >= 4.5:1 (AAA), non-text and
focus >= 3:1.

## Confounds and limitations (disclosed)

- The `complete` variant changes BOTH the role inventory and the explicit
  thresholds relative to `terse`; the two effects are not separated.
- The inventory supplies `focus.ring` and `interactive.primary.default` (the
  fill). The ring-aliases-fill pattern (ring-vs-fill < 3:1) may therefore be
  prompt-induced rather than a model tendency.
- Single run per model/variant: RQ2 is descriptive, not a population rate.
- The conformance checks recomputed by the auditor are a disclosed mixed bar
  (body >= 7 AAA; secondary >= 4.5; non-text >= 3; focus >= 3 vs page), not full
  AAA conformance.
