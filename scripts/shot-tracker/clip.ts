import { execFileSync } from "node:child_process";
import type { GrayFrame } from "../../src/lib/shotTrack/types";

/**
 * A decoded clip held in memory as grey bytes, one buffer for every frame,
 * with the timestamps the file recorded (the sample clips have a variable
 * frame rate, so frames are never counted into time).
 */
export interface Clip {
  path: string;
  width: number;
  height: number;
  count: number;
  times: number[];
  frame(i: number): GrayFrame;
}

export function loadClip(path: string): Clip {
  const probe = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-show_entries", "frame=pts_time,best_effort_timestamp_time",
    "-of", "json", path
  ], { maxBuffer: 64 << 20 }).toString();
  const info = JSON.parse(probe) as {
    streams: { width: number; height: number }[];
    frames: { pts_time?: string; best_effort_timestamp_time?: string }[];
  };
  const { width, height } = info.streams[0];
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "gray", "-vsync", "passthrough", "-"], {
    maxBuffer: 1.5e9
  });
  const size = width * height;
  const count = Math.floor(raw.length / size);
  const stamps = info.frames.map((f) => Number(f.pts_time ?? f.best_effort_timestamp_time));
  const t0 = stamps[0] ?? 0;
  const times = Array.from({ length: count }, (_, i) => (stamps[i] ?? stamps[stamps.length - 1] + (i - stamps.length + 1) / 60) - t0);
  return {
    path,
    width,
    height,
    count,
    times,
    frame(i: number): GrayFrame {
      return { width, height, data: raw.subarray(i * size, (i + 1) * size), t: times[i] };
    }
  };
}

/** One frame in colour (RGB bytes), for drawing over. */
export function loadColorFrame(path: string, index: number, width: number, height: number): Uint8Array {
  const raw = execFileSync("ffmpeg", [
    "-v", "error", "-i", path, "-vf", `select=eq(n\\,${index})`, "-frames:v", "1", "-vsync", "passthrough",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
  ], { maxBuffer: 256 << 20 });
  if (raw.length < width * height * 3) throw new Error(`frame ${index} not decoded`);
  return new Uint8Array(raw.buffer, raw.byteOffset, width * height * 3);
}
