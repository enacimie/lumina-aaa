// Programmatic accessibility layer: axe-core (WCAG A/AA) on each static gallery
// page, rendered in headless Chrome. Compared against the LUMINA oracle (AAA
// token audit) in the manifest. axe and the oracle measure different things
// (rendered A/AA vs published-token AAA); convergence/divergence is the point.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
const OUTDIR = resolve('../../docs/gallery/out');
const manifest = JSON.parse(readFileSync('../../docs/paper/data/gallery-manifest.json', 'utf8'));
const axeSrc = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
const results = [];
for (const m of manifest) {
  await page.goto('file://' + OUTDIR + '/' + m.file, { waitUntil: 'networkidle0' });
  await page.evaluate(axeSrc);
  const r = await page.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  const viols = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  results.push({ id: m.id, kind: m.kind, oracle_block: m.blocking_failures, oracle_cert: m.certifiable, axe_violations: viols.length, violations: viols });
  console.log(m.id.padEnd(34), 'oracle_block', String(m.blocking_failures).padEnd(3), 'axe_viol', String(viols.length).padEnd(3), viols.map((v) => `${v.id}(${v.nodes})`).join(', '));
}
await browser.close();
writeFileSync('../../docs/paper/data/gallery-axe.json', JSON.stringify(results, null, 2));
console.log('saved axe-results.json');