import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";

/** A tiny RGB canvas for the harness's overlays. Never shipped. */
export interface Canvas {
  width: number;
  height: number;
  rgb: Uint8Array;
}

export type Color = [number, number, number];

export const RED: Color = [255, 40, 40];
export const GREEN: Color = [40, 230, 60];
export const BLUE: Color = [60, 140, 255];
export const YELLOW: Color = [255, 230, 0];
export const CYAN: Color = [0, 230, 230];
export const MAGENTA: Color = [255, 0, 220];
export const WHITE: Color = [255, 255, 255];
export const BLACK: Color = [0, 0, 0];
export const ORANGE: Color = [255, 150, 0];

export function canvas(width: number, height: number, fill: Color = BLACK): Canvas {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) rgb.set(fill, i * 3);
  return { width, height, rgb };
}

export function fromRgb(rgb: Uint8Array, width: number, height: number): Canvas {
  return { width, height, rgb: new Uint8Array(rgb) };
}

export function fromGray(data: ArrayLike<number>, width: number, height: number): Canvas {
  const c = canvas(width, height);
  for (let i = 0; i < width * height; i++) {
    const g = Math.max(0, Math.min(255, Math.round(data[i])));
    c.rgb[i * 3] = c.rgb[i * 3 + 1] = c.rgb[i * 3 + 2] = Number.isFinite(data[i]) ? g : 0;
  }
  return c;
}

export function plot(c: Canvas, x: number, y: number, col: Color, alpha = 1): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= c.width || yi >= c.height) return;
  const i = (yi * c.width + xi) * 3;
  for (let k = 0; k < 3; k++) c.rgb[i + k] = Math.round(c.rgb[i + k] * (1 - alpha) + col[k] * alpha);
}

export function line(c: Canvas, x0: number, y0: number, x1: number, y1: number, col: Color, opts: { dash?: number; alpha?: number } = {}): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    if (opts.dash && Math.floor(i / opts.dash) % 2 === 1) continue;
    plot(c, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col, opts.alpha ?? 1);
  }
}

export function circle(c: Canvas, cx: number, cy: number, r: number, col: Color, alpha = 1): void {
  const n = Math.max(12, Math.ceil(2 * Math.PI * r));
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    plot(c, cx + r * Math.cos(a), cy + r * Math.sin(a), col, alpha);
  }
}

export function cross(c: Canvas, x: number, y: number, s: number, col: Color): void {
  line(c, x - s, y, x + s, y, col);
  line(c, x, y - s, x, y + s, col);
}

export function dot(c: Canvas, x: number, y: number, r: number, col: Color): void {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) plot(c, x + i, y + j, col);
}

/** Crop a rectangle and enlarge it by an integer factor (nearest pixel). */
export function cropScale(c: Canvas, x0: number, y0: number, w: number, h: number, k: number): Canvas {
  const out = canvas(w * k, h * k);
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const sx = Math.floor(x / k) + x0;
      const sy = Math.floor(y / k) + y0;
      if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
      const si = (sy * c.width + sx) * 3;
      out.rgb.set(c.rgb.subarray(si, si + 3), (y * w * k + x) * 3);
    }
  }
  return out;
}

// A 3 by 5 pixel font: digits and the few signs the overlays print.
const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001111", ".": "000000000000010", "-": "000000111000000",
  " ": "000000000000000", ":": "000010000010000", "/": "001001010100100", "%": "101001010100101",
  f: "011100110100100", t: "010111010010011", b: "100100111101111", m: "000000111111101",
  p: "000111101111100", h: "100100111101101", L: "100100100100111", A: "010101111101101",
  B: "110101110101110", P: "111101111100100", T: "111010010010010", D: "110101101101110",
  E: "111100110100111", R: "110101110101101", "#": "101111101111101", "~": "000011110000000"
};

/** Text at (x, y) top left, each font pixel drawn as an s by s block, on a dark box. */
export function text(c: Canvas, x: number, y: number, s: string, col: Color, scale = 2): void {
  const w = s.length * 4 * scale;
  for (let j = -1; j < 5 * scale + 1; j++) for (let i = -1; i < w; i++) plot(c, x + i, y + j, BLACK, 0.6);
  for (let n = 0; n < s.length; n++) {
    const g = GLYPHS[s[n]] ?? GLYPHS[" "];
    for (let r = 0; r < 5; r++) {
      for (let q = 0; q < 3; q++) {
        if (g[r * 3 + q] !== "1") continue;
        for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) plot(c, x + (n * 4 + q) * scale + a, y + r * scale + b, col);
      }
    }
  }
}

export function toPng(c: Canvas): Buffer {
  const png = new PNG({ width: c.width, height: c.height });
  for (let i = 0; i < c.width * c.height; i++) {
    png.data[i * 4] = c.rgb[i * 3];
    png.data[i * 4 + 1] = c.rgb[i * 3 + 1];
    png.data[i * 4 + 2] = c.rgb[i * 3 + 2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

export function savePng(c: Canvas, path: string): void {
  writeFileSync(path, toPng(c));
}

/**
 * Local contrast stretch, for finding faint lane marks by eye: each pixel's
 * grey is stretched between the 2nd and 98th percentile of the grey around it
 * (a `win` pixel square), colour kept as a tint.
 */
export function stretch(c: Canvas, win = 24): Canvas {
  const { width: W, height: H } = c;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * c.rgb[i * 3] + 0.587 * c.rgb[i * 3 + 1] + 0.114 * c.rgb[i * 3 + 2];
  const t = Math.max(4, Math.round(win / 2));
  const tw = Math.ceil(W / t);
  const th = Math.ceil(H / t);
  const lo = new Float32Array(tw * th);
  const hi = new Float32Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const xs: number[] = [];
      for (let y = Math.max(0, (ty - 1) * t); y < Math.min(H, (ty + 2) * t); y += 1) {
        for (let x = Math.max(0, (tx - 1) * t); x < Math.min(W, (tx + 2) * t); x += 1) xs.push(g[y * W + x]);
      }
      xs.sort((a, b) => a - b);
      lo[ty * tw + tx] = xs[Math.floor(0.02 * (xs.length - 1))];
      hi[ty * tw + tx] = xs[Math.ceil(0.98 * (xs.length - 1))];
    }
  }
  const out = canvas(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Bilinear between the tile centres, so no tile edges show.
      const fx = Math.max(0, Math.min(tw - 1.001, x / t - 0.5));
      const fy = Math.max(0, Math.min(th - 1.001, y / t - 0.5));
      const ix = Math.min(tw - 2, Math.floor(fx));
      const iy = Math.min(th - 2, Math.floor(fy));
      const ax = tw > 1 ? fx - ix : 0;
      const ay = th > 1 ? fy - iy : 0;
      const at = (a: Float32Array, i: number, j: number) => a[Math.max(0, Math.min(th - 1, j)) * tw + Math.max(0, Math.min(tw - 1, i))];
      const bl = (a: Float32Array) =>
        (1 - ay) * ((1 - ax) * at(a, ix, iy) + ax * at(a, ix + 1, iy)) + ay * ((1 - ax) * at(a, ix, iy + 1) + ax * at(a, ix + 1, iy + 1));
      const l0 = bl(lo);
      const span = Math.max(12, bl(hi) - l0);
      const v = Math.max(0, Math.min(255, ((g[y * W + x] - l0) / span) * 255));
      const i = y * W + x;
      const gi = Math.max(1, g[i]);
      for (let ch = 0; ch < 3; ch++) out.rgb[i * 3 + ch] = Math.max(0, Math.min(255, v * (0.7 + (0.3 * c.rgb[i * 3 + ch]) / gi)));
    }
  }
  return out;
}
