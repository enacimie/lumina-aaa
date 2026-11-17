# Crosswalk: framework tokens -> LUMINA roles (common subset)

The auditor evaluates LUMINA's 59-role / 116-pair-kind matrix. Other design
systems do not share this role model, so each framework's published tokens are
mapped to a **common subset** of LUMINA roles. Roles a framework does not define
are left undefined; the oracle reports those pairs as `pending` (a coverage
gap), never as a conformance failure.

This mapping is an **interpretation** and a construct-validity threat. Choices
are listed here so a reviewer can see exactly what was compared. The headline
claims rest on the unambiguous pairs (body/secondary/link text on backgrounds,
primary-button label and boundary, focus indicator); border and feedback pairs
are more interpretation-sensitive and are flagged below.

## Shared conventions

- `rgba(r,g,b,a)` tokens are alpha-composited over `background.default` in sRGB
  (the rendered colour), then audited as hex. This affects Bootstrap secondary
  text/focus ring and Ant text tokens.
- `text.on-primary` is set to `#ffffff` where the framework uses white labels on
  its primary fill (Bootstrap, Ant, USWDS, Tailwind); otherwise the framework's
  own on-primary token (Carbon `textOnColor`, Fluent `colorNeutralForegroundOnBrand`,
  M3 `onPrimary`).
- Profile: `wcag-aaa` (WCAG 2.2 AAA minimum: text 7:1, large text 4.5:1, non-text
  and focus 3:1). LUMINA's stricter `integral` design rules are NOT applied here.

## Bootstrap 5.3.3

| LUMINA role | Bootstrap variable |
| --- | --- |
| background.default | --bs-body-bg |
| background.surface | --bs-secondary-bg |
| background.subtle | --bs-tertiary-bg |
| text.primary | --bs-body-color |
| text.secondary | --bs-secondary-color (rgba over bg) |
| text.link | --bs-link-color |
| interactive.primary.default | --bs-primary |
| border.default | --bs-border-color (DECORATIVE: Bootstrap's default border is a subtle separator, not a functional UI boundary; its low contrast is expected and should not be read as a functional failure) |
| focus.ring | --bs-focus-ring-color (rgba over bg; the default is a translucent shadow, ~1.4:1) |
| feedback.X.text / .background | --bs-X-text-emphasis / --bs-X-bg-subtle (X = success/warning/danger->error/info) |

Dark theme = light variables overridden by the `[data-bs-theme=dark]` block
(inheritance merged). Hover/active button states live in `.btn-primary` rules,
not `:root`, so they are not extracted (pending).

## Carbon 11.85.0 (white = light, g100 = dark)

| LUMINA role | Carbon token |
| --- | --- |
| background.default | background |
| background.surface | layer01 |
| background.subtle | layer02 |
| text.primary | textPrimary |
| text.secondary | textSecondary |
| text.link | linkPrimary |
| interactive.primary.default | interactive |
| text.on-primary | textOnColor |
| border.default | borderStrong01 (functional strong border) |
| focus.ring | focus |
| feedback.X.text | supportError/Success/Warning/Info |

Feedback backgrounds are notification tokens, not base theme tokens; left
undefined (pending). Carbon layer semantics differ from LUMINA surfaces
(interpretation).

## Fluent 1.0.0-alpha.24 (webLightTheme / webDarkTheme)

| LUMINA role | Fluent token |
| --- | --- |
| background.default | colorNeutralBackground1 |
| background.surface | colorNeutralBackground2 |
| background.subtle | colorNeutralBackground3 |
| text.primary | colorNeutralForeground1 |
| text.secondary | colorNeutralForeground2 |
| text.link | colorBrandForeground1 |
| interactive.primary.default | colorBrandBackground1 |
| text.on-primary | colorNeutralForegroundOnBrand |
| border.default | colorNeutralStroke1 |
| focus.ring | colorBrandStroke1 (PROXY: Fluent v9 draws focus as a neutral double stroke, not a brand token; brand stroke is an approximation) |
| feedback.error/success/warning .text/.background | colorPaletteRed/Green/Yellow Foreground1 / Background1 |
| feedback.info .text/.background | colorBrandForeground1 / colorBrandBackground2 |

Alpha version pinned; token names may change across releases.

## Material Design 3 (MCU 0.4.0, SchemeTonalSpot, seed #6750A4, contrast 0)

| LUMINA role | M3 scheme role |
| --- | --- |
| background.default | surface |
| background.surface | surfaceContainerLow |
| background.subtle | surfaceContainerHigh |
| text.primary | onSurface |
| text.secondary | onSurfaceVariant |
| text.link | primary |
| interactive.primary.default | primary |
| text.on-primary | onPrimary |
| border.default | outline (functional) |
| focus.ring | primary (PROXY: M3 has no dedicated focus-ring colour token; focus is a state layer. Primary is used as an approximation) |
| feedback.error.text / .background | onErrorContainer / errorContainer |

Only the error feedback family is mapped (M3 exposes error containers; success/
warning/info are not baseline scheme roles). Tonal-spot output differs slightly
from the marketing baseline (e.g. light primary #65558f vs seed #6750A4); the
variant + seed + version are recorded.

## Ant Design 6.7.1 (theme.getDesignToken, default / dark algorithm)

| LUMINA role | Ant token |
| --- | --- |
| background.default | colorBgLayout |
| background.surface | colorBgContainer |
| background.subtle | colorFillQuaternary (rgba over surface) |
| text.primary | colorText (rgba over surface) |
| text.secondary | colorTextSecondary (rgba over surface) |
| text.link | colorLink |
| interactive.primary.default / .hover / .active | colorPrimary / colorPrimaryHover / colorPrimaryActive |
| border.default | colorBorder |
| focus.ring | colorPrimary (PROXY: Ant focus uses a primary-coloured outline shadow) |
| feedback.X.text / .background | colorXText / colorXBg (X = error/success/warning/info) |

Ant defines hover/active primary states, so state-change pairs are auditable.

## USWDS 3.14.0 (light only; no default dark theme)

Resolved from the official compiled CSS semantic utilities (`.text-<token>`).

| LUMINA role | USWDS token |
| --- | --- |
| background.default | white (#ffffff) |
| background.surface / .subtle | base-lightest |
| text.primary | ink |
| text.secondary | base |
| text.link | primary |
| interactive.primary.default | primary |
| border.default | base-light (DECORATIVE separator) |
| focus.ring | usa-focus outline colour (blue-40v, #2491ff) |
| feedback.X.text / .background | X / X-lighter (X = error/success/warning/info) |

USWDS ships no default dark theme (high-contrast mode exists but is not a
standard dark palette); only light is audited.

## Tailwind CSS 3.4.19 (primitive comparator, NOT a semantic system)

Tailwind is utility-first and publishes primitive colour scales (gray-50..950,
blue-50..950, ...), no semantic roles. A **disclosed typical-usage
interpretation** is audited separately as a primitive-scale comparator:

- light: bg white / gray-50 / gray-100; text gray-900 / gray-600; link & primary
  blue-600; border gray-300; focus blue-500; feedback red/green/amber-600.
- dark: bg gray-900 / gray-800 / gray-700; text gray-100 / gray-400; link &
  primary blue-400/500; border gray-600; focus blue-400; feedback red/green/
  amber-400.

This is an interpretation of common usage, not Tailwind's own semantics; it is
labelled `primitive-comparator` and reported apart from the semantic systems.