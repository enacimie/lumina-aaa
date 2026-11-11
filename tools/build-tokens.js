/**
 * LUMINA-AAA / tools/build-tokens.js
 *
 * Emits every artefact the specification demands as a deliverable:
 *   tokens/primitives.json      the missing v0.2 layer, now published
 *   tokens/lumina.tokens.json   full token tree with metadata and hashes
 *   tokens/theme.<name>.json    one resolved theme per file
 *   tokens/pairs.json           the complete mandatory audit matrix
 *   tokens/lumina.css           CSS custom properties, light + dark + contrast
 *   reports/audit-report.json   the signed audit report (specification section 11)
 *   reports/audit-report.md     human-readable summary
 *
 * Deterministic: running it twice produces byte-identical output apart from
 * the timestamp, which is passed in explicitly so CI can pin it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPalette } from '../lib/index.js';
import {
  ALGORITHM_VERSION,
  PROFILES,
  ROLE_COUNT,
  SPEC_VERSION,
  SYSTEM,
  WCAG_VERSION,
} from '../lib/architecture.js';
import { digest } from '../lib/hash.js';
import { hexToOklch, relativeLuminance, present } from '../lib/color.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tokensDir = join(root, 'tokens');
const reportsDir = join(root, 'reports');
for (const d of [tokensDir, reportsDir]) mkdirSync(d, { recursive: true });

const argv = process.argv.slice(2);
const get = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : fallback;
};

const brand = get('--brand', '#1E40AF');
const family = get('--family', 'sapphire');
const profile = get('--profile', 'integral');
const seed = Number(get('--seed', 20260908));
const timestamp = get('--timestamp', '1970-01-01T00:00:00.000Z');

if (!PROFILES[profile]) {
  console.error(`unknown profile: ${profile} (expected one of ${Object.keys(PROFILES).join(', ')})`);
  process.exit(1);
}

console.log(`LUMINA-AAA build`);
console.log(`  brand      ${brand}`);
console.log(`  family     ${family}`);
console.log(`  profile    ${profile}`);
console.log(`  seed       ${seed}`);
console.log(`  spec       v${SPEC_VERSION}, algorithm v${ALGORITHM_VERSION}, WCAG ${WCAG_VERSION}`);
console.log();

const { palette, report, attempts, adjusted, rejected } = buildPalette({ brand, family, profile, seed });

const themes = Object.values(palette.themes);
const byRole = (theme) => {
  const map = {};
  for (const token of palette.tokens[theme.name]) map[token.role] = token;
  return map;
};

/* ---------------- primitives.json ---------------- */

const primitivesDoc = {
  $schema: `${SYSTEM}/schemas/primitives/v1.json`,
  system: SYSTEM,
  specVersion: SPEC_VERSION,
  algorithmVersion: ALGORITHM_VERSION,
  identity: palette.meta.identity,
  note: 'Layer 1 of 4. Reference scales for authoring and illustration. Semantic and component tokens are derived by constraint solving, not selected from these ramps; section 4.4 forbids using primitives directly in components.',
  families: Object.fromEntries(
    Object.entries(palette.primitives).map(([familyName, ramp]) => [
      familyName,
      ramp.map((entry) => ({
        id: `${SYSTEM}.primitive.${familyName}.${String(entry.step).padStart(3, '0')}`,
        step: entry.step,
        value: entry.value,
        oklch: {
          l: present(hexToOklch(entry.value).L, 4),
          c: present(hexToOklch(entry.value).C, 4),
          h: present(hexToOklch(entry.value).H, 2),
        },
        relativeLuminance: present(relativeLuminance(entry.value), 6),
      })),
    ]),
  ),
};
writeFileSync(join(tokensDir, 'primitives.json'), `${JSON.stringify(primitivesDoc, null, 2)}\n`);

/* ---------------- lumina.tokens.json ---------------- */

const tokensDoc = {
  $schema: `${SYSTEM}/schemas/tokens/v1.json`,
  system: SYSTEM,
  specVersion: SPEC_VERSION,
  algorithmVersion: ALGORITHM_VERSION,
  wcagVersion: WCAG_VERSION,
  profile,
  identity: palette.meta.identity,
  seed,
  generator: palette.meta.generator,
  hues: palette.meta.hues,
  roleCount: ROLE_COUNT,
  themes: {},
  hash: null,
};
for (const theme of themes) {
  const map = byRole(theme);
  const roles = {};
  for (const role of Object.keys(theme.values).sort()) {
    const token = { ...map[role] };
    // contrastTargets are filled from the audit report below
    token.contrastTargets = [];
    roles[role] = token;
  }
  tokensDoc.themes[theme.name] = { label: theme.label, polarity: theme.polarity, tokens: roles };
}
const tokensHash = digest({ tokens: tokensDoc.themes, primitives: primitivesDoc.families });
tokensDoc.hash = tokensHash;
writeFileSync(join(tokensDir, 'lumina.tokens.json'), `${JSON.stringify(tokensDoc, null, 2)}\n`);

/* ---------------- theme.<name>.json ---------------- */

for (const theme of themes) {
  const map = byRole(theme);
  const doc = {
    $schema: `${SYSTEM}/schemas/theme/v1.json`,
    system: SYSTEM,
    theme: theme.name,
    label: theme.label,
    polarity: theme.polarity,
    profile,
    specVersion: SPEC_VERSION,
    version: SPEC_VERSION,
    tokens: Object.fromEntries(Object.keys(theme.values).sort().map((role) => [role, map[role].value])),
  };
  doc.hash = digest(doc.tokens);
  writeFileSync(join(tokensDir, `theme.${theme.name}.json`), `${JSON.stringify(doc, null, 2)}\n`);
}

/* ---------------- pairs.json ---------------- */

const pairsDoc = {
  $schema: `${SYSTEM}/schemas/pairs/v1.json`,
  system: SYSTEM,
  specVersion: SPEC_VERSION,
  profile,
  pairCount: report.pairs.length / themes.length,
  themes: themes.length,
  pairs: palette.pairMatrix,
  mustBeDistinct: palette.mustBeDistinct,
  requirements: report.requirements,
};
writeFileSync(join(tokensDir, 'pairs.json'), `${JSON.stringify(pairsDoc, null, 2)}\n`);

/* ---------------- lumina.css ---------------- */

const kebab = (role) => `--lum-${role.replace(/\./g, '-')}`;
const lines = [
  '/* LUMINA-AAA generated design tokens - DO NOT EDIT BY HAND',
  ` * system      ${SYSTEM}`,
  ` * identity    ${palette.meta.identity.name}`,
  ` * brand       ${brand}`,
  ` * spec        v${SPEC_VERSION} / algorithm v${ALGORITHM_VERSION} / WCAG ${WCAG_VERSION}`,
  ` * profile     ${profile} (${PROFILES[profile].label})`,
  ` * seed        ${seed}`,
  ` * audit hash  ${report.report.hash}`,
  ' * Regenerate with: npm run build',
  ' */',
  '',
];

const emitBlock = (themeName, notes = []) => {
  const theme = palette.themes[themeName];
  const map = byRole(theme);
  const body = [];
  body.push(`  color-scheme: ${theme.polarity === 'dark' ? 'dark' : 'light'};`);
  for (const role of Object.keys(theme.values).sort()) {
    body.push(`  ${kebab(role)}: ${theme.values[role]};`);
  }
  return { notes, body };
};

const pushBlock = (openLine, closeLine, block) => {
  for (const n of block.notes) lines.push(` * ${n}`);
  lines.push(openLine);
  lines.push(...block.body);
  lines.push(closeLine);
  lines.push('');
};

pushBlock(':root {', '}', emitBlock('light', ['Light theme is the default.']));

// Explicit override wins over the OS preference, so both entry points are emitted.
pushBlock('[data-theme="dark"] {', '}', emitBlock('dark'));
lines.push('@media (prefers-color-scheme: dark) {');
lines.push('  :root:not([data-theme="light"]):not([data-theme="contrast"]) {');
lines.push(...emitBlock('dark').body);
lines.push('  }');
lines.push('}');
lines.push('');

pushBlock('[data-theme="contrast"] {', '}', emitBlock('contrast', [
  'High-contrast theme expresses surface hierarchy with borders, not fills,',
  'so the background distinctness pairs are not applicable here.',
]));

lines.push('/* Focus indicator: the section 8 double ring.');
lines.push(' * focus.ring contrasts with the page, focus.inner with the component fill.');
lines.push(' * SC 2.4.13 measures the indicator, not the component fill. */');
lines.push(':where(:focus-visible) {');
lines.push('  outline: 3px solid var(--lum-focus-ring);');
lines.push('  outline-offset: 2px;');
lines.push('  box-shadow: inset 0 0 0 2px var(--lum-focus-inner);');
lines.push('}');
writeFileSync(join(tokensDir, 'lumina.css'), `${lines.join('\n')}\n`);

/* ---------------- audit-report.json ---------------- */

const signed = { ...report, report: { ...report.report, timestamp, builtFrom: { brand, family, profile, seed } } };
signed.report.tokensHash = tokensHash;
signed.report.certificationHash = digest(signed.certification);
writeFileSync(join(reportsDir, 'audit-report.json'), `${JSON.stringify(signed, null, 2)}\n`);

/* ---------------- audit-report.md ---------------- */

const md = [];
md.push(`# LUMINA-AAA audit report`);
md.push('');
md.push(`| field | value |`);
md.push(`|---|---|`);
md.push(`| identity | **${palette.meta.identity.name}** |`);
md.push(`| brand | \`${brand}\` |`);
md.push(`| profile | ${profile}: ${PROFILES[profile].label} |`);
md.push(`| spec / algorithm | v${SPEC_VERSION} / v${ALGORITHM_VERSION} |`);
md.push(`| WCAG | ${WCAG_VERSION} |`);
md.push(`| seed | \`${seed}\` |`);
md.push(`| tokens hash | \`${tokensHash.slice(0, 16)}...\` |`);
md.push(`| report hash | \`${report.report.hash}\` |`);
md.push(`| certifiable | **${report.certification.certifiable ? 'YES' : 'NO'}**${report.certification.level ? `, ${report.certification.level}` : ''} |`);
md.push(`| blocking failures | ${report.certification.blocking_failures} |`);
md.push(`| warnings | ${report.certification.warnings} |`);
md.push(`| pair results | ${report.pairs.length} (${report.pairs.filter((p) => p.status === 'pass').length} pass, ${report.pairs.filter((p) => p.status === 'not_applicable').length} not applicable) |`);
md.push(`| repair iterations | ${attempts.length}${adjusted ? ' (margin escalated)' : ''} |`);
md.push('');
md.push('## Metrics');
md.push('');
md.push(`| metric | value |`);
md.push(`|---|---|`);
for (const [k, v] of Object.entries(report.metrics)) {
  if (k === 'by_theme') continue;
  md.push(`| ${k} | ${v} |`);
}
md.push('');
md.push('## Pair results');
md.push('');
md.push('| id | theme | foreground | background | class | requirement | required | measured | status |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const p of report.pairs) {
  const req = p.required_ratio ?? p.required_delta_e2000 ?? p.checks?.delta_e2000?.required ?? '-';
  const got = p.contrast_ratio_reported ?? p.measured_delta_e2000 ?? p.worst_delta_e2000 ?? p.checks?.delta_e2000?.measured ?? '-';
  md.push(`| \`${p.pair_id}\` | ${p.theme} | \`${p.foreground_token}\` | \`${p.background_token}\` | ${p.class} | ${p.requirement ?? '-'} | ${req} | ${got} | ${p.status} |`);
}
md.push('');
md.push('## Certification');
md.push('');
md.push('```json');
md.push(JSON.stringify(report.certification, null, 2));
md.push('```');
writeFileSync(join(reportsDir, 'audit-report.md'), `${md.join('\n')}\n`);

/* ---------------- summary ---------------- */

console.log(`  themes     ${themes.map((t) => t.name).join(', ')}`);
console.log(`  roles      ${ROLE_COUNT} per theme`);
console.log(`  pairs      ${report.pairs.length} audited (${report.pairs.filter((p) => p.status === 'pass').length} pass)`);
console.log(`  failures   ${report.certification.blocking_failures}`);
console.log(`  warnings   ${report.certification.warnings}`);
console.log(`  certifiable ${report.certification.certifiable ? 'YES' : 'NO'}${report.certification.level ? ` (${report.certification.level})` : ''}`);
console.log(`  hash       ${report.report.hash}`);
console.log();
console.log('  wrote tokens/primitives.json');
console.log('  wrote tokens/lumina.tokens.json');
for (const t of themes) console.log(`  wrote tokens/theme.${t.name}.json`);
console.log('  wrote tokens/pairs.json');
console.log('  wrote tokens/lumina.css');
console.log('  wrote reports/audit-report.json');
console.log('  wrote reports/audit-report.md');
if (rejected) {
  console.error('\n  WARNING: the palette could not be certified; see reports/audit-report.json');
  process.exit(2);
}
