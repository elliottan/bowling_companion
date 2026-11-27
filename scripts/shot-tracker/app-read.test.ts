import { describe, expect, it } from "vitest";
import { decodedTrack, HDR_TRANSFERS, transferOf } from "./app-read";
import type { VideoTrack } from "../../src/lib/shotTrack/mp4";

describe("transferOf", () => {
  it("reads ffprobe's transfer, with or without the side data's trailing comma", () => {
    expect(transferOf("arib-std-b67,\n")).toBe("arib-std-b67");
    expect(transferOf("bt709\n")).toBe("bt709");
    expect(transferOf("")).toBe("unknown");
    expect(HDR_TRANSFERS.has(transferOf("smpte2084,\n"))).toBe(true);
    expect(HDR_TRANSFERS.has(transferOf("bt709\n"))).toBe(false);
  });
});

describe("decodedTrack", () => {
  const track = { bitDepth: 10, fullRange: false } as VideoTrack;

  it("leaves the track as it is outside phone mode, without looking at the file", async () => {
    expect(await decodedTrack("/no/such/file.mp4", track, "full")).toBe(track);
    expect(await decodedTrack("/no/such/file.mp4", track, "decoded")).toBe(track);
  });
});
