// Forensic audit of the v0.2 specification archive.
//
// Reads archive/chat-export-1788860678731.json (the Open WebUI export that
// contains the LLM-authored v0.2 specification) and re-derives every row of
// the paper's Table 1 from the published values. The operational definitions
// that the paper did not state are fixed here and documented inline, so the
// numbers are reproducible by a reviewer.
//
// Output: docs/paper/data/v02-findings.json
//
// The export contains four assistant messages. The last one is the complete
// normative specification: it carries the 59 mandatory tokens (section 14),
// the 31 declared pairs (section 15) and the tone-drift rule (section 19.5).
// The earlier messages carry the published palettes and the CSS reference
// block. Definitions:
//   - "normative message": the last assistant message.
//   - "published palettes": the palette tables in every message, with the
//     theme inferred from the section number (3, 8.1, 11.x are light;
//     4, 8.2 are dark).
//   - "CSS reference block": the custom properties in the message that
//     declares them.
//   - "declared ratios": the text/background ratios printed in the palette
//     tables, with the background taken from the row's wording and the theme.
//   - "neutral values": the distinct hex values of the background, text and
//     border roles in the CSS block, excluding the coloured link and focus.
//   - "invented values": hex values in the CSS block absent from the tables.
//   - "undefined functions": function names invoked in the prose without a
//     `function <name>` definition.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { contrastRatio, hexToOklch, hueDifference, relativeLuminance } from '../lib/color.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const ARCHIVE = join(ROOT, 'archive', 'chat-export-1788860678731.json');
const OUT = join(ROOT, 'docs', 'paper', 'data', 'v02-findings.json');

/* ------------------------------------------------------------------ *
 * Load the export
 * ------------------------------------------------------------------ */

const raw = readFileSync(ARCHIVE, 'utf8');
const export_ = JSON.parse(raw);
const root = export_['0'] ?? export_;
const messages = root.chat?.messages ?? [];
const assistant = messages.filter((m) => m.role === 'assistant');
const userMessages = messages.filter((m) => m.role === 'user');
const NORM = assistant[assistant.length - 1];
const normLines = (NORM.content_list ?? []).map((c) => c.content ?? '').join('\n').split('\n');
const allProse = assistant.map((m) => (m.content_list ?? []).map((c) => c.content ?? '').join('\n')).join('\n');
const allLines = allProse.split('\n');

/** Sections keyed by their leading number, within one message. */
function sectionsOf(linesSlice) {
  const out = [];
  linesSlice.forEach((line, i) => {
    const m = line.match(/^#{2,4}\s+(\d+(?:\.\d+)*)\.?\s*(.*)$/);
    if (m) out.push({ num: m[1], title: m[2], start: i });
  });
  return out;
}

function bodyOf(linesSlice, secs, num) {
  const s = secs.find((x) => x.num === num);
  if (!s) return [];
  const next = secs.filter((x) => x.start > s.start).sort((a, b) => a.start - b.start)[0];
  return linesSlice.slice(s.start, next ? next.start : linesSlice.length);
}

function hexesIn(linesSlice) {
  const set = new Set();
  for (const line of linesSlice) {
    const re = /#([0-9A-Fa-f]{6})/g;
    let m;
    while ((m = re.exec(line))) set.add('#' + m[1].toUpperCase());
  }
  return [...set];
}

/* ------------------------------------------------------------------ *
 * 1. Declared contrast ratios vs measured (all messages)
 * ------------------------------------------------------------------ */

const LIGHT = { surface: '#FFFFFF', background: '#F8FAFC' };
const DARK = { surface: '#1E293B', background: '#0F172A' };
const LIGHT_SECTIONS = new Set(['3', '8.1', '11.1', '11.2', '11.3', '11.4']);
const DARK_SECTIONS = new Set(['4', '8.2']);

function declaredPairs() {
  const pairs = new Map();
  // The reference palettes live in the message with section 8.1, plus the
  // illustrative palette in the first message.
  const paletteMessages = assistant.filter((m) => {
    const t = (m.content_list ?? []).map((c) => c.content ?? '').join('\n');
    return /^## 8\.1/m.test(t) || /^## 3\./m.test(t);
  });
  for (const m of paletteMessages) {
    const linesSlice = (m.content_list ?? []).map((c) => c.content ?? '').join('\n').split('\n');
    const secs = sectionsOf(linesSlice);
    let theme = null;
    for (let i = 0; i < linesSlice.length; i += 1) {
      const s = secs.find((x) => x.start === i);
      if (s) theme = LIGHT_SECTIONS.has(s.num) ? LIGHT : DARK_SECTIONS.has(s.num) ? DARK : null;
      const line = linesSlice[i];
      if (!line.trimStart().startsWith('|')) continue;
      const declared = line.match(/(\d+\.\d+):1/);
      if (!declared || !theme) continue;
      const hexes = [...line.matchAll(/#([0-9A-Fa-f]{6})/g)].map((x) => '#' + x[1].toUpperCase());
      const value = parseFloat(declared[1]);
      let fg = null;
      let bg = null;
      if (hexes.length >= 2) {
        [fg, bg] = hexes;
      } else if (/sobre (blanco|superficie)/.test(line)) {
        [fg, bg] = [hexes[0], theme.surface];
      } else if (/sobre fondo/.test(line)) {
        [fg, bg] = [hexes[0], theme.background];
      } else if (/con texto blanco/.test(line)) {
        [fg, bg] = ['#FFFFFF', hexes[0]];
      } else if (/con texto oscuro/.test(line)) {
        [fg, bg] = [theme.background, hexes[0]];
      } else {
        continue;
      }
      const key = `${fg}|${bg}`;
      if (!pairs.has(key)) pairs.set(key, { fg, bg, declared: value });
    }
  }
  return [...pairs.values()];
}

const declared = declaredPairs().map((p) => {
  const measured = contrastRatio(p.fg, p.bg);
  return { ...p, measured: +measured.toFixed(2), delta: +(measured - p.declared).toFixed(2) };
});
const wrong = declared.filter((p) => Math.abs(p.delta) > 0.1);
const wrongRounded = declared.filter((p) => Math.abs(p.measured.toFixed(1) - p.declared) > 0.001);

/* ------------------------------------------------------------------ *
 * 2. CSS reference block: neutrals and invented values
 * ------------------------------------------------------------------ */

const cssMessage = assistant.find((m) => (m.content_list ?? []).map((c) => c.content ?? '').join('\n').includes('--background-default'));
const cssText = cssMessage ? (cssMessage.content_list ?? []).map((c) => c.content ?? '').join('\n') : '';
const cssLines = cssText.split('\n');
const cssSecs = sectionsOf(cssLines);

const paletteSections = ['8.1', '8.2', '8.3', '8.4', '11.1', '11.2', '11.3', '11.4', '13.2', '13.3'];
const paletteHexes = new Set(hexesIn(paletteSections.flatMap((n) => bodyOf(cssLines, cssSecs, n))));
const cssHexes = hexesIn(bodyOf(cssLines, cssSecs, '14.1'));
const invented = cssHexes.filter((h) => !paletteHexes.has(h)).sort();

const neutralVars = [...cssText.matchAll(/--(background|text|border)-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)]
  .filter((m) => !(m[1] === 'border' && m[2] === 'focus') && !(m[1] === 'text' && m[2] === 'link'))
  .map((m) => m[3].toUpperCase());
const neutralHexes = [...new Set(neutralVars)].sort();
const neutralDetail = neutralHexes.map((h) => {
  const { C } = hexToOklch(h);
  return { hex: h, chroma: +C.toFixed(4), over: C > 0.02 };
});
const neutralsOver = neutralDetail.filter((n) => n.over);

/* ------------------------------------------------------------------ *
 * 3. Achromatic hue drift
 * ------------------------------------------------------------------ */

const white = hexToOklch('#FFFFFF');
const nearWhite = hexToOklch('#F8FAFC');
const naiveDrift = (() => {
  let d = Math.abs(white.H - nearWhite.H);
  if (d > 180) d = 360 - d;
  return d;
})();
const guardedDrift = hueDifference('#FFFFFF', '#F8FAFC');

/* ------------------------------------------------------------------ *
 * 4. Normative message: tokens, pairs, coverage, functions
 * ------------------------------------------------------------------ */

const normSecs = sectionsOf(normLines);
const tokenLines = ['14.1', '14.2', '14.3', '14.4', '14.5', '14.6']
  .flatMap((n) => bodyOf(normLines, normSecs, n)).join('\n');
const tokens = [...tokenLines.matchAll(/^\s*([a-z][a-z0-9.-]+)\s*$/gm)].map((m) => m[1]);
const pairLines = ['15.1', '15.2', '15.3'].flatMap((n) => bodyOf(normLines, normSecs, n)).join('\n');
const namedInPairs = new Set([...pairLines.matchAll(/`([a-z][a-z0-9.-]+)`/g)].map((m) => m[1]));
const defined = new Set(tokens);
const undefinedReferenced = [...namedInPairs].filter((t) => !defined.has(t)).sort();
const covered = [...namedInPairs].filter((t) => defined.has(t));
const uncovered = tokens.filter((t) => !namedInPairs.has(t));

// The pseudocode blocks are the sections whose title mentions "pseudocódigo".
const pseudoBlocks = assistant.flatMap((m) => {
  const linesSlice = (m.content_list ?? []).map((c) => c.content ?? '').join('\n').split('\n');
  const secs = sectionsOf(linesSlice);
  return secs.filter((s) => /pseudoc|algoritmo de generaci|funci[oó]n de validaci/i.test(s.title))
    .flatMap((s) => bodyOf(linesSlice, secs, s.num));
}).join('\n');
const pseudoProse = pseudoBlocks;
// Functions defined anywhere in the export.
const definedFns = new Set();
for (const m of allProse.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) definedFns.add(m[1]);
const invoked = new Set();
for (const m of pseudoProse.matchAll(/\b([a-z][A-Za-z0-9_]{2,})\s*\(/g)) {
  const name = m[1];
  if (definedFns.has(name)) continue;
  invoked.add(name);
}
const nonFunctions = new Set(['forall', 'left', 'right', 'media', 'rgba', 'tau', 'min', 'max', 'abs', 'round', 'sqrt', 'log', 'exp', 'push', 'map', 'filter', 'length', 'includes', 'join', 'split', 'trim', 'replace', 'toString', 'toFixed', 'require', 'import', 'from', 'export', 'default', 'new', 'typeof', 'instanceof', 'await', 'async', 'catch', 'throw', 'switch', 'case', 'break', 'continue', 'delete', 'return', 'if', 'else', 'for', 'while', 'do', 'try', 'void', 'yield', 'static', 'class', 'extends', 'super', 'this', 'null', 'undefined', 'true', 'false', 'const', 'let', 'var', 'function']);
const undefinedFunctions = [...invoked].filter((n) => !nonFunctions.has(n)).sort();

/* ------------------------------------------------------------------ *
 * 5. Focus pair
 * ------------------------------------------------------------------ */

const focusRing = [...allProse.matchAll(/--focus-ring:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => '#' + m[1].toUpperCase());
const primary = [...allProse.matchAll(/--interactive-primary-default:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => '#' + m[1].toUpperCase());

/* ------------------------------------------------------------------ *
 * 6. Write the findings
 * ------------------------------------------------------------------ */

const findings = {
  source: 'archive/chat-export-1788860678731.json',
  description: 'Forensic re-derivation of the v0.2 defect taxonomy. Every number is computed from the published values; the operational definitions are in the script header.',
  provenance: {
    assistantMessages: assistant.length,
    userMessages: userMessages.length,
    normativeMessage: assistant.length,
    models: [...new Set(assistant.map((m) => m.model).filter(Boolean))],
  },
  declaredRatios: {
    definition: 'unique text/background ratios printed in the palette tables, background from the row wording and the section theme',
    total: declared.length,
    wrongOverPointOne: wrong.length,
    wrongRoundedToOneDecimal: wrongRounded.length,
    tolerance: 0.1,
    pairs: declared.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
  },
  inventedHex: {
    definition: 'hex values in the CSS reference block absent from the published palette tables',
    count: invented.length,
    values: invented,
  },
  neutralChroma: {
    definition: 'distinct hex values of the background, text and border roles in the CSS block, excluding the coloured link and focus roles',
    ceiling: 0.02,
    total: neutralHexes.length,
    over: neutralsOver.length,
    values: neutralDetail,
  },
  achromaticDrift: {
    definition: 'naive OKLCH hue difference between #FFFFFF and #F8FAFC',
    whiteHue: +white.H.toFixed(4),
    nearWhiteHue: +nearWhite.H.toFixed(4),
    naiveDrift: +naiveDrift.toFixed(2),
    guardedDrift: guardedDrift,
    note: 'hueDifference returns null under the achromatic guard (C < 0.005)',
  },
  coverage: {
    definition: 'mandatory tokens (section 14 of the normative message) never named in the declared pair lists (section 15)',
    mandatory: tokens.length,
    namedInPairs: namedInPairs.size,
    covered: covered.length,
    uncovered: uncovered.length,
    undefinedReferenced,
    uncoveredTokens: uncovered.sort(),
  },
  undefinedFunctions: {
    definition: 'function names invoked in the normative message without a function definition',
    count: undefinedFunctions.length,
    names: undefinedFunctions,
  },
  focusPair: { focusRing, primary, identical: focusRing.length > 0 && focusRing[0] === primary[0] },
  luminance: { white: +relativeLuminance('#FFFFFF').toFixed(6), nearWhite: +relativeLuminance('#F8FAFC').toFixed(6) },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(findings, null, 2));
console.log('audit-v02: wrote', OUT);
console.log('  declared ratios:', findings.declaredRatios.total, '| wrong (>0.1):', findings.declaredRatios.wrongOverPointOne, '| wrong (rounded):', findings.declaredRatios.wrongRoundedToOneDecimal);
console.log('  invented hex:', findings.inventedHex.count, findings.inventedHex.values.join(' '));
console.log('  neutrals over ceiling:', findings.neutralChroma.over, 'of', findings.neutralChroma.total);
console.log('  naive drift:', findings.achromaticDrift.naiveDrift, '| guarded:', findings.achromaticDrift.guardedDrift);
console.log('  coverage:', findings.coverage.covered, 'covered,', findings.coverage.uncovered, 'uncovered of', findings.coverage.mandatory, '| undefined referenced:', findings.coverage.undefinedReferenced.join(', '));
console.log('  undefined functions:', findings.undefinedFunctions.count, findings.undefinedFunctions.names.join(', '));
console.log('  focus pair identical:', findings.focusPair.identical);
