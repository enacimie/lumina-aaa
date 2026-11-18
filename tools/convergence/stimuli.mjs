// Controlled accessibility stimuli with KNOWN ground truth from the LUMINA
// oracle. Text-on-background swatches at target contrast ratios, and focus
// ring-vs-page pairs (the normative SC 2.4.13 adjacency for an outer outline).
// The actual ratio is recomputed by lib (ground truth).
import { relativeLuminance, contrastRatio } from '../../lib/color.js';
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('work', { recursive: true });

const r2 = (x) => +x.toFixed(2);
// actualCR is rounded to 2 decimals for display only. The AA/AAA verdict is
// computed from the UNROUNDED ratio, so a threshold stimulus can display a
// rounded value at the threshold yet fail (e.g. focus-3: exact 2.9953 < 3,
// displayed 3.00, verdict fail). ground_truth_cr in the released data carries
// this same 2-decimal display rounding.
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
for (const target of [1.5, 3, 4, 4.5, 5, 6.5, 7, 7.5, 9, 12, 20]) {
  const Yfg = (Ywhite + 0.05) / target - 0.05;
  const fg = grayForY(Yfg);
  const cr = contrastRatio(fg, WHITE);
  stimuli.push({ id: `text-${target}`, type: 'text', fg, bg: WHITE, target, actualCR: r2(cr), aa: cr >= 4.5, aaa: cr >= 7.0,
    prompt: 'Normal-size body text on a background. Judge WCAG contrast.' });
}
// Focus stimuli: an outer focus ring (outline) on a white page. The normative
// adjacency for an outer outline is ring-vs-page (SC 2.4.13 change of contrast:
// the unfocused indicator pixels are the page background).
const PAGE = '#ffffff';
for (const target of [1.0, 1.5, 2, 2.5, 3, 3.5, 4, 6]) {
  const Yring = (Ywhite + 0.05) / target - 0.05;
  const ring = grayForY(Yring);
  const cr = contrastRatio(ring, PAGE);
  stimuli.push({ id: `focus-${target}`, type: 'focus', fg: ring, bg: PAGE, target, actualCR: r2(cr), aa: cr >= 3.0, aaa: cr >= 3.0,
    prompt: 'An outer focus ring (outline) around a button on a page. Judge ring-vs-page contrast per WCAG 2.4.13 (3:1 change of contrast).' });
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
    cards += `<div class="card focuscard" id="${s.id}" style="background:#ffffff">
      <div class="btn" style="background:#2548af;outline:8px solid ${s.fg};outline-offset:4px">Button</div></div>`;
  }
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:system-ui,Arial,sans-serif;background:#888}
  .card{width:640px;height:200px;margin:0;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center}
  .sample{font-size:18px;margin:6px 0}
  .sample.small{font-size:14px}
  .focuscard{align-items:center;justify-content:center}
  .btn{width:200px;height:64px;border-radius:6px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px}
</style></head><body>${cards}</body></html>`;
writeFileSync('work/stimuli.html', html);
console.log('stimuli:', stimuli.length);
for (const s of stimuli) console.log(s.id.padEnd(12), s.type.padEnd(6), 'target', String(s.target).padEnd(5), 'actualCR', s.actualCR, 'AA', s.aa, 'AAA', s.aaa, s.fg, 'on', s.bg);