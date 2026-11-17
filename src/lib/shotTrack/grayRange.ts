/**
 * The one gray the shot tracer works in: full range, 0 for black to 255 for
 * white. Every threshold in `lib/shotTrack` (the change map, the ball's
 * contrast, the lane's edges) was set on the harness's frames, which are
 * ffmpeg's `-pix_fmt gray`, and that is full range: on the clips, all
 * tagged limited (`tv`), it is 1.1647 Y - 18.68 against the luma plane
 * (measured 2026-11-17, as on 2026-11-15). A video's own luma plane is
 * mostly limited range (16 to 235, as phones and cameras record), so a frame
 * copied out of the decoder is brought to full range here; a frame drawn to a
 * canvas is RGB, already full range, and its luma is taken as it is
 * (`toGray`). Pure.
 */

export type GrayRange = "limited" | "full";

/**
 * The range a decoded frame's luma plane is in: what the decoder says of the
 * frame (`VideoFrame.colorSpace.fullRange`), else what the file says
 * (`VideoTrack.fullRange`: the `colr` box, or a VP9 record), else limited,
 * which is how H.264, HEVC and VP9 are recorded unless they say otherwise.
 */
export function lumaRange(frameFull: boolean | null | undefined, trackFull: boolean | null | undefined): GrayRange {
  if (typeof frameFull === "boolean") return frameFull ? "full" : "limited";
  if (typeof trackFull === "boolean") return trackFull ? "full" : "limited";
  return "limited";
}

/** Limited to full range: 16 to 0, 235 to 255, rounded, and what is outside clamped. */
const EXPAND = (() => {
  const t = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) t[v] = Math.round(((v - 16) * 255) / 219);
  return t;
})();

/** `gray` in full range, in place: a limited range picture expanded, a full range one as it is. Returns `gray`. */
export function toFullRange<T extends Uint8ClampedArray | Uint8Array>(gray: T, range: GrayRange): T {
  if (range === "full") return gray;
  for (let i = 0; i < gray.length; i++) gray[i] = EXPAND[gray[i]];
  return gray;
}
