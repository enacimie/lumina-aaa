/**
 * LUMINA-AAA / lib/index.js
 * Public API. Same module tree works in Node and in the browser demo.
 */

export * from './color.js';
export * from './architecture.js';
export * from './hash.js';
export * from './generate.js';
export * from './audit.js';

import { auditPalette, adjustOrReject } from './audit.js';
import { generatePalette } from './generate.js';

/**
 * Generate and audit, repairing by escalating the solve margin if needed.
 * Returns the palette plus the signed audit report.
 */
export function buildPalette(options = {}) {
  const { palette, report, attempts, adjusted, rejected } = adjustOrReject(generatePalette, options);
  return { palette, report, attempts, adjusted, rejected };
}

export { generatePalette, auditPalette, adjustOrReject };
