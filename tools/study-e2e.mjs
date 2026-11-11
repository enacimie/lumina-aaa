#!/usr/bin/env node
// End-to-end check of the study runner in headless Chrome.
//
// Verifies that the two cohorts load the right condition set, that the
// simulation cohort sees the simulated pair and the clinical cohort the raw
// pair, and that the practice block hands over to the main block.
//
// Uso: node tools/study-e2e.mjs [--puerto 8140]

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const argv = process.argv.slice(2);
const PUERTO = Number(argv.includes('--puerto') ? argv[argv.indexOf('--puerto') + 1] : 8140);
const STIMULI = JSON.parse(readFileSync(join(ROOT, 'docs', 'paper', 'data', 'stimuli.json'), 'utf8'));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((r) => { this.ws.addEventListener('open', r); });
    this.ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'evaluation error');
    return r.result.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const port = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn('google-chrome', [
    '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'lumina-study-'))}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const page = (await res.json()).find((t) => t.type === 'page');
      if (page) return { proc, cdp: new CDP(page.webSocketDebuggerUrl) };
    } catch { /* starting */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

function check(name, condition, detail = '') {
  if (!condition) throw new Error(`study-e2e: ${name} ${detail}`);
  console.log(`  ok ${name} ${detail}`);
}

const toRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
};

async function answer(cdp, n, key) {
  for (let i = 0; i < n; i += 1) {
    await cdp.eval(`document.getElementById('${key}').click(); document.getElementById('progress').textContent`);
  }
}

async function checkPatches(cdp, cohort) {
  const pair = await cdp.eval(`[document.getElementById('patch-a').style.background, document.getElementById('patch-b').style.background]`);
  const label = await cdp.eval("document.getElementById('condition').textContent");
  const m = label.match(/^(\w+) \/ (\w+)(?: \((?:clinical|simulation)\))? \/ (\w+) \/ dE (\d+)/);
  if (!m) throw new Error(`unexpected condition label: ${label}`);
  const [, background, view, type, target] = m;
  const condition = STIMULI.conditions.find((c) =>
    c.background === background && c.view === view && c.type === type && c.target_deltaE2000 === Number(target));
  if (!condition) throw new Error(`condition not found: ${label}`);
  const expected = cohort === 'clinical'
    ? [condition.base_hex, condition.variant_hex]
    : [condition.base_simulated, condition.variant_simulated];
  const got = pair.map((c) => c.replaceAll(' ', ''));
  const want = expected.map((h) => toRgb(h).replaceAll(' ', ''));
  const match = (got[0] === want[0] && got[1] === want[1]) || (got[0] === want[1] && got[1] === want[0]);
  check(`${cohort} patch pair`, match, `${got.join(' | ')} vs ${want.join(' | ')}`);
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1'], {
    cwd: ROOT, stdio: 'ignore',
  });
  await sleep(800);
  const { proc, cdp } = await launch();
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PUERTO}/demo/study/` });
    await cdp.eval(`document.getElementById('start') && 'ready'`);
    await sleep(500);

    // ---- simulation cohort ----
    await cdp.eval(`
      document.getElementById('cohort').value = 'simulation';
      document.getElementById('deficiency-field').hidden = true;
      document.getElementById('start').click();
      'started'
    `);
    await sleep(300);
    check('simulation practice progress', (await cdp.eval("document.getElementById('progress').textContent")) === '1 / 10',
      await cdp.eval("document.getElementById('progress').textContent"));
    await checkPatches(cdp, 'simulation');
    await answer(cdp, 10, 'same');
    check('simulation main block', (await cdp.eval("document.getElementById('progress').textContent")) === '1 / 640',
      await cdp.eval("document.getElementById('progress').textContent"));

    // ---- clinical cohort ----
    await cdp.eval(`
      document.getElementById('restart').click();
      document.getElementById('cohort').value = 'clinical';
      document.getElementById('deficiency-field').hidden = false;
      document.getElementById('deficiency').value = 'deuteranopia';
      document.getElementById('start').click();
      'started'
    `);
    await sleep(300);
    check('clinical practice progress', (await cdp.eval("document.getElementById('progress').textContent")) === '1 / 10',
      await cdp.eval("document.getElementById('progress').textContent"));
    await checkPatches(cdp, 'clinical');
    await answer(cdp, 10, 'different');
    check('clinical main block', (await cdp.eval("document.getElementById('progress').textContent")) === '1 / 160',
      await cdp.eval("document.getElementById('progress').textContent"));
    const condition = await cdp.eval("document.getElementById('condition').textContent");
    check('clinical condition is deuteranopia', /deuteranopia/.test(condition), condition);

    console.log('study-e2e: all checks passed');
  } finally {
    proc.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
