import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
mkdirSync('work/stimuli', { recursive: true });
const stimuli = JSON.parse(readFileSync('work/stimuli.json', 'utf8'));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 260, deviceScaleFactor: 2 });
await page.goto('file://' + resolve('work/stimuli.html'), { waitUntil: 'networkidle0' });
for (const s of stimuli) {
  const el = await page.$('[id="' + s.id + '"]');
  await el.screenshot({ path: `work/stimuli/${s.id}.png` });
}
await browser.close();
console.log('rendered', stimuli.length, 'stimuli');