/**
 * Drawing helpers shared by the review scripts (`review-auto.ts`,
 * `review-frames.ts`): a real-factor enlarge, a crop box from lane points, a
 * JPEG writer, and thin lines and rings with a dark halo so they read on both
 * light wood and the dark pit.
 */
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { apply } from "../../src/lib/shotTrack/homography";
import type { Mat3 } from "../../src/lib/shotTrack/types";
import { canvas, circle, line, toPng, type Canvas, type Color } from "./draw";

export const MAX_W = 1100;

/** A crop of the frame enlarged by a real factor (bilinear), so a width cap never needs an integer. */
export function enlarge(c: Canvas, x0: number, y0: number, w: number, h: number, k: number): Canvas {
  const W = Math.round(w * k);
  const H = Math.round(h * k);
  const out = canvas(W, H);
  for (let y = 0; y < H; y++) {
    const sy = Math.max(0, Math.min(c.height - 1.001, y0 + (y + 0.5) / k - 0.5));
    const iy = Math.floor(sy);
    const fy = sy - iy;
    for (let x = 0; x < W; x++) {
      const sx = Math.max(0, Math.min(c.width - 1.001, x0 + (x + 0.5) / k - 0.5));
      const ix = Math.floor(sx);
      const fx = sx - ix;
      for (let ch = 0; ch < 3; ch++) {
        const g = (i: number, j: number) => c.rgb[(j * c.width + i) * 3 + ch];
        out.rgb[(y * W + x) * 3 + ch] = Math.round(
          (1 - fy) * ((1 - fx) * g(ix, iy) + fx * g(ix + 1, iy)) + fy * ((1 - fx) * g(ix, iy + 1) + fx * g(ix + 1, iy + 1))
        );
      }
    }
  }
  return out;
}

export interface Box { x: number; y: number; w: number; h: number }

/** The smallest box around lane points (u, v) pushed through H, grown by a margin, kept in the frame. */
export function boxOf(H: Mat3, pts: [number, number][], W: number, Hh: number, margin: number, extra: { x: number; y: number }[] = []): Box {
  const p = [...pts.map(([u, v]) => apply(H, { x: u, y: v })), ...extra];
  const x0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.x)) - margin));
  const x1 = Math.min(W, Math.ceil(Math.max(...p.map((q) => q.x)) + margin));
  const y0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.y)) - margin));
  const y1 = Math.min(Hh, Math.ceil(Math.max(...p.map((q) => q.y)) + margin));
  return { x: x0, y: y0, w: Math.max(8, x1 - x0), h: Math.max(8, y1 - y0) };
}

/** A canvas as a JPEG (yuvj444p, q 3), through a temporary PNG. */
export const jpg = (c: Canvas, file: string): void => {
  const tmp = file + ".png";
  writeFileSync(tmp, toPng(c));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", tmp, "-q:v", "3", "-pix_fmt", "yuvj444p", file]);
  rmSync(tmp);
};

/** A 1 px line with a faint dark halo one pixel to the side, so it reads on light and dark. */
export function thin(c: Canvas, x0: number, y0: number, x1: number, y1: number, col: Color, dash?: number): void {
  for (const [dx, dy] of [[1, 0], [0, 1]]) line(c, x0 + dx, y0 + dy, x1 + dx, y1 + dy, [0, 0, 0], { alpha: 0.4, dash });
  line(c, x0, y0, x1, y1, col, { dash });
}

/** A 1 px ring with a dark halo on both sides. */
export function ring(c: Canvas, cx: number, cy: number, r: number, col: Color): void {
  circle(c, cx, cy, r + 1, [0, 0, 0], 0.5);
  if (r > 2) circle(c, cx, cy, r - 1, [0, 0, 0], 0.5);
  circle(c, cx, cy, r, col);
}
