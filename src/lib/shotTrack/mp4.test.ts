import { describe, expect, it } from "vitest";
import { avcCodec, blobSource, decodeSpan, hevcCodec, Mp4Error, parseMoov, readVideoTrack, rotationOf, shownTimes, vp9Codec, type ByteSource } from "./mp4";

// The fixtures are read off disk. The app's type config carries no node
// types (tsconfig.app.json), so node's file API is reached untyped, by name.
const NODE_FS = "node:fs";
const NODE_URL = "node:url";
const openAsBlob = async (path: string): Promise<Blob> => (await import(/* @vite-ignore */ NODE_FS)).openAsBlob(path);
const fixture = async (name: string): Promise<string> =>
  (await import(/* @vite-ignore */ NODE_URL)).fileURLToPath(new URL(`../../../scripts/shot-tracker/fixtures/${name}`, import.meta.url));

/** A file as a source that counts the bytes read. */
async function counted(path: string): Promise<ByteSource & { bytes: number }> {
  const src = blobSource(await openAsBlob(path));
  const out = {
    size: src.size,
    bytes: 0,
    read: async (offset: number, length: number) => {
      out.bytes += length;
      return src.read(offset, length);
    }
  };
  return out;
}

describe("the real files (checked against ffprobe)", () => {
  it("reads the iPhone original: HEVC 10-bit, stored on its side, moov at the end, an edit list into the media", async () => {
    const src = await counted(await fixture("originals/IMG_1996.mov"));
    const track = await readVideoTrack(src);
    expect(track.fourcc).toBe("hvc1");
    expect(track.codec).toBe("hvc1.2.4.L150.B0");
    expect(track.description?.[0]).toBe(1);
    expect(track.description?.length).toBe(130);
    expect([track.codedWidth, track.codedHeight, track.rotation, track.width, track.height]).toEqual([1920, 1080, 90, 1080, 1920]);
    expect(track.bitDepth).toBe(10);
    // The edit's 17060 ticks of 2400.
    expect(track.duration).toBeCloseTo(17060 / 2400, 9);
    expect(track.samples.length).toBe(896);
    expect(track.samples.filter((s) => s.key).length).toBe(9);
    // ffprobe's first packet: pos 143109, 153830 bytes, a keyframe at pts -1741 (this reader's times sit 16 ticks later than ffmpeg's, all of them).
    expect(track.samples[0]).toMatchObject({ offset: 143109, size: 153830, key: true });
    expect(track.samples[0].t).toBeCloseTo((-1741 + 16) / 2400, 9);
    expect(track.samples[1]).toMatchObject({ offset: 296939, size: 65398, key: false });
    expect(track.samples[1].t).toBeCloseTo((-1661 + 16) / 2400, 9);
    // 44 frames before the edit starts, decoded but never shown; 852 shown.
    expect(track.samples.filter((s) => s.t < 0).length).toBe(44);
    expect(shownTimes(track.samples, 0).length).toBe(852);
    // Only the headers and the 25 kB moov of a 25 MB file were read.
    expect(src.bytes).toBeLessThan(30_000);
  });

  const clips: [string, string, number, number, number, number, number][] = [
    // name, codec, samples, keys, first shown, first offset, first size
    ["shot-01", "avc1.640020", 279, 2, 0.016016, 4263, 53173],
    ["shot-02", "avc1.640020", 242, 1, 0.016016, 3823, 55743],
    ["shot-03", "avc1.640020", 285, 2, 0, 4361, 52998],
    ["shot-04", "avc1.640020", 203, 1, 0, 3325, 42427],
    ["shot-05", "avc1.64002A", 553, 3, 0, 7582, 47255],
    ["shot-06", "avc1.64001F", 126, 1, 0, 2415, 31667]
  ];
  it.each(clips)("reads %s, an H.264 clip with its moov first", async (name, codec, count, keys, first, offset, size) => {
    const track = await readVideoTrack(blobSource(await openAsBlob(await fixture(`clips/${name}.mp4`))));
    expect(track.codec).toBe(codec);
    expect(track.rotation).toBe(0);
    expect(track.bitDepth).toBe(8);
    expect(track.samples.length).toBe(count);
    expect(track.samples.filter((s) => s.key).length).toBe(keys);
    expect(track.samples[0]).toMatchObject({ offset, size, key: true });
    expect(shownTimes(track.samples)[0]).toBeCloseTo(first, 4);
    // Every frame is shown, in time order (shot-03 and shot-05 have frames that share a time, as recorded).
    const shown = shownTimes(track.samples);
    expect(shown.length).toBe(count);
    shown.slice(1).forEach((t, i) => expect(t).toBeGreaterThanOrEqual(shown[i]));
  });

  it("finds the samples to decode for a stretch: from the keyframe before it to the last frame shown in it", async () => {
    const { samples } = await readVideoTrack(blobSource(await openAsBlob(await fixture("originals/IMG_1996.mov"))));
    const span = decodeSpan(samples, 3.0, 3.5)!;
    expect(samples[span.first].key).toBe(true);
    expect(samples[span.first].t).toBeLessThanOrEqual(3.0);
    samples.forEach((s, i) => {
      if (s.t >= 3.0 && s.t < 3.5) expect(i >= span.first && i <= span.last).toBe(true);
    });
    // No keyframe in between: the one before it is the closest.
    expect(samples.slice(span.first + 1).findIndex((s) => s.key && s.t <= 3.0)).toBe(-1);
    expect(samples[span.last].t).toBeLessThan(3.5);
    expect(decodeSpan(samples, 20, 30)).toBeNull();
    expect(shownTimes(samples, 3.0, 3.5).every((t, i, all) => t >= 3.0 && t < 3.5 && (i === 0 || t > all[i - 1]))).toBe(true);
  });
});

// A file built a box at a time, for what the real files do not have.
type Bytes = number[] | Uint8Array;
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u64 = (n: number) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const cat = (...parts: Bytes[]) => Uint8Array.from(parts.flatMap((p) => Array.from(p)));
const box = (type: string, ...body: Bytes[]) => {
  const b = cat(...body);
  return cat(u32(8 + b.length), text(type), b);
};
const zeros = (n: number) => new Array<number>(n).fill(0);

interface Build {
  entry?: Uint8Array;
  matrix?: [number, number];
  tkhdV1?: boolean;
  mdhdV1?: boolean;
  elst?: Uint8Array | null;
  co64?: boolean;
  keys?: number[] | null;
  ctts?: number[] | null;
  handler?: string;
  extra?: Uint8Array[];
}

/** An entry of a visual sample entry of `type`, `w` by `h`, with configuration boxes. */
const entry = (type: string, w: number, h: number, ...config: Uint8Array[]) => box(type, zeros(24), u16(w), u16(h), zeros(50), ...config);

/** Four samples of 100, 200, 300, 400 bytes in two chunks at 1000 and 5000, a frame every 10 ticks of 600. */
function moov(b: Build = {}): Uint8Array {
  const [ma, mb] = b.matrix ?? [0x10000, 0];
  const matrix = [...u32(ma), ...u32(mb), ...u32(0), ...u32(-mb), ...u32(ma), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
  const tkhd = b.tkhdV1 ? box("tkhd", [1, 0, 0, 0], zeros(32), zeros(16), matrix, zeros(8)) : box("tkhd", zeros(40), matrix, zeros(8));
  const mdhd = b.mdhdV1 ? box("mdhd", [1, 0, 0, 0], zeros(16), u32(600), u64(40), zeros(4)) : box("mdhd", zeros(12), u32(600), u32(40), zeros(4));
  const sizes = [100, 200, 300, 400];
  const stbl = box(
    "stbl",
    box("stsd", zeros(4), u32(1), b.entry ?? entry("avc1", 64, 48, box("avcC", [1, 0x64, 0, 0x1f, 0xff, 0xe0, 0]))),
    box("stts", zeros(4), u32(1), u32(4), u32(10)),
    ...(b.ctts === null ? [] : [box("ctts", zeros(4), u32(4), (b.ctts ?? [10, 30, 0, 0]).flatMap((o) => [...u32(1), ...u32(o)]))]),
    ...(b.keys === null ? [] : [box("stss", zeros(4), u32((b.keys ?? [1]).length), ...(b.keys ?? [1]).map(u32))]),
    box("stsc", zeros(4), u32(1), u32(1), u32(2), u32(1)),
    box("stsz", zeros(4), u32(0), u32(4), ...sizes.map(u32)),
    b.co64 ? box("co64", zeros(4), u32(2), u64(2 ** 33), u64(2 ** 33 + 4000)) : box("stco", zeros(4), u32(2), u32(1000), u32(5000))
  );
  const mdia = box("mdia", mdhd, box("hdlr", zeros(8), text(b.handler ?? "vide"), zeros(12)), box("minf", stbl));
  const edts = b.elst === undefined || b.elst === null ? [] : [box("edts", b.elst)];
  const trak = box("trak", tkhd, ...edts, mdia);
  return box("moov", box("mvhd", zeros(12), u32(1000), zeros(84)), ...(b.extra ?? []), trak);
}

/** The body of a built `moov`, as `parseMoov` takes it. */
const body = (m: Uint8Array) => m.subarray(8);

const memory = (bytes: Uint8Array): ByteSource => ({ size: bytes.length, read: async (o, n) => bytes.subarray(o, o + n) });

describe("the boxes a phone or ffmpeg may write", () => {
  it("lays samples out by chunk, times them by stts and ctts, and marks keyframes by stss", () => {
    const track = parseMoov(body(moov()));
    expect(track.codec).toBe("avc1.64001F");
    expect(track.samples.map((s) => [s.offset, s.size, s.key])).toEqual([
      [1000, 100, true],
      [1100, 200, false],
      [5000, 300, false],
      [5300, 400, false]
    ]);
    // dts 0, 10, 20, 30 plus ctts 10, 30, 0, 0 over 600.
    expect(track.samples.map((s) => s.t * 600)).toEqual([10, 40, 20, 30]);
    expect(track.samples.every((s) => s.duration === 10 / 600)).toBe(true);
    expect(track.duration).toBeCloseTo(50 / 600, 9);
  });

  it("takes every frame for a keyframe without stss, the decode time without ctts, and 64-bit chunk offsets", () => {
    const track = parseMoov(body(moov({ keys: null, ctts: null, co64: true, tkhdV1: true, mdhdV1: true })));
    expect(track.samples.every((s) => s.key)).toBe(true);
    expect(track.samples.map((s) => s.t * 600)).toEqual([0, 10, 20, 30]);
    expect(track.samples[2].offset).toBe(2 ** 33 + 4000);
    expect(track.samples[1].offset).toBe(2 ** 33 + 100);
  });

  it("applies an edit list: an empty edit first, then the media from a time, version 0 or 1", () => {
    const v0 = box("elst", zeros(4), u32(2), u32(250), u32(-1 >>> 0), u32(0x10000), u32(40), u32(10), u32(0x10000));
    const t0 = parseMoov(body(moov({ elst: v0 })));
    // 250 of 1000 lead, then media from tick 10 of 600.
    expect(t0.samples[0].t).toBeCloseTo(0.25, 9);
    expect(t0.samples[1].t).toBeCloseTo(0.25 + 30 / 600, 9);
    expect(t0.duration).toBeCloseTo(0.25 + 0.04, 9);
    const v1 = box("elst", [1, 0, 0, 0], u32(1), u64(0), u64(20), u32(0x10000));
    const t1 = parseMoov(body(moov({ elst: v1 })));
    expect(t1.samples.map((s) => Math.round(s.t * 600))).toEqual([-10, 20, 0, 10]);
    // No length given: as long as the frames.
    expect(t1.duration).toBeCloseTo(30 / 600, 9);
    const lead = box("elst", zeros(4), u32(1), u32(500), u32(-1 >>> 0), u32(0x10000));
    expect(parseMoov(body(moov({ elst: lead }))).samples[0].t).toBeCloseTo(0.5 + 10 / 600, 9);
    const none = box("elst", zeros(4), u32(0));
    expect(parseMoov(body(moov({ elst: none }))).samples[0].t).toBeCloseTo(10 / 600, 9);
  });

  it("refuses an edit list that repeats or leaves gaps", () => {
    const two = box("elst", zeros(4), u32(2), u32(40), u32(0), u32(0x10000), u32(40), u32(0), u32(0x10000));
    expect(() => parseMoov(body(moov({ elst: two })))).toThrow("more than one edit");
    const gap = box("elst", zeros(4), u32(2), u32(40), u32(-1 >>> 0), u32(0x10000), u32(40), u32(-1 >>> 0), u32(0x10000));
    expect(() => parseMoov(body(moov({ elst: gap })))).toThrow("gaps");
  });

  it("turns the picture by the track matrix", () => {
    expect(rotationOf(0x10000, 0)).toBe(0);
    expect(rotationOf(0, 0x10000)).toBe(90);
    expect(rotationOf(-0x10000, 0)).toBe(180);
    expect(rotationOf(0, -0x10000)).toBe(270);
    expect(rotationOf(0, 0)).toBe(0);
    const side = parseMoov(body(moov({ matrix: [0, 0x10000] })));
    expect([side.rotation, side.width, side.height]).toEqual([90, 48, 64]);
    const upside = parseMoov(body(moov({ matrix: [-0x10000, 0] })));
    expect([upside.rotation, upside.width, upside.height]).toEqual([180, 64, 48]);
  });

  it("builds HEVC and VP9 codec strings and reads their bit depth", () => {
    // Profile space 1, high tier, profile 1, compatibility bits 1 and 2, level 120, one constraint byte.
    const hvcC = cat([1, (1 << 6) | (1 << 5) | 1], u32(0x60000000), [0x90, 0, 0, 0, 0, 0], [120], zeros(3), [0xfc | 1], [0xf8 | 2], [0xf8 | 2], zeros(4));
    expect(hevcCodec("hev1", hvcC)).toBe("hev1.A1.6.H120.90");
    const hevc = parseMoov(body(moov({ entry: entry("hev1", 64, 48, box("hvcC", hvcC)) })));
    expect(hevc.codec).toBe("hev1.A1.6.H120.90");
    expect(hevc.bitDepth).toBe(10);
    expect(hevc.description).toEqual(hvcC);
    // A full box: version and flags, then profile 2, level 4.1, 10 bits, 4:2:0 colocated, BT.2020, HLG, BT.2020 NCL, limited range.
    const vpcC = cat([1, 0, 0, 0], [2, 41, (10 << 4) | (1 << 1) | 0, 9, 18, 9], u16(0));
    expect(vp9Codec(vpcC)).toBe("vp09.02.41.10.01.09.18.09.00");
    const vp9 = parseMoov(body(moov({ entry: entry("vp09", 64, 48, box("vpcC", vpcC)) })));
    expect([vp9.codec, vp9.bitDepth, vp9.description]).toEqual(["vp09.02.41.10.01.09.18.09.00", 10, null]);
  });

  it("reads an H.264 High 10 stream's bit depth from its avcC extension", () => {
    // Profile 110, one SPS of 2 bytes, one PPS of 1 byte, then chroma 1 and luma 10 bits.
    const avcC = cat([1, 110, 0, 40, 0xff, 0xe1], u16(2), [0x67, 0], [1], u16(1), [0x68], [0xfc | 1, 0xf8 | 2, 0xf8 | 2, 0]);
    expect(avcCodec("avc1", avcC)).toBe("avc1.6E0028");
    expect(parseMoov(body(moov({ entry: entry("avc1", 64, 48, box("avcC", avcC)) }))).bitDepth).toBe(10);
    // A High profile record without the extension is 8 bits.
    const short = cat([1, 100, 0, 40, 0xff, 0xe1], u16(2), [0x67, 0], [1], u16(1), [0x68]);
    expect(parseMoov(body(moov({ entry: entry("avc3", 64, 48, box("avcC", short)) }))).bitDepth).toBe(8);
  });

  it("says why it cannot read a file", async () => {
    const reason = async (bytes: Uint8Array) => {
      try {
        await readVideoTrack(memory(bytes));
        return "read";
      } catch (e) {
        expect(e).toBeInstanceOf(Mp4Error);
        return (e as Error).message;
      }
    };
    expect(await reason(cat([0, 0, 0]))).toBe("not an mp4");
    expect(await reason(cat(box("ftyp", text("isom")), box("mdat", zeros(16))))).toBe("no moov");
    expect(await reason(cat(box("ftyp", text("isom")), box("moof", zeros(8)), box("mdat", zeros(8))))).toBe("fragmented mp4");
    expect(await reason(cat(u32(4), text("ftyp")))).toBe("bad ftyp box");
    const m = moov();
    expect(await reason(cat(box("ftyp", text("isom")), m.subarray(0, m.length - 10)))).toBe("moov cut short");
    // A 64-bit size for the mdat, and a moov that runs to the end of the file.
    const big = cat(u32(1), text("mdat"), u64(16 + 8), zeros(8));
    expect(await reason(cat(big, u32(0), m.subarray(4)))).toBe("read");
    expect(await reason(moov({ handler: "soun" }))).toBe("no video track");
    expect(await reason(moov({ entry: entry("mp4v", 64, 48) }))).toBe("codec mp4v not handled");
    expect(await reason(moov({ entry: entry("avc1", 64, 48) }))).toBe("avc1 without avcC");
    expect(await reason(moov({ entry: entry("hvc1", 64, 48) }))).toBe("hvc1 without hvcC");
    expect(await reason(moov({ entry: entry("vp09", 64, 48) }))).toBe("vp09 without vpcC");
    expect(() => parseMoov(cat(box("trak", zeros(4))))).toThrow("no mvhd");
    expect(() => parseMoov(cat(box("mvhd", zeros(100))))).toThrow("no time scale");
    expect(() => parseMoov(cat(u32(20), text("mvhd"), zeros(4)))).toThrow("bad mvhd box");
  });

  it("refuses a sample table that lists more samples than its chunks hold", () => {
    const m = moov();
    // stsz says 4 samples; make it 9.
    const at = m.findIndex((_, i) => String.fromCharCode(...m.subarray(i, i + 4)) === "stsz") + 4 + 8;
    m.set(u32(9), at);
    expect(() => parseMoov(body(m))).toThrow("cut short");
  });

  it("is not thrown by a 64-bit box size inside the moov", () => {
    const free = cat(u32(1), text("free"), u64(16));
    expect(parseMoov(body(moov({ extra: [free] }))).samples.length).toBe(4);
  });
});
