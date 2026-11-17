/**
 * `exp`, `log`, `sin`, `cos`, `atan` and `atan2` that give the same bits on
 * every JavaScript engine: fdlibm 5.3 (Sun Microsystems, 1993; the version
 * V8 carried in `base/ieee754.cc`), in plain double arithmetic. `Math`'s own
 * are only required to be close: Node 22 and Chromium 153 differ in the last
 * bit of `Math.exp`, `Math.sin`, `Math.atan2` and the rest on most inputs
 * (2026-11-17), and the lane finder and the tracer carry such a bit into a
 * different lane on a frame or a different circle on the ball: shot-01's
 * frames as the app read them, traced in each, read the pins 16.4 in Node
 * and 17.4 in Chromium. With these the harness, the browser and Safari give
 * one reading. `+ - * /` and `Math.sqrt` are exact in IEEE 754, and
 * `Math.hypot` agreed on every input tried; they are left as they are.
 *
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunPro, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
// Every engine the app runs on is little-endian: the low word first.
const LO = 0;
const HI = 1;

const highOf = (x: number): number => {
  f64[0] = x;
  return u32[HI] | 0;
};
const lowOf = (x: number): number => {
  f64[0] = x;
  return u32[LO];
};
const withHigh = (x: number, high: number): number => {
  f64[0] = x;
  u32[HI] = high >>> 0;
  return f64[0];
};
const fromWords = (high: number, low: number): number => {
  u32[HI] = high >>> 0;
  u32[LO] = low >>> 0;
  return f64[0];
};

const ln2HI = [6.93147180369123816490e-1, -6.93147180369123816490e-1];
const ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const INV_LN2 = 1.4426950408889634;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;
const HUGE = 1e300;
const TWOM1000 = 9.33263618503218878990e-302;

/** e to the `x` (fdlibm `__ieee754_exp`). */
export function exp(x: number): number {
  let hx = highOf(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  let hi = 0;
  let lo = 0;
  let k = 0;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lowOf(x)) !== 0) return x + x;
      return xsb === 0 ? x : 0;
    }
    if (x > 7.09782712893383973096e2) return HUGE * HUGE;
    if (x < -7.45133219101941108420e2) return TWOM1000 * TWOM1000;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      hi = x - ln2HI[xsb];
      lo = ln2LO[xsb];
      k = 1 - xsb - xsb;
    } else {
      k = (INV_LN2 * x + (xsb ? -0.5 : 0.5)) | 0;
      hi = x - k * ln2HI[0];
      lo = k * ln2LO[0];
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    if (HUGE + x > 1) return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  if (k >= -1021) return withHigh(y, highOf(y) + (k << 20));
  return withHigh(y, highOf(y) + ((k + 1000) << 20)) * TWOM1000;
}

const TWO54 = 1.8014398509481984e16;
const Lg1 = 0.6666666666666735;
const Lg2 = 3.999999999940941908e-1;
const Lg3 = 2.857142874366239149e-1;
const Lg4 = 2.222219843214978396e-1;
const Lg5 = 1.818357216161805012e-1;
const Lg6 = 1.531383769920937332e-1;
const Lg7 = 1.479819860511658591e-1;

/** The natural logarithm (fdlibm `__ieee754_log`). */
export function log(x: number): number {
  let hx = highOf(x);
  const lx = lowOf(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = highOf(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHigh(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) return k === 0 ? 0 : k * ln2HI[0] + k * ln2LO[0];
    const R = f * f * (0.5 - 0.3333333333333333 * f);
    return k === 0 ? f - R : k * ln2HI[0] - (R - k * ln2LO[0] - f);
  }
  const s = f / (2 + f);
  const dk = k;
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + R)) : dk * ln2HI[0] - (hfsq - (s * (hfsq + R) + dk * ln2LO[0]) - f);
  }
  return k === 0 ? f - s * (f - R) : dk * ln2HI[0] - (s * (f - R) - dk * ln2LO[0] - f);
}

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

/** sin on [-pi/4, pi/4], `x + y` the argument (fdlibm `__kernel_sin`); `iy` 0 when `y` is 0. */
function kernelSin(x: number, y: number, iy: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return x;
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

/** cos on [-pi/4, pi/4], `x + y` the argument (fdlibm `__kernel_cos`). */
function kernelCos(x: number, y: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return 1;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;
const NPIO2_HW = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb, 0x402921fb, 0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c, 0x40346b9c, 0x4035fdbb,
  0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a, 0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c, 0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb,
  0x4046c6cb, 0x40478fdb, 0x404858eb, 0x404921fb
];

/** `x` less the nearest multiple n of pi/2, as y0 + y1, and n (fdlibm `__ieee754_rem_pio2`, without its huge-argument part). */
const rem = [0, 0];
function remPio2(x: number): number {
  const hx = highOf(x);
  const ix = hx & 0x7fffffff;
  if (ix < 0x4002d97c) {
    // |x| < 3pi/4: one subtraction.
    if (hx > 0) {
      let z = x - PIO2_1;
      if (ix !== 0x3ff921fb) {
        rem[0] = z - PIO2_1T;
        rem[1] = z - rem[0] - PIO2_1T;
      } else {
        z -= PIO2_2;
        rem[0] = z - PIO2_2T;
        rem[1] = z - rem[0] - PIO2_2T;
      }
      return 1;
    }
    let z = x + PIO2_1;
    if (ix !== 0x3ff921fb) {
      rem[0] = z + PIO2_1T;
      rem[1] = z - rem[0] + PIO2_1T;
    } else {
      z += PIO2_2;
      rem[0] = z + PIO2_2T;
      rem[1] = z - rem[0] + PIO2_2T;
    }
    return -1;
  }
  if (ix <= 0x413921fb) {
    // |x| up to 2^19 pi/2: the medium case.
    const t = Math.abs(x);
    const n = (t * INV_PIO2 + 0.5) | 0;
    const fn = n;
    let r = t - fn * PIO2_1;
    let w = fn * PIO2_1T;
    if (n < 32 && ix !== NPIO2_HW[n - 1]) {
      rem[0] = r - w;
    } else {
      const j = ix >> 20;
      rem[0] = r - w;
      let i = j - ((highOf(rem[0]) >> 20) & 0x7ff);
      if (i > 16) {
        let t2 = r;
        w = fn * PIO2_2;
        r = t2 - w;
        w = fn * PIO2_2T - (t2 - r - w);
        rem[0] = r - w;
        i = j - ((highOf(rem[0]) >> 20) & 0x7ff);
        if (i > 49) {
          t2 = r;
          w = fn * PIO2_3;
          r = t2 - w;
          w = fn * PIO2_3T - (t2 - r - w);
          rem[0] = r - w;
        }
      }
    }
    rem[1] = r - rem[0] - w;
    if (hx < 0) {
      rem[0] = -rem[0];
      rem[1] = -rem[1];
      return -n;
    }
    return n;
  }
  return NaN;
}

/** The sine (fdlibm `sin`); past 2^19 pi/2, or not finite, `Math.sin`. */
export function sin(x: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0);
  const n = remPio2(x);
  if (Number.isNaN(n)) return Math.sin(x);
  switch (n & 3) {
    case 0:
      return kernelSin(rem[0], rem[1], 1);
    case 1:
      return kernelCos(rem[0], rem[1]);
    case 2:
      return -kernelSin(rem[0], rem[1], 1);
    default:
      return -kernelCos(rem[0], rem[1]);
  }
}

/** The cosine (fdlibm `cos`); past 2^19 pi/2, or not finite, `Math.cos`. */
export function cos(x: number): number {
  const ix = highOf(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0);
  const n = remPio2(x);
  if (Number.isNaN(n)) return Math.cos(x);
  switch (n & 3) {
    case 0:
      return kernelCos(rem[0], rem[1]);
    case 1:
      return -kernelSin(rem[0], rem[1], 1);
    case 2:
      return -kernelCos(rem[0], rem[1]);
    default:
      return kernelSin(rem[0], rem[1], 1);
  }
}

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2
];

/** The arc tangent (fdlibm `atan`). */
export function atan(x: number): number {
  const hx = highOf(x);
  const ix = hx & 0x7fffffff;
  let id: number;
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lowOf(x) !== 0)) return x + x;
    return hx > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000 && HUGE + x > 1) return x;
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const z2 = ATAN_HI[id] - (x * (s1 + s2) - ATAN_LO[id] - x);
  return hx < 0 ? -z2 : z2;
}

const PI_O_4 = 7.8539816339744827900e-1;
const PI_O_2 = 1.5707963267948965580;
const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;
const TINY = 1e-300;

/** The angle of (x, y) (fdlibm `__ieee754_atan2`). */
export function atan2(y: number, x: number): number {
  const hx = highOf(x);
  const ix = hx & 0x7fffffff;
  const lx = lowOf(x);
  const hy = highOf(y);
  const iy = hy & 0x7fffffff;
  const ly = lowOf(y);
  if ((ix | ((lx | -lx) >>> 31)) >>> 0 > 0x7ff00000 || (iy | ((ly | -ly) >>> 31)) >>> 0 > 0x7ff00000) return x + y;
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y);
  const m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
  if ((iy | ly) === 0) {
    switch (m) {
      case 0:
      case 1:
        return y;
      case 2:
        return PI + TINY;
      default:
        return -PI - TINY;
    }
  }
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0:
          return PI_O_4 + TINY;
        case 1:
          return -PI_O_4 - TINY;
        case 2:
          return 3 * PI_O_4 + TINY;
        default:
          return -3 * PI_O_4 - TINY;
      }
    }
    switch (m) {
      case 0:
        return 0;
      case 1:
        return -0;
      case 2:
        return PI + TINY;
      default:
        return -PI - TINY;
    }
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) z = PI_O_2 + 0.5 * PI_LO;
  else if (hx < 0 && k < -60) z = 0;
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}
