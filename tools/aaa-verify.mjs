#!/usr/bin/env node
// Independent WCAG 2.2 AAA verification.
//
// The audit in lib/audit.js is the system's own verdict. This script is a
// second opinion that shares no code with it:
//
//   1. token_pairs - recompute the contrast ratio of every audited pair from
//      the published hex values with a from-scratch implementation of the
//      WCAG 2.2 relative-luminance formula.
//   2. dom - load the demo in headless Chrome and recompute the contrast of
//      every rendered text node from the browser's computed styles, then
//      classify each node against the AAA thresholds.
//
// Output: docs/paper/data/aaa-verification.json
//
// Uso:
//   node tools/aaa-verify.mjs [--url URL] [--puerto 8130] [--no-dom]

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const REPORT = join(ROOT, 'reports', 'audit-report.json');
const OUT = join(ROOT, 'docs', 'paper', 'data', 'aaa-verification.json');
const DEMO = 'demo/';

/** WCAG 2.2 AAA thresholds. Advisory text (disabled) has no minimum. */
const AAA = { text: 7.0, 'text-large': 4.5, 'advisory-text': 3.0, 'non-text': 3.0, focus: 3.0 };

/* ------------------------------------------------------------------ *
 * Independent WCAG 2.2 implementation. No import from lib/.
 * ------------------------------------------------------------------ */

function channel(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ------------------------------------------------------------------ *
 * 1. Token-pair recomputation
 * ------------------------------------------------------------------ */

function checkTokenPairs(report) {
  const rows = [];
  let maxDev = 0;
  let mathDisagreements = 0;
  const SKIPPED = new Set(['not_applicable', 'exception', 'pending']);
  for (const p of report.pairs) {
    if (!p.foreground_value || !p.background_value) continue;
    const tau = AAA[p.class];
    if (tau === undefined) continue;
    const cr = contrast(p.foreground_value, p.background_value);
    const dev = typeof p.contrast_ratio_raw === 'number' ? Math.abs(cr - p.contrast_ratio_raw) : null;
    if (dev !== null) {
      if (dev > maxDev) maxDev = dev;
      if (dev > 1e-9) mathDisagreements += 1;
    }
    const pass = cr >= tau;
    // Independent verdict: apply the threshold with the pair's own policy.
    let verdict = 'skipped';
    if (!SKIPPED.has(p.status)) {
      const expected = pass ? 'pass' : (p.policy === 'requirement' ? 'fail' : 'warning');
      verdict = expected === p.status ? 'agree' : 'disagree';
    }
    rows.push({
      pair_id: p.pair_id,
      theme: p.theme,
      class: p.class,
      fg: p.foreground_value,
      bg: p.background_value,
      ratio: Number(cr.toFixed(4)),
      required: tau,
      pass,
      audit_status: p.status,
      verdict,
    });
  }
  return {
    source: 'reports/audit-report.json',
    pairs_checked: rows.length,
    max_abs_deviation: Number(maxDev.toFixed(12)),
    math_disagreements: mathDisagreements,
    verdict_disagreements: rows.filter((r) => r.verdict === 'disagree').length,
    verdict_disagreement_list: rows.filter((r) => r.verdict === 'disagree'),
    // Pairs the audit passes but an independent threshold application rejects.
    aaa_failures: rows.filter((r) => r.audit_status === 'pass' && !r.pass).length,
    aaa_failure_list: rows.filter((r) => r.audit_status === 'pass' && !r.pass),
    // Pairs below the threshold that the audit already reports as not applicable
    // or excepted; recorded so the reader can see they were not silently dropped.
    below_threshold_not_applicable: rows.filter((r) => !r.pass && SKIPPED.has(r.audit_status))
      .map((r) => ({ pair_id: r.pair_id, class: r.class, ratio: r.ratio, required: r.required, audit_status: r.audit_status })),
  };
}

/* ------------------------------------------------------------------ *
 * 2. Browser DOM check
 * ------------------------------------------------------------------ */

/** Runs in the page. Self-contained: no closure, no imports. */
async function inPageAaaCheck() {
  const channel = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrastOf = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const parse = (str) => {
    const m = String(str).match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const backgroundOf = (el) => {
    // Collect from the element up, then composite root-first so the nearest
    // opaque background wins.
    const chain = [];
    for (let node = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) chain.push(c);
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = chain.length - 1; i >= 0; i -= 1) bg = over(chain[i], bg);
    return bg;
  };
  const toHex = ({ r, g, b }) => '#' + [r, g, b]
    .map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const results = [];
  for (const theme of ['light', 'dark', 'contrast']) {
    document.documentElement.dataset.theme = theme;
    // The demo transitions background-color and color over 200 ms; wait for it.
    await new Promise((r) => setTimeout(r, 400));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) continue;
      // Skip visually hidden helpers. Chrome reports clip: auto for ordinary
      // elements and clip: rect(0,0,0,0) for the .sr-only pattern.
      if ((cs.clip !== 'none' && cs.clip !== 'auto') || cs.clipPath !== 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fg = parse(cs.color);
      if (!fg || fg.a === 0) continue;
      const bg = backgroundOf(el);
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      results.push({
        theme,
        text: text.slice(0, 40),
        selector: el.tagName.toLowerCase()
          + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').filter(Boolean).join('.') : ''),
        fontSize: size,
        fontWeight: weight,
        large: size >= 24 || (size >= 18.66 && weight >= 700),
        disabled: !!el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"]'),
        fg: toHex(fg),
        bg: toHex(bg),
        ratio: Math.round(contrastOf(fg, bg) * 100) / 100,
      });
    }
  }
  return results;
}

function classifyDom(rows, report) {
  const auditMap = new Map();
  for (const p of report.pairs) {
    if (!p.foreground_value || !p.background_value) continue;
    auditMap.set(`${p.theme}|${p.foreground_value}|${p.background_value}`, p);
  }
  const themes = {};
  const failures = [];
  const unmatched = [];
  for (const r of rows) {
    const pair = auditMap.get(`${r.theme}|${r.fg}|${r.bg}`) ?? null;
    const auditClass = pair ? pair.class : null;
    const auditStatus = pair ? pair.status : null;
    const skipped = r.disabled || auditStatus === 'not_applicable' || auditStatus === 'exception';
    const threshold = skipped ? null : (auditClass === 'advisory-text' ? 3.0 : (r.large ? 4.5 : 7.0));
    const status = threshold === null ? (r.disabled ? 'exempt' : 'not_applicable') : (r.ratio >= threshold ? 'pass' : 'fail');
    const t = themes[r.theme] ??= { text_nodes: 0, pass: 0, fail: 0, exempt: 0, not_applicable: 0, unmatched: 0, min_ratio: Infinity };
    t.text_nodes += 1;
    t[status] += 1;
    if (r.ratio < t.min_ratio) t.min_ratio = r.ratio;
    if (!pair) {
      t.unmatched += 1;
      unmatched.push({ ...r, threshold, status });
    }
    if (status === 'fail') failures.push({ ...r, audit_class: auditClass, threshold });
  }
  for (const t of Object.values(themes)) t.min_ratio = Number(t.min_ratio.toFixed(2));
  return { themes, total_nodes: rows.length, failures, unmatched };
}

/* ------------------------------------------------------------------ *
 * Chrome DevTools Protocol client (no dependencies)
 * ------------------------------------------------------------------ */

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('WebSocket error')));
    });
    this.ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
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

  close() {
    this.ws.close();
  }
}

async function launchChrome() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'lumina-cdp-'));
  const port = 9333 + Math.floor(Math.random() * 500);
  const proc = spawn('google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    'about:blank',
  ], { stdio: 'ignore' });
  return { proc, port };
}

async function waitForPageTarget(port, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      /* Chrome still starting */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome DevTools did not start');
}

async function waitFor(cdp, expression, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.result.value === true) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout waiting for: ${expression}`);
}

async function domCheck(url) {
  const { proc, port } = await launchChrome();
  try {
    const wsUrl = await waitForPageTarget(port);
    const cdp = new CDP(wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url });
    await waitFor(cdp, "document.getElementById('cert-level') && document.getElementById('cert-level').textContent !== '-'", 90000);
    // The demo transitions background-color over 200 ms after the palette is
    // injected; sampling mid-transition would report interpolated alpha.
    await new Promise((r) => setTimeout(r, 1500));
    const res = await cdp.send('Runtime.evaluate', {
      expression: `(${inPageAaaCheck.toString()})()`,
      returnByValue: true,
      awaitPromise: true,
    });
    const ua = await cdp.send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true });
    cdp.close();
    return { url, user_agent: ua.result.value, rows: res.result.value };
  } finally {
    proc.kill('SIGKILL');
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { url: null, puerto: 8130, noDom: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--puerto') args.puerto = Number(argv[++i]);
    else if (a === '--no-dom') args.noDom = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(readFileSync(REPORT, 'utf8'));
  const tokenPairs = checkTokenPairs(report);

  const out = {
    description: 'independent WCAG 2.2 AAA verification: token-pair recomputation and browser DOM check',
    independence: 'this script imports nothing from lib/; the contrast formula is implemented from the WCAG 2.2 definition',
    thresholds: AAA,
    token_pairs: tokenPairs,
  };

  if (!args.noDom) {
    let servidor = null;
    let url = args.url;
    if (!url) {
      servidor = spawn('python3', ['-m', 'http.server', String(args.puerto), '--bind', '127.0.0.1'], {
        cwd: ROOT, stdio: 'ignore',
      });
      url = `http://127.0.0.1:${args.puerto}/${DEMO}`;
      const deadline = Date.now() + 15000;
      for (;;) {
        try {
          const res = await fetch(url);
          if (res.ok) break;
        } catch { /* not ready */ }
        if (Date.now() > deadline) throw new Error('the local server did not start');
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    try {
      const dom = await domCheck(url);
      out.dom = { ...dom, ...classifyDom(dom.rows, report) };
      delete out.dom.rows;
    } finally {
      if (servidor) servidor.kill('SIGKILL');
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('aaa-verify: wrote', OUT);
  console.log('  token pairs:', tokenPairs.pairs_checked,
    'max deviation', tokenPairs.max_abs_deviation,
    'math disagreements', tokenPairs.math_disagreements,
    'AAA failures', tokenPairs.aaa_failures);
  if (out.dom) {
    console.log('  dom nodes:', out.dom.total_nodes, 'failures', out.dom.failures.length, 'unmatched', out.dom.unmatched.length);
    for (const [theme, t] of Object.entries(out.dom.themes)) {
      console.log(`    ${theme}: nodes=${t.text_nodes} pass=${t.pass} fail=${t.fail} exempt=${t.exempt} unmatched=${t.unmatched} min=${t.min_ratio}`);
    }
  }
}

export { contrast, luminance, checkTokenPairs, classifyDom, inPageAaaCheck };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('aaa-verify: error:', e.message);
    process.exit(1);
  });
}
