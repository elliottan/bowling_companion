import { useEffect, useRef, type ReactNode } from "react";

/** A part of a frame, in its pixels. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A gray frame (full range, `grayRange.ts`) drawn into a canvas, or the part of
 * it in `crop`, with an SVG over it in the frame's own pixels.
 */
export function FramePicture({
  gray,
  width,
  height,
  crop,
  label,
  children
}: {
  gray: Uint8ClampedArray;
  width: number;
  height: number;
  crop?: Crop;
  /** What the picture shows, for a screen reader; the picture is then an image rather than decoration. */
  label?: string;
  children?: ReactNode;
}) {
  const own = useRef<HTMLCanvasElement | null>(null);
  const box = crop ?? { x: 0, y: 0, w: width, h: height };
  useEffect(() => {
    const c = own.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const img = ctx.createImageData(box.w, box.h);
    for (let y = 0; y < box.h; y++) {
      for (let x = 0; x < box.w; x++) {
        const g = gray[(y + box.y) * width + x + box.x];
        const k = 4 * (y * box.w + x);
        img.data[k] = img.data[k + 1] = img.data[k + 2] = g;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [gray, width, box.x, box.y, box.w, box.h]);
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-muted" role={label ? "img" : undefined} aria-label={label}>
      <canvas
        ref={own}
        width={box.w}
        height={box.h}
        className="block h-auto w-full"
      />
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="absolute inset-0 h-full w-full">
        {children}
      </svg>
    </div>
  );
}
