// Build a normalized, reproducible dataset of published design-system tokens,
// crosswalked to a COMMON SUBSET of LUMINA roles. Real data from pinned official
// sources (npm packages / CDN). Each framework records version + source.
// The crosswalk is an interpretation (construct threat): frameworks do not share
// LUMINA's role model; only a common subset is audited, undefined roles -> pending.
import { writeFileSync, readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ver = (p) => JSON.parse(readFileSync(`node_modules/${p}/package.json`, 'utf8')).version;

const hex6 = (h) => {
  if (!h || typeof h !== 'string' || !h.startsWith('#')) return null;
  let x = h.slice(1);
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  if (x.length !== 6) return null;
  return '#' + x.toLowerCase();
};
// alpha-composite an rgba token over a background hex (rendered colour, sRGB over)
const over = (fg, bg) => {
  if (!fg) return null;
  if (fg.startsWith('#')) return hex6(fg);
  const m = String(fg).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((s) => s.trim());
  const [r, g, b] = p.map(Number);
  const a = p[3] !== undefined ? Number(p[3]) : 1;
  const B = hex6(bg); if (!B) return null;
  const bgRgb = [1, 3, 5].map((i) => parseInt(B.slice(i, i + 2), 16));
  const c = [r, g, b].map((v, i) => Math.round(a * v + (1 - a) * bgRgb[i]));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

const frameworks = [];

/* ---- Bootstrap 5.3.3 (CDN compiled CSS variables) ---- */
{
  const data = JSON.parse(readFileSync('bootstrap.json', 'utf8'));
  const cw = (v) => {
    const bg = hex6(v['--bs-body-bg']);
    const val = (k) => hex6(v[k]);
    return clean({
      'background.default': bg,
      'background.surface': val('--bs-secondary-bg'),
      'background.subtle': val('--bs-tertiary-bg'),
      'text.primary': val('--bs-body-color'),
      'text.secondary': over(v['--bs-secondary-color'], bg),
      'text.link': val('--bs-link-color'),
      'interactive.primary.default': val('--bs-primary'),
      'text.on-primary': '#ffffff',
      'border.default': val('--bs-border-color'),
      'focus.ring': over(v['--bs-focus-ring-color'], bg),
      'feedback.success.text': val('--bs-success-text-emphasis'),
      'feedback.success.background': val('--bs-success-bg-subtle'),
      'feedback.warning.text': val('--bs-warning-text-emphasis'),
      'feedback.warning.background': val('--bs-warning-bg-subtle'),
      'feedback.error.text': val('--bs-danger-text-emphasis'),
      'feedback.error.background': val('--bs-danger-bg-subtle'),
      'feedback.info.text': val('--bs-info-text-emphasis'),
      'feedback.info.background': val('--bs-info-bg-subtle'),
    });
  };
  // dark theme inherits light variables not overridden in the dark block
  const light = data.themes.light, dark = { ...light, ...data.themes.dark };
  frameworks.push({ name: 'Bootstrap', version: data.version, source: data.source, kind: 'semantic', themes: { light: cw(light), dark: cw(dark) }, meta: { decorative: ['border.default'], focusProxy: false } });
}

/* ---- Carbon (IBM) @carbon/themes: white (light) + g100 (dark) ---- */
{
  const carbon = require('@carbon/themes');
  const cw = (t) => clean({
    'background.default': hex6(t.background),
    'background.surface': hex6(t.layer01),
    'background.subtle': hex6(t.layer02),
    'text.primary': hex6(t.textPrimary),
    'text.secondary': hex6(t.textSecondary),
    'text.link': hex6(t.linkPrimary),
    'interactive.primary.default': hex6(t.interactive),
    'text.on-primary': hex6(t.textOnColor),
    'border.default': hex6(t.borderStrong01),
    'focus.ring': hex6(t.focus),
    'feedback.error.text': hex6(t.supportError),
    'feedback.success.text': hex6(t.supportSuccess),
    'feedback.warning.text': hex6(t.supportWarning),
    'feedback.info.text': hex6(t.supportInfo),
  });
  frameworks.push({ name: 'Carbon', version: ver('@carbon/themes'), source: 'npm @carbon/themes (white, g100)', kind: 'semantic', themes: { light: cw(carbon.white), dark: cw(carbon.g100) }, meta: { decorative: [], focusProxy: false } });
}

/* ---- Fluent (Microsoft) @fluentui/tokens: webLightTheme + webDarkTheme ---- */
{
  const fluent = require('@fluentui/tokens');
  const cw = (t) => clean({
    'background.default': hex6(t.colorNeutralBackground1),
    'background.surface': hex6(t.colorNeutralBackground2),
    'background.subtle': hex6(t.colorNeutralBackground3),
    'text.primary': hex6(t.colorNeutralForeground1),
    'text.secondary': hex6(t.colorNeutralForeground2),
    'text.link': hex6(t.colorBrandForeground1),
    'interactive.primary.default': hex6(t.colorBrandBackground1),
    'text.on-primary': hex6(t.colorNeutralForegroundOnBrand),
    'border.default': hex6(t.colorNeutralStroke1),
    'focus.ring': hex6(t.colorBrandStroke1),
    'feedback.error.text': hex6(t.colorPaletteRedForeground1),
    'feedback.error.background': hex6(t.colorPaletteRedBackground1),
    'feedback.success.text': hex6(t.colorPaletteGreenForeground1),
    'feedback.success.background': hex6(t.colorPaletteGreenBackground1),
    'feedback.warning.text': hex6(t.colorPaletteYellowForeground1),
    'feedback.warning.background': hex6(t.colorPaletteYellowBackground1),
    'feedback.info.text': hex6(t.colorBrandForeground1),
    'feedback.info.background': hex6(t.colorBrandBackground2),
  });
  frameworks.push({ name: 'Fluent', version: ver('@fluentui/tokens'), source: 'npm @fluentui/tokens (webLightTheme, webDarkTheme)', kind: 'semantic', themes: { light: cw(fluent.webLightTheme), dark: cw(fluent.webDarkTheme) }, meta: { decorative: [], focusProxy: true } });
}

/* ---- Material Design 3: tonal-spot scheme from baseline seed #6750A4 ---- */
{
  const mcu = require('./mcu.bundle.mjs');
  const seed = mcu.Hct.fromInt(mcu.argbFromHex('#6750A4'));
  const cw = (dark) => {
    const s = new mcu.SchemeTonalSpot(seed, dark, 0.0);
    const h = (k) => hex6(mcu.hexFromArgb(s[k]));
    return clean({
      'background.default': h('surface'),
      'background.surface': h('surfaceContainerLow'),
      'background.subtle': h('surfaceContainerHigh'),
      'text.primary': h('onSurface'),
      'text.secondary': h('onSurfaceVariant'),
      'text.link': h('primary'),
      'interactive.primary.default': h('primary'),
      'text.on-primary': h('onPrimary'),
      'border.default': h('outline'),
      'focus.ring': h('primary'),
      'feedback.error.text': h('onErrorContainer'),
      'feedback.error.background': h('errorContainer'),
    });
  };
  frameworks.push({ name: 'Material Design 3', version: ver('@material/material-color-utilities'), source: 'npm @material/material-color-utilities, SchemeTonalSpot(seed #6750A4, contrast 0)', kind: 'semantic', themes: { light: cw(false), dark: cw(true) }, meta: { decorative: [], focusProxy: true } });
}

/* ---- Ant Design 5: antd default design token (light + dark algorithm) ---- */
{
  const { theme } = require('antd');
  const cw = (t) => {
    const bg = hex6(t.colorBgContainer);
    return clean({
      'background.default': hex6(t.colorBgLayout),
      'background.surface': bg,
      'background.subtle': hex6(t.colorFillQuaternary) ? over(t.colorFillQuaternary, bg) : null,
      'text.primary': over(t.colorText, bg),
      'text.secondary': over(t.colorTextSecondary, bg),
      'text.link': hex6(t.colorLink),
      'interactive.primary.default': hex6(t.colorPrimary),
      'interactive.primary.hover': hex6(t.colorPrimaryHover),
      'interactive.primary.active': hex6(t.colorPrimaryActive),
      'text.on-primary': '#ffffff',
      'border.default': hex6(t.colorBorder),
      'focus.ring': hex6(t.colorPrimary),
      'feedback.error.text': hex6(t.colorErrorText),
      'feedback.error.background': hex6(t.colorErrorBg),
      'feedback.success.text': hex6(t.colorSuccessText),
      'feedback.success.background': hex6(t.colorSuccessBg),
      'feedback.warning.text': hex6(t.colorWarningText),
      'feedback.warning.background': hex6(t.colorWarningBg),
      'feedback.info.text': hex6(t.colorInfoText),
      'feedback.info.background': hex6(t.colorInfoBg),
    });
  };
  const light = theme.getDesignToken({ algorithm: theme.defaultAlgorithm });
  const dark = theme.getDesignToken({ algorithm: theme.darkAlgorithm });
  const themes = { light: cw(light) };
  if (dark) themes.dark = cw(dark);
  frameworks.push({ name: 'Ant Design', version: ver('antd'), source: 'npm antd theme.getDesignToken(defaultSeed[, darkAlgorithm])', kind: 'semantic', themes, meta: { decorative: [], focusProxy: true, feedbackText: 'colorXText is Ant feedback-message text; interpretation-sensitive' } });
}

/* ---- USWDS 3: resolved semantic utilities from official compiled CSS (light only) ---- */
{
  const css = readFileSync('node_modules/@uswds/uswds/dist/css/uswds.min.css', 'utf8');
  const util = (name) => {
    const m = css.match(new RegExp('\\.text-' + name + '\\{color:(#[0-9a-fA-F]{3,6})\\}'));
    return m ? hex6(m[1]) : null;
  };
  const focusM = css.match(/\.usa-focus\{[^}]*outline:[^;]*?(#[0-9a-fA-F]{6})/);
  const focus = focusM ? hex6(focusM[1]) : '#2491ff';
  const light = clean({
    'background.default': '#ffffff',
    'background.surface': util('base-lightest'),
    'background.subtle': util('base-lightest'),
    'text.primary': util('ink'),
    'text.secondary': util('base'),
    'text.link': util('primary'),
    'interactive.primary.default': util('primary'),
    'text.on-primary': '#ffffff',
    'border.default': util('base-light'),
    'focus.ring': focus,
    'feedback.error.text': util('error'),
    'feedback.error.background': util('error-lighter'),
    'feedback.success.text': util('success'),
    'feedback.success.background': util('success-lighter'),
    'feedback.warning.text': util('warning'),
    'feedback.warning.background': util('warning-lighter'),
    'feedback.info.text': util('info'),
    'feedback.info.background': util('info-lighter'),
  });
  frameworks.push({ name: 'USWDS', version: ver('@uswds/uswds'), source: 'npm @uswds/uswds dist/css/uswds.min.css (semantic utilities); light only, no default dark theme', kind: 'semantic', themes: { light }, meta: { decorative: ['border.default'], focusProxy: false } });
}

/* ---- Tailwind CSS 3: primitive scales (NOT semantic roles) -> comparator ---- */
{
  const tw = require('tailwindcss/colors.js');
  // A documented "typical usage" interpretation, disclosed as such (Tailwind is
  // utility-first and defines no semantic roles). Audited separately as a
  // primitive-scale comparator, not as a semantic design system.
  const light = clean({
    'background.default': hex6(tw.white),
    'background.surface': hex6(tw.gray[50]),
    'background.subtle': hex6(tw.gray[100]),
    'text.primary': hex6(tw.gray[900]),
    'text.secondary': hex6(tw.gray[600]),
    'text.link': hex6(tw.blue[600]),
    'interactive.primary.default': hex6(tw.blue[600]),
    'text.on-primary': hex6(tw.white),
    'border.default': hex6(tw.gray[300]),
    'focus.ring': hex6(tw.blue[500]),
    'feedback.error.text': hex6(tw.red[600]),
    'feedback.success.text': hex6(tw.green[600]),
    'feedback.warning.text': hex6(tw.amber[600]),
    'feedback.info.text': hex6(tw.blue[600]),
  });
  const dark = clean({
    'background.default': hex6(tw.gray[900]),
    'background.surface': hex6(tw.gray[800]),
    'background.subtle': hex6(tw.gray[700]),
    'text.primary': hex6(tw.gray[100]),
    'text.secondary': hex6(tw.gray[400]),
    'text.link': hex6(tw.blue[400]),
    'interactive.primary.default': hex6(tw.blue[500]),
    'text.on-primary': hex6(tw.white),
    'border.default': hex6(tw.gray[600]),
    'focus.ring': hex6(tw.blue[400]),
    'feedback.error.text': hex6(tw.red[400]),
    'feedback.success.text': hex6(tw.green[400]),
    'feedback.warning.text': hex6(tw.amber[400]),
    'feedback.info.text': hex6(tw.blue[400]),
  });
  frameworks.push({ name: 'Tailwind CSS', version: ver('tailwindcss'), source: 'npm tailwindcss/colors.js (primitive scales; typical-usage interpretation, disclosed)', kind: 'primitive-comparator', themes: { light, dark }, meta: { decorative: [], focusProxy: false } });
}

writeFileSync('../../docs/paper/data/frameworks.json', JSON.stringify({ generated: new Date().toISOString(), oracle: 'LUMINA verifyAllPairs (lib/audit.js), profile wcag-aaa', frameworks }, null, 2));
for (const f of frameworks) console.log(f.name.padEnd(20), f.version.padEnd(10), f.kind.padEnd(22), 'themes:', Object.keys(f.themes).join(','), '| light roles:', Object.keys(f.themes.light).length);