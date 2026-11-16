/**
 * The video track of an MP4 or QuickTime (.mov) file, read from its `moov`
 * box, for the shot tracer's WebCodecs reader (`src/shotTracer/codecFrames.ts`):
 * where each encoded frame is in the file, when it is shown, which are
 * keyframes, the codec string and the decoder's configuration record, and how
 * the picture is turned for showing. Only the bytes needed are read: the box
 * headers at the top level, then the `moov` box (tens of kilobytes on a phone
 * video; an iPhone puts it after the frames, at the end of a file of 100 MB and
 * more). Never the whole file.
 *
 * Handles what phones and ffmpeg write: one `stsd` entry of `avc1`/`avc3`
 * (`avcC`), `hvc1`/`hev1` (`hvcC`, Dolby Vision profile 8 included: its base
 * layer is plain HEVC) or `vp09` (`vpcC`); `stts`, `ctts` (either version),
 * `stss`, `stsc`, `stsz`, `stco`/`co64`; `mdhd` and
 * `mvhd` time scales; the `tkhd` matrix as a turn of a quarter; an edit list of
 * at most one empty edit and one edit that starts the media somewhere. A
 * fragmented file (`moof`), another codec, or a stranger edit list is refused
 * with a short reason, and the reader falls back to playing the video.
 */

/** Bytes of a file, read a stretch at a time. */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** A Blob (a chosen File) as a `ByteSource`: each read is a slice, so a large file is never held whole. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
  };
}

/** One encoded frame. */
export interface Sample {
  /** Where it is in the file, bytes. */
  offset: number;
  size: number;
  /** When it is shown, seconds from the start of the video as played (the edit list applied); before 0 for frames cut by it. */
  t: number;
  /** How long it is shown, seconds. */
  duration: number;
  /** A keyframe: decoding can start here. */
  key: boolean;
}

export interface VideoTrack {
  /** The sample entry's type: `avc1`, `hvc1`, `vp09`... */
  fourcc: string;
  /** The WebCodecs codec string, e.g. `avc1.640028`, `hvc1.2.4.L150.B0`, `vp09.00.40.08.01.01.01.01.00`. */
  codec: string;
  /** The decoder's configuration record (`avcC` or `hvcC` without its box header); null where there is none (`vp09`). */
  description: Uint8Array | null;
  /** The picture as stored (`tkhd` would say otherwise only for a stretched one). */
  codedWidth: number;
  codedHeight: number;
  /** Turned clockwise this many degrees for showing (0, 90, 180, 270), from the track's matrix. */
  rotation: number;
  /** The picture as shown: the stored one turned. */
  width: number;
  height: number;
  /** Bits a luma sample, where the configuration record says (8 when it does not). */
  bitDepth: number;
  /** Seconds the video plays for. */
  duration: number;
  /** In decode order, as they are fed to a decoder. */
  samples: Sample[];
}

/** A file this reader does not understand, with a short reason for the screen's details line. */
export class Mp4Error extends Error {}

interface Box {
  type: string;
  /** Where its body starts and ends, within the bytes it was found in. */
  start: number;
  end: number;
}

/** The boxes laid one after another in `bytes` from `from` to `to`. */
function boxes(bytes: Uint8Array, from = 0, to = bytes.length): Box[] {
  const v = view(bytes);
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = v.getUint32(at);
    const type = fourcc(bytes, at + 4);
    let head = 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = Number(v.getBigUint64(at + 8));
      head = 16;
    } else if (size === 0) size = to - at;
    if (size < head || at + size > to) throw new Mp4Error(`bad ${type} box`);
    out.push({ type, start: at + head, end: at + size });
    at += size;
  }
  return out;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function child(bytes: Uint8Array, parent: Box, type: string): Box | undefined {
  return boxes(bytes, parent.start, parent.end).find((b) => b.type === type);
}

function need(box: Box | undefined, type: string): Box {
  if (!box) throw new Mp4Error(`no ${type}`);
  return box;
}

/**
 * Finds the `moov` box by its header alone, box after box from the start of
 * the file, and reads it.
 */
async function readMoov(src: ByteSource): Promise<Uint8Array> {
  let at = 0;
  let moof = false;
  while (at + 8 <= src.size) {
    const head = await src.read(at, Math.min(16, src.size - at));
    const v = view(head);
    let size = v.getUint32(0);
    const type = fourcc(head, 4);
    let skip = 8;
    if (size === 1) {
      if (head.length < 16) break;
      size = Number(v.getBigUint64(8));
      skip = 16;
    } else if (size === 0) size = src.size - at;
    if (size < skip) throw new Mp4Error(`bad ${type} box`);
    if (type === "moof") moof = true;
    if (type === "moov") {
      if (at + size > src.size) throw new Mp4Error("moov cut short");
      return (await src.read(at + skip, size - skip)).slice();
    }
    at += size;
  }
  throw new Mp4Error(moof ? "fragmented mp4" : "no moov");
}

/** The video track of the file in `src`. Rejects with an `Mp4Error` saying why where it cannot. */
export async function readVideoTrack(src: ByteSource): Promise<VideoTrack> {
  if (src.size < 8) throw new Mp4Error("not an mp4");
  const moov = await readMoov(src);
  return parseMoov(moov);
}

/** The video track described by a `moov` box's body. */
export function parseMoov(moov: Uint8Array): VideoTrack {
  const top: Box = { type: "moov", start: 0, end: moov.length };
  const all = boxes(moov, top.start, top.end);
  const mvhd = need(all.find((b) => b.type === "mvhd"), "mvhd");
  const movieScale = timescaleOf(moov, mvhd, 12, 20);
  const trak = all.filter((b) => b.type === "trak").find((t) => handler(moov, t) === "vide");
  if (!trak) throw new Mp4Error("no video track");
  return parseTrak(moov, trak, movieScale);
}

/** A full box's time scale: at `v0` bytes into its body for version 0, `v1` for version 1. */
function timescaleOf(bytes: Uint8Array, box: Box, v0: number, v1: number): number {
  const scale = view(bytes).getUint32(box.start + (bytes[box.start] === 1 ? v1 : v0));
  if (!scale) throw new Mp4Error("no time scale");
  return scale;
}

function handler(bytes: Uint8Array, trak: Box): string | null {
  const mdia = child(bytes, trak, "mdia");
  const hdlr = mdia && child(bytes, mdia, "hdlr");
  return hdlr ? fourcc(bytes, hdlr.start + 8) : null;
}

function parseTrak(bytes: Uint8Array, trak: Box, movieScale: number): VideoTrack {
  const v = view(bytes);
  const tkhd = need(child(bytes, trak, "tkhd"), "tkhd");
  const mdia = need(child(bytes, trak, "mdia"), "mdia");
  const mdhd = need(child(bytes, mdia, "mdhd"), "mdhd");
  const scale = timescaleOf(bytes, mdhd, 12, 20);
  const minf = need(child(bytes, mdia, "minf"), "minf");
  const stbl = need(child(bytes, minf, "stbl"), "stbl");
  const entry = sampleEntry(bytes, need(child(bytes, stbl, "stsd"), "stsd"));
  // The matrix is after the version, flags, times, ids, layer and volume.
  const m = tkhd.start + (bytes[tkhd.start] === 1 ? 52 : 40);
  const rotation = rotationOf(v.getInt32(m), v.getInt32(m + 4));
  const quarter = rotation % 180 !== 0;
  const edts = child(bytes, trak, "edts");
  const elst = edts && child(bytes, edts, "elst");
  const edit = elst ? editOf(bytes, elst, movieScale) : null;
  const samples = sampleTable(bytes, stbl, scale, edit);
  const last = samples.reduce((end, s) => Math.max(end, s.t + s.duration), 0);
  const duration = edit?.length !== undefined ? edit.lead + edit.length : last;
  return {
    ...entry,
    rotation,
    width: quarter ? entry.codedHeight : entry.codedWidth,
    height: quarter ? entry.codedWidth : entry.codedHeight,
    duration,
    samples
  };
}

/**
 * The turn clockwise, in degrees, of a track matrix whose first row is `a`,
 * `b` (16.16 fixed point): `a = cos`, `b = sin` of the turn. A phone's portrait
 * video is stored on its side with `a = 0`, `b = 1`: a quarter turn. Rounded to
 * the nearest quarter.
 */
export function rotationOf(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
}

interface Edit {
  /** Seconds of nothing before the media starts (an empty edit). */
  lead: number;
  /** The media time the video starts at, in the track's time scale units. */
  mediaTime: number;
  /** Seconds the edit plays for, when it says. */
  length?: number;
}

/**
 * The edit list as one start in the media and a lead before it: at most one
 * empty edit and then one edit at normal rate. Anything else (a list that
 * repeats or skips parts) is refused.
 */
function editOf(bytes: Uint8Array, elst: Box, movieScale: number): Edit | null {
  const v = view(bytes);
  const version = bytes[elst.start];
  const count = v.getUint32(elst.start + 4);
  const size = version === 1 ? 20 : 12;
  let lead = 0;
  for (let i = 0; i < count; i++) {
    const at = elst.start + 8 + i * size;
    const length = version === 1 ? Number(v.getBigUint64(at)) : v.getUint32(at);
    const mediaTime = version === 1 ? Number(v.getBigInt64(at + 8)) : v.getInt32(at + 4);
    if (mediaTime === -1) {
      if (i > 0) throw new Mp4Error("edit list with gaps");
      lead = length / movieScale;
      continue;
    }
    if (i !== count - 1) throw new Mp4Error("edit list with more than one edit");
    return { lead, mediaTime, length: length > 0 ? length / movieScale : undefined };
  }
  return lead > 0 ? { lead, mediaTime: 0 } : null;
}

/** The track's one sample entry: its type, size, codec string and configuration record. */
function sampleEntry(
  bytes: Uint8Array,
  stsd: Box
): { fourcc: string; codec: string; description: Uint8Array | null; codedWidth: number; codedHeight: number; bitDepth: number } {
  const v = view(bytes);
  if (v.getUint32(stsd.start + 4) < 1) throw new Mp4Error("no sample entry");
  const [entry] = boxes(bytes, stsd.start + 8, stsd.end);
  if (!entry) throw new Mp4Error("no sample entry");
  const type = entry.type;
  const codedWidth = v.getUint16(entry.start + 24);
  const codedHeight = v.getUint16(entry.start + 26);
  // The configuration boxes follow the 78 bytes of a visual sample entry.
  const inner = boxes(bytes, entry.start + 78, entry.end);
  const config = (name: string) => {
    const box = inner.find((b) => b.type === name);
    return box ? bytes.slice(box.start, box.end) : null;
  };
  const size = { codedWidth, codedHeight };
  if (type === "avc1" || type === "avc3") {
    const avcC = config("avcC");
    if (!avcC || avcC.length < 4) throw new Mp4Error(`${type} without avcC`);
    return { fourcc: type, codec: avcCodec(type, avcC), description: avcC, bitDepth: avcBitDepth(avcC), ...size };
  }
  if (type === "hvc1" || type === "hev1") {
    const hvcC = config("hvcC");
    if (!hvcC || hvcC.length < 23) throw new Mp4Error(`${type} without hvcC`);
    return { fourcc: type, codec: hevcCodec(type, hvcC), description: hvcC, bitDepth: (hvcC[17] & 7) + 8, ...size };
  }
  if (type === "vp09") {
    const vpcC = config("vpcC");
    if (!vpcC || vpcC.length < 12) throw new Mp4Error("vp09 without vpcC");
    return { fourcc: type, codec: vp9Codec(vpcC), description: null, bitDepth: vpcC[6] >> 4, ...size };
  }
  throw new Mp4Error(`codec ${type.trim() || "unknown"} not handled`);
}

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const dec2 = (n: number) => String(n).padStart(2, "0");

/** `avc1.PPCCLL`: profile, constraint flags and level from the `avcC` record. */
export function avcCodec(type: string, avcC: Uint8Array): string {
  return `${type}.${hex2(avcC[1])}${hex2(avcC[2])}${hex2(avcC[3])}`;
}

/**
 * Bits a luma sample of an H.264 stream: 8, unless a High 10 or higher profile
 * record says otherwise in its extension (after the parameter sets).
 */
function avcBitDepth(avcC: Uint8Array): number {
  const profile = avcC[1];
  if (![100, 110, 122, 144].includes(profile)) return 8;
  let at = 5;
  const sps = avcC[at++] & 31;
  for (let i = 0; i < sps && at + 2 <= avcC.length; i++) at += 2 + ((avcC[at] << 8) | avcC[at + 1]);
  if (at >= avcC.length) return 8;
  const pps = avcC[at++];
  for (let i = 0; i < pps && at + 2 <= avcC.length; i++) at += 2 + ((avcC[at] << 8) | avcC[at + 1]);
  // chroma_format, then bit_depth_luma_minus8 in the low three bits.
  return at + 1 < avcC.length ? (avcC[at + 1] & 7) + 8 : 8;
}

/**
 * The HEVC codec string (ISO/IEC 14496-15, annex E) from the `hvcC` record:
 * the profile space and profile, the compatibility flags in reverse bit order,
 * the tier and level, and the constraint bytes up to the last that is not
 * zero. An iPhone's HDR video: `hvc1.2.4.L150.B0`.
 */
export function hevcCodec(type: string, hvcC: Uint8Array): string {
  const space = hvcC[1] >> 6;
  const tier = (hvcC[1] >> 5) & 1;
  const profile = hvcC[1] & 31;
  const compat = ((hvcC[2] << 24) | (hvcC[3] << 16) | (hvcC[4] << 8) | hvcC[5]) >>> 0;
  let reversed = 0;
  for (let i = 0; i < 32; i++) if (compat & (1 << i)) reversed |= 1 << (31 - i);
  const constraints = Array.from(hvcC.subarray(6, 12));
  while (constraints.length && constraints[constraints.length - 1] === 0) constraints.pop();
  return [
    type,
    `${["", "A", "B", "C"][space]}${profile}`,
    (reversed >>> 0).toString(16).toUpperCase(),
    `${tier ? "H" : "L"}${hvcC[12]}`,
    ...constraints.map(hex2)
  ].join(".");
}

/** `vp09.PP.LL.DD.CC.cp.tc.mc.FF` from the `vpcC` record (a full box: its fields start 4 bytes in). */
export function vp9Codec(vpcC: Uint8Array): string {
  const [profile, level, bits, primaries, transfer, matrix] = [vpcC[4], vpcC[5], vpcC[6], vpcC[7], vpcC[8], vpcC[9]];
  return ["vp09", dec2(profile), dec2(level), dec2(bits >> 4), dec2((bits >> 1) & 7), dec2(primaries), dec2(transfer), dec2(matrix), dec2(bits & 1)].join(".");
}

/** Every sample of the track, in decode order, from its sample table. */
function sampleTable(bytes: Uint8Array, stbl: Box, scale: number, edit: Edit | null): Sample[] {
  const v = view(bytes);
  const find = (type: string) => child(bytes, stbl, type);
  // Sizes.
  const stsz = need(find("stsz"), "stsz");
  const fixed = v.getUint32(stsz.start + 4);
  const count = v.getUint32(stsz.start + 8);
  const sizes = new Uint32Array(count);
  for (let i = 0; i < count; i++) sizes[i] = fixed || v.getUint32(stsz.start + 12 + 4 * i);
  // Chunk offsets.
  const stco = find("stco");
  const co64 = find("co64");
  const offsetsBox = need(stco ?? co64, "stco");
  const chunks = v.getUint32(offsetsBox.start + 4);
  const chunkAt = (i: number) =>
    stco ? v.getUint32(offsetsBox.start + 8 + 4 * i) : Number(v.getBigUint64(offsetsBox.start + 8 + 8 * i));
  // Samples to chunks.
  const stsc = need(find("stsc"), "stsc");
  const runs = v.getUint32(stsc.start + 4);
  const offsets = new Float64Array(count);
  let n = 0;
  for (let r = 0; r < runs && n < count; r++) {
    const first = v.getUint32(stsc.start + 8 + 12 * r) - 1;
    const per = v.getUint32(stsc.start + 12 + 12 * r);
    const until = r + 1 < runs ? v.getUint32(stsc.start + 8 + 12 * (r + 1)) - 1 : chunks;
    for (let c = first; c < until && n < count; c++) {
      let at = chunkAt(c);
      for (let k = 0; k < per && n < count; k++) {
        offsets[n] = at;
        at += sizes[n++];
      }
    }
  }
  if (n < count) throw new Mp4Error("sample table cut short");
  // Decode times.
  const stts = need(find("stts"), "stts");
  const dts = new Float64Array(count);
  const durations = new Float64Array(count);
  let clock = 0;
  n = 0;
  for (let e = 0, entries = v.getUint32(stts.start + 4); e < entries; e++) {
    const many = v.getUint32(stts.start + 8 + 8 * e);
    const delta = v.getUint32(stts.start + 12 + 8 * e);
    for (let k = 0; k < many && n < count; k++, n++) {
      dts[n] = clock;
      durations[n] = delta;
      clock += delta;
    }
  }
  // Composition offsets: signed whichever the version (writers disagree).
  const ctts = find("ctts");
  const shown = Float64Array.from(dts);
  if (ctts) {
    n = 0;
    for (let e = 0, entries = v.getUint32(ctts.start + 4); e < entries; e++) {
      const many = v.getUint32(ctts.start + 8 + 8 * e);
      const off = v.getInt32(ctts.start + 12 + 8 * e);
      for (let k = 0; k < many && n < count; k++, n++) shown[n] += off;
    }
  }
  // Keyframes; none listed means every frame is one.
  const stss = find("stss");
  const keys = new Uint8Array(count).fill(stss ? 0 : 1);
  if (stss) {
    for (let e = 0, entries = v.getUint32(stss.start + 4); e < entries; e++) {
      const i = v.getUint32(stss.start + 8 + 4 * e) - 1;
      if (i >= 0 && i < count) keys[i] = 1;
    }
  }
  const shift = edit?.mediaTime ?? 0;
  const lead = edit?.lead ?? 0;
  return Array.from({ length: count }, (_, i) => ({
    offset: offsets[i],
    size: sizes[i],
    t: (shown[i] - shift) / scale + lead,
    duration: durations[i] / scale,
    key: keys[i] === 1
  }));
}

/**
 * The samples to feed a decoder for the frames shown from `from` to `to`
 * seconds: from the last keyframe at or before the first of them in decode
 * order, to the last of them in decode order (`last` inclusive). Frames are
 * shown in another order than they are decoded (B-frames), so both ends are
 * found over the frames themselves, not by time alone. Null when no frame is
 * shown in the stretch.
 */
export function decodeSpan(samples: readonly Sample[], from: number, to: number): { first: number; last: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  samples.forEach((s, i) => {
    if (s.t >= from - 1e-6 && s.t < to) {
      lo = Math.min(lo, i);
      hi = Math.max(hi, i);
    }
  });
  if (!Number.isFinite(lo)) return null;
  let first = lo;
  while (first > 0 && !samples[first].key) first--;
  return { first, last: hi };
}

/** The times of the frames shown from `from` to `to` seconds, in the order they are shown. */
export function shownTimes(samples: readonly Sample[], from = 0, to = Infinity): number[] {
  return samples
    .map((s) => s.t)
    .filter((t) => t >= from - 1e-6 && t < to)
    .sort((a, b) => a - b);
}
