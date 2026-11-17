// Controlled accessibility stimuli with KNOWN ground truth from the LUMINA
// oracle. Text-on-background swatches at target contrast ratios, and focus
// ring-vs-fill pairs. The actual ratio is recomputed by lib (ground truth).
import { relativeLuminance, contrastRatio } from '../../lib/color.js';
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('work', { recursive: true });

const r2 = (x) => +x.toFixed(2);
// sRGB inverse transfer (gray): luminance Y -> 8-bit gray hex
const grayForY = (Y) => {
  const c = Y <= 0.0031308 ? 12.92 * Y : 1.055 * Math.pow(Y, 1 / 2.4) - 0.055;
  const v = Math.max(0, Math.min(255, Math.round(c * 255)));
  return '#' + v.toString(16).padStart(2, '0').repeat(3);
};
const WHITE = '#ffffff';
const Ywhite = relativeLuminance(WHITE);

const stimuli = [];
// Text stimuli: gray text on white at target ratios
for (const target of [1.5, 2, 3, 4.5, 5, 7, 9, 12, 15, 20]) {
  const Yfg = (Ywhite + 0.05) / target - 0.05;
  const fg = grayForY(Yfg);
  const cr = contrastRatio(fg, WHITE);
  stimuli.push({ id: `text-${target}`, type: 'text', fg, bg: WHITE, target, actualCR: r2(cr), aa: cr >= 4.5, aaa: cr >= 7.0,
    prompt: 'Normal-size body text on a background. Judge WCAG contrast.' });
}
// Focus stimuli: a ring colour against a fixed button fill at target ratios
const FILL = '#2548af';
const Yfill = relativeLuminance(FILL);
for (const target of [1.0, 1.5, 2, 3, 5, 8]) {
  // ring lighter than fill: Yring = (Yfill+0.05)*target - 0.05
  const Yring = (Yfill + 0.05) * target - 0.05;
  const ring = grayForY(Math.min(1, Yring));
  const cr = contrastRatio(ring, FILL);
  stimuli.push({ id: `focus-${target}`, type: 'focus', fg: ring, bg: FILL, target, actualCR: r2(cr), aa: cr >= 3.0, aaa: cr >= 3.0,
    prompt: 'A focus ring (outer colour) around a button fill (inner colour). Judge whether the focus indicator is visible per WCAG 2.4.13 / 1.4.11 (3:1 against adjacent colour).' });
}
writeFileSync('work/stimuli.json', JSON.stringify(stimuli, null, 2));

// HTML: one card per stimulus, screenshotted individually by render.mjs
let cards = '';
for (const s of stimuli) {
  if (s.type === 'text') {
    cards += `<div class="card" id="${s.id}" style="background:${s.bg};color:${s.fg}">
      <p class="sample">The quick brown fox jumps over the lazy dog. 0123456789</p>
      <p class="sample small">Secondary text sample for contrast judgement.</p></div>`;
  } else {
    cards += `<div class="card focuscard" id="${s.id}" style="background:#f3f4f6">
      <div class="ring" style="background:${s.fg}"><div class="fill" style="background:${s.bg}">Button</div></div></div>`;
  }
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:system-ui,Arial,sans-serif;background:#888}
  .card{width:640px;height:200px;margin:0;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center}
  .sample{font-size:18px;margin:6px 0}
  .sample.small{font-size:14px}
  .focuscard{align-items:center}
  .ring{padding:6px;border-radius:10px}
  .fill{width:200px;height:64px;border-radius:6px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px}
</style></head><body>${cards}</body></html>`;
writeFileSync('work/stimuli.html', html);
console.log('stimuli:', stimuli.length);
for (const s of stimuli) console.log(s.id.padEnd(12), s.type.padEnd(6), 'target', String(s.target).padEnd(5), 'actualCR', s.actualCR, 'AA', s.aa, 'AAA', s.aaa, s.fg, 'on', s.bg);