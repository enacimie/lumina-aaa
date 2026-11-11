// Worker: runs the LUMINA build off the main thread.
import { buildPalette } from '../lib/index.js';

self.onmessage = ({ data }) => {
  const { brand, profile, seed } = data;
  try {
    const t0 = performance.now();
    const { palette, report } = buildPalette({ brand, profile, seed });
    self.postMessage({ ok: true, palette, report, ms: performance.now() - t0 });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e && e.message || e) });
  }
};
