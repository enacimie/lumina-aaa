/**
 * LUMINA-AAA / lib/color.js
 * Colour science primitives. No dependencies. Runs in Node >= 20 and in browsers.
 *
 * Normative spaces (spec v0.3 section 2):
 *   - sRGB            : the conformity space. All WCAG measurements are made here.
 *   - OKLab / OKLCH   : the authoring space. Hue and chroma constraints live here.
 *   - CIELAB (D65)    : only to report CIEDE2000 (CIE 143:2000).
 */

export const WHITE_POINT_D65 = { x: 0.95047, y: 1.0, z: 1.08883 };

/** OKLCH chroma below which hue is numerically meaningless (spec v0.3 section 10.3 guard). */
export const ACHROMATIC_EPSILON = 0.005;

/** Tolerance used when testing sRGB gamut membership. */
export const GAMUT_EPSILON = 1e-4;

/* ------------------------------------------------------------------ *
 * sRGB <-> hex
 * ------------------------------------------------------------------ */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Fold an angle in degrees onto [0, 360). */
const normalizeDegrees = (deg) => ((deg % 360) + 360) % 360;

/**
 * Memoisation. Every build evaluates the same handful of hex strings millions
 * of times through the solver's grid searches; converting each one exactly
 * once removes ~90% of CPU time. Keys are the canonical input string.
 */
function memoize1(fn) {
  const cache = new Map();
  return (arg) => {
    let v = cache.get(arg);
    if (v === undefined) {
      v = fn(arg);
      if (cache.size > 65536) cache.clear();
      cache.set(arg, v);
    }
    return v;
  };
}

function memoize2(fn) {
  const cache = new Map();
  return (a, b) => {
    const k = `${a}|${b}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = fn(a, b);
      if (cache.size > 262144) cache.clear();
      cache.set(k, v);
    }
    return v;
  };
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const cacheable = (x) => typeof x === 'string' && HEX_RE.test(x);

export const hexToRgb = /* @__PURE__ */ (() => {
  const parse = (hex) => {
    let h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`invalid sRGB hex: ${hex}`);
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    };
  };
  const fast = memoize1(parse);
  return (hex) => (cacheable(hex) ? fast(hex) : parse(hex));
})();

export function rgbToHex({ r, g, b }) {
  const q = (v) => {
    const n = Math.round(clamp01(v) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return `#${q(r)}${q(g)}${q(b)}`.toUpperCase();
}

/* ------------------------------------------------------------------ *
 * sRGB transfer function (IEC 61966-2-1) and WCAG linearisation
 * ------------------------------------------------------------------ */

/** Gamma-encoded sRGB channel -> linear-light channel. WCAG 2.2 section 7.2. */
export function linearize(x) {
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** Linear-light channel -> gamma-encoded sRGB channel. Inverse of `linearize`. */
export function delinearize(y) {
  return y <= 0.0030186605556024893 ? y * 12.92 : 1.055 * y ** (1 / 2.4) - 0.055;
}

/* ------------------------------------------------------------------ *
 * WCAG relative luminance and contrast ratio
 * ------------------------------------------------------------------ */

/**
 * WCAG 2.2 relative luminance. Spec v0.3 section 2.4.
 *   Y(c) = 0.2126 R_lin + 0.7152 G_lin + 0.0722 B_lin
 */
const luminanceFromHex = /* @__PURE__ */ memoize1((hex) => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
});

export function relativeLuminance(color) {
  if (typeof color === 'string') return luminanceFromHex(color);
  const { r, g, b } = color;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.2 contrast ratio. Spec v0.3 section 2.4.
 *   CR(c1,c2) = (max(Y1,Y2) + 0.05) / (min(Y1,Y2) + 0.05)
 * Always returned at full precision; rounding is a presentation concern (section 2.4).
 */
const contrastRatioUncached = (a, b) => {
  const ya = relativeLuminance(a);
  const yb = relativeLuminance(b);
  const hi = Math.max(ya, yb);
  const lo = Math.min(ya, yb);
  return (hi + 0.05) / (lo + 0.05);
};

export const contrastRatio = /* @__PURE__ */ memoize2(contrastRatioUncached);

/**
 * spec v0.3 section 2.4: the luminance bounds a foreground must respect to reach
 * contrast `tau` against a background of luminance `yBackground`.
 * Also implements the feasibility test of section 5.2.
 */
export function luminanceBounds(yBackground, tau) {
  const maxWithBlack = (yBackground + 0.05) / 0.05;
  const maxWithWhite = 1.05 / (yBackground + 0.05);
  return {
    yBackground,
    tau,
    /** foreground lighter than the background: Yf >= tau(Yb + 0.05) - 0.05 */
    lighterMin: tau * (yBackground + 0.05) - 0.05,
    /** foreground darker than the background: Yf <= (Yb + 0.05)/tau - 0.05 */
    darkerMax: (yBackground + 0.05) / tau - 0.05,
    maxAchievable: Math.max(maxWithBlack, maxWithWhite),
    feasible: tau <= Math.max(maxWithBlack, maxWithWhite),
  };
}

/* ------------------------------------------------------------------ *
 * Alpha composition (spec v0.3 section 7.6)
 * ------------------------------------------------------------------ */

/**
 * Composite a foreground with opacity `alpha` over an opaque background.
 * Normative decision: composition happens in GAMMA-ENCODED sRGB, which is what
 * CSS / Skia / CoreAnimation actually do for `rgba()` over an opaque backdrop.
 * v0.2 left "the relevant rendering space" undefined; that is now fixed.
 */
export function compositeAlpha(foreground, alpha, background) {
  const f = typeof foreground === 'string' ? hexToRgb(foreground) : foreground;
  const b = typeof background === 'string' ? hexToRgb(background) : background;
  return {
    r: alpha * f.r + (1 - alpha) * b.r,
    g: alpha * f.g + (1 - alpha) * b.g,
    b: alpha * f.b + (1 - alpha) * b.b,
  };
}

/* ------------------------------------------------------------------ *
 * OKLab / OKLCH  (Bjorn Ottosson, https://bottosson.github.io/posts/oklab/)
 * ------------------------------------------------------------------ */

const M_LINEAR_RGB_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];

const M_LMS_TO_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

const M_OKLAB_TO_LMS = [
  [1.0, 0.3963377774, 0.2158037573],
  [1.0, -0.1055613458, -0.0638541728],
  [1.0, -0.0894841775, -1.291485548],
];

const M_LMS_TO_LINEAR_RGB = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

const cbrt = (v) => (v < 0 ? -Math.pow(-v, 1 / 3) : Math.pow(v, 1 / 3));

export function linearRgbToOklab({ r, g, b }) {
  const l = M_LINEAR_RGB_TO_LMS[0][0] * r + M_LINEAR_RGB_TO_LMS[0][1] * g + M_LINEAR_RGB_TO_LMS[0][2] * b;
  const m = M_LINEAR_RGB_TO_LMS[1][0] * r + M_LINEAR_RGB_TO_LMS[1][1] * g + M_LINEAR_RGB_TO_LMS[1][2] * b;
  const s = M_LINEAR_RGB_TO_LMS[2][0] * r + M_LINEAR_RGB_TO_LMS[2][1] * g + M_LINEAR_RGB_TO_LMS[2][2] * b;
  const l_ = cbrt(l);
  const m_ = cbrt(m);
  const s_ = cbrt(s);
  return {
    L: M_LMS_TO_OKLAB[0][0] * l_ + M_LMS_TO_OKLAB[0][1] * m_ + M_LMS_TO_OKLAB[0][2] * s_,
    a: M_LMS_TO_OKLAB[1][0] * l_ + M_LMS_TO_OKLAB[1][1] * m_ + M_LMS_TO_OKLAB[1][2] * s_,
    b: M_LMS_TO_OKLAB[2][0] * l_ + M_LMS_TO_OKLAB[2][1] * m_ + M_LMS_TO_OKLAB[2][2] * s_,
  };
}

export function oklabToLinearRgb({ L, a, b }) {
  const l_ = M_OKLAB_TO_LMS[0][0] * L + M_OKLAB_TO_LMS[0][1] * a + M_OKLAB_TO_LMS[0][2] * b;
  const m_ = M_OKLAB_TO_LMS[1][0] * L + M_OKLAB_TO_LMS[1][1] * a + M_OKLAB_TO_LMS[1][2] * b;
  const s_ = M_OKLAB_TO_LMS[2][0] * L + M_OKLAB_TO_LMS[2][1] * a + M_OKLAB_TO_LMS[2][2] * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: M_LMS_TO_LINEAR_RGB[0][0] * l + M_LMS_TO_LINEAR_RGB[0][1] * m + M_LMS_TO_LINEAR_RGB[0][2] * s,
    g: M_LMS_TO_LINEAR_RGB[1][0] * l + M_LMS_TO_LINEAR_RGB[1][1] * m + M_LMS_TO_LINEAR_RGB[1][2] * s,
    b: M_LMS_TO_LINEAR_RGB[2][0] * l + M_LMS_TO_LINEAR_RGB[2][1] * m + M_LMS_TO_LINEAR_RGB[2][2] * s,
  };
}

/** sRGB hex -> OKLab. */
export function hexToOklab(hex) {
  const { r, g, b } = hexToRgb(hex);
  return linearRgbToOklab({ r: linearize(r), g: linearize(g), b: linearize(b) });
}

/**
 * sRGB hex -> OKLCH `{ L, C, H }`, H in degrees on [0, 360).
 *
 * H is always numeric so that the value round-trips. Hue is however *not
 * meaningful* when C < ACHROMATIC_EPSILON; normative comparisons MUST go
 * through `hueDifference()`, which returns null in that case. That is the
 * guard v0.2 was missing (a pure white produced a spurious 158 degree hue
 * drift against a near-white).
 */
const hexToOklchUncached = (hex) => {
  const { L, a, b } = hexToOklab(hex);
  const C = Math.hypot(a, b);
  return { L, C, H: normalizeDegrees((Math.atan2(b, a) * 180) / Math.PI) };
};

export const hexToOklch = /* @__PURE__ */ memoize1(hexToOklchUncached);

/**
 * OKLCH -> sRGB, without gamut clipping. The returned channels may fall
 * outside [0,1]; use `isInSrgbGamut` / `oklchToHex` for safe values.
 */
export function oklchToRgbUnclipped({ L, C, H }) {
  const h = ((H ?? 0) * Math.PI) / 180;
  const rgbLinear = oklabToLinearRgb({ L, a: C * Math.cos(h), b: C * Math.sin(h) });
  return { r: delinearize(rgbLinear.r), g: delinearize(rgbLinear.g), b: delinearize(rgbLinear.b) };
}

export function isInSrgbGamut(rgb, epsilon = GAMUT_EPSILON) {
  return rgb.r >= -epsilon && rgb.r <= 1 + epsilon &&
         rgb.g >= -epsilon && rgb.g <= 1 + epsilon &&
         rgb.b >= -epsilon && rgb.b <= 1 + epsilon;
}

/**
 * Largest OKLCH chroma at (L, H) that stays inside the sRGB gamut.
 * Binary search; deterministic and bounded, so results are reproducible.
 * Memoised on a grid key: lightness comes from fixed grids and hue from a
 * small set of family anchors, so nearly every call repeats a known point.
 */
const maxChromaCache = new Map();

export function maxChromaAt(L, H, hi = 0.4, iterations = 18) {
  if (L <= 0 || L >= 1) return 0;
  const key = `${L.toFixed(4)}|${H.toFixed(2)}`;
  const cached = maxChromaCache.get(key);
  if (cached !== undefined) return cached;
  let lo = 0;
  let high = hi;
  if (isInSrgbGamut(oklchToRgbUnclipped({ L, C: high, H }))) return high;
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + high) / 2;
    if (isInSrgbGamut(oklchToRgbUnclipped({ L, C: mid, H }))) lo = mid;
    else high = mid;
  }
  const result = lo;
  if (maxChromaCache.size > 200000) maxChromaCache.clear();
  maxChromaCache.set(key, result);
  return result;
}

/** OKLCH -> sRGB hex, reducing chroma until the colour is inside the gamut. */
export function oklchToHex({ L, C, H }) {
  const c = Math.min(C, maxChromaAt(L, H));
  return rgbToHex(oklchToRgbUnclipped({ L, C: c, H }));
}

/**
 * OKLCH lightness that yields a given WCAG relative luminance, at fixed hue and
 * chroma. WCAG Y is monotonic in OKLCH L for a fixed (C, H), so bisection is safe.
 */
export function lightnessForLuminance(targetY, H, C, iterations = 40) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2;
    const y = relativeLuminance(oklchToRgbUnclipped({ L: mid, C: Math.min(C, maxChromaAt(mid, H)), H }));
    if (y < targetY) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------ *
 * CIELAB (D65) and CIEDE2000 (CIE 143:2000)
 * ------------------------------------------------------------------ */

const M_LINEAR_RGB_TO_XYZ_D65 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

const hexToLabUncached = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  const X = M_LINEAR_RGB_TO_XYZ_D65[0][0] * lr + M_LINEAR_RGB_TO_XYZ_D65[0][1] * lg + M_LINEAR_RGB_TO_XYZ_D65[0][2] * lb;
  const Y = M_LINEAR_RGB_TO_XYZ_D65[1][0] * lr + M_LINEAR_RGB_TO_XYZ_D65[1][1] * lg + M_LINEAR_RGB_TO_XYZ_D65[1][2] * lb;
  const Z = M_LINEAR_RGB_TO_XYZ_D65[2][0] * lr + M_LINEAR_RGB_TO_XYZ_D65[2][1] * lg + M_LINEAR_RGB_TO_XYZ_D65[2][2] * lb;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const f = (t) => (t > e ? Math.cbrt(t) : (k * t + 16) / 116);
  const fx = f(X / WHITE_POINT_D65.x);
  const fy = f(Y / WHITE_POINT_D65.y);
  const fz = f(Z / WHITE_POINT_D65.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
};

export const hexToLab = /* @__PURE__ */ memoize1(hexToLabUncached);

/**
 * CIEDE2000 colour difference (CIE 143:2000), operating on CIELAB values.
 * This is the normative definition v0.2 cited as a requirement (section 2.5)
 * without ever defining. Verified against the Sharma, Wu & Dalal (2005)
 * reference data set in tests/.
 */
export function deltaE2000Lab(Lab1, Lab2, kL = 1, kC = 1, kH = 1) {
  const { L: L1, a: a1, b: b1 } = Lab1;
  const { L: L2, a: a2, b: b2 } = Lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : normalizeDegrees((Math.atan2(b1, a1p) * 180) / Math.PI);
  const h2p = C2p === 0 ? 0 : normalizeDegrees((Math.atan2(b2, a2p) * 180) / Math.PI);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    const d = h2p - h1p;
    if (Math.abs(d) <= 180) dhp = d;
    else if (d > 180) dhp = d - 360;
    else dhp = d + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else {
    const d = Math.abs(h1p - h2p);
    const sum = h1p + h2p;
    if (d <= 180) hbp = sum / 2;
    else hbp = sum < 360 ? (sum + 360) / 2 : (sum - 360) / 2;
  }
  const T = 1
    - 0.17 * Math.cos(((hbp - 30) * Math.PI) / 180)
    + 0.24 * Math.cos((2 * hbp * Math.PI) / 180)
    + 0.32 * Math.cos(((3 * hbp + 6) * Math.PI) / 180)
    - 0.20 * Math.cos(((4 * hbp - 63) * Math.PI) / 180);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin((2 * dTheta * Math.PI) / 180) * Rc;
  const tL = dLp / (kL * Sl);
  const tC = dCp / (kC * Sc);
  const tH = dHp / (kH * Sh);
  return Math.sqrt(tL ** 2 + tC ** 2 + tH ** 2 + Rt * tC * tH);
}

/** CIEDE2000 between two sRGB hex values. */
export function deltaE2000(hex1, hex2, kL = 1, kC = 1, kH = 1) {
  return deltaE2000Lab(hexToLab(hex1), hexToLab(hex2), kL, kC, kH);
}

/* ------------------------------------------------------------------ *
 * Colour vision deficiency simulation
 * Machado, Oliveira & Fernandes (2009), severity 1.0, applied to linear sRGB.
 * This is the normative definition of `validateColorVision()` (v0.2 left it undefined).
 * ------------------------------------------------------------------ */

export const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export const CVD_TYPES = Object.keys(CVD_MATRICES);

/** Simulate a dichromacy on an sRGB hex. Returns an sRGB hex. */
export function simulateCvd(hex, type) {
  const m = CVD_MATRICES[type];
  if (!m) throw new Error(`unknown CVD type: ${type}`);
  const { r, g, b } = hexToRgb(hex);
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  const out = {
    r: delinearize(clamp01(m[0][0] * lr + m[0][1] * lg + m[0][2] * lb)),
    g: delinearize(clamp01(m[1][0] * lr + m[1][1] * lg + m[1][2] * lb)),
    b: delinearize(clamp01(m[2][0] * lr + m[2][1] * lg + m[2][2] * lb)),
  };
  return rgbToHex(out);
}

/* ------------------------------------------------------------------ *
 * Derived helpers used by the generator and the auditor
 * ------------------------------------------------------------------ */

/**
 * Shortest absolute hue difference in degrees between two OKLCH colours.
 *
 * Returns `null` when either colour is achromatic (C < ACHROMATIC_EPSILON),
 * because its hue is then numerically meaningless. Normative requirement
 * section 10.3 MUST treat `null` as `not_applicable`, never as a violation.
 *
 * Accepts either `{C, H}` objects or sRGB hex strings.
 */
export function hueDifference(a, b) {
  const pa = typeof a === 'string' ? hexToOklch(a) : a;
  const pb = typeof b === 'string' ? hexToOklch(b) : b;
  if (pa.C < ACHROMATIC_EPSILON || pb.C < ACHROMATIC_EPSILON) return null;
  const d = Math.abs(pa.H - pb.H) % 360;
  return d > 180 ? 360 - d : d;
}

/** True when the colour carries enough chroma for its hue to be meaningful. */
export function isChromatic(hex) {
  return hexToOklch(hex).C >= ACHROMATIC_EPSILON;
}

/** Round for presentation only. Decisions are always taken on raw values (section 2.4). */
export function present(value, digits = 2) {
  return Number(value.toFixed(digits));
}

export function toRgbTuple(hex) {
  const { r, g, b } = hexToRgb(hex);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
