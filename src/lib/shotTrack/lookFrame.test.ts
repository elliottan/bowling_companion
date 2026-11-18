import { describe, expect, it } from "vitest";
import { drawnTurn, frameNote, glimpseIndices, lookGray, lumaBits, meanAbsDiff, type FrameShape } from "./lookFrame";
import { planeGray } from "./marking";

const frame = (over: Partial<FrameShape> = {}): FrameShape => ({
  format: "NV12",
  codedWidth: 1920,
  codedHeight: 1088,
  displayWidth: 1920,
  displayHeight: 1080,
  visibleRect: { x: 0, y: 0, width: 1920, height: 1080 },
  colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false },
  ...over
});

describe("lumaBits", () => {
  it("knows the formats with a luma plane, and their bits", () => {
    expect(lumaBits("NV12")).toBe(8);
    expect(lumaBits("I420")).toBe(8);
    expect(lumaBits("I420P10")).toBe(10);
    expect(lumaBits("P010")).toBe(10);
    expect(lumaBits("I444P12")).toBe(12);
  });
  it("has none for RGB or no format", () => {
    expect(lumaBits("RGBA")).toBeNull();
    expect(lumaBits("BGRX")).toBeNull();
    expect(lumaBits(null)).toBeNull();
    expect(lumaBits(undefined)).toBeNull();
  });
});

describe("lookGray", () => {
  // A plane 8 wide by 4 tall, padded to 10 bytes a row from byte 3: the left half dark, the right half light.
  const stride = 10;
  const plane = new Uint8Array(3 + stride * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) plane[3 + y * stride + x] = x < 4 ? 16 : 235;

  it("averages the plane down to the look's size, turns it as the track says and brings it to full range", () => {
    // Shown turned 90: 4 wide by 8 tall, the plane's left half at the top.
    const g = lookGray(plane, 8, 3, stride, 8, 4, 2, 4, 90, "limited");
    expect(g.length).toBe(8);
    expect(Array.from(g)).toEqual([0, 0, 0, 0, 255, 255, 255, 255]);
  });

  it("is the read's plane gray, expanded only when the plane is limited", () => {
    const raw = planeGray(plane, 8, 3, stride, 8, 4, 4, 2, 0);
    expect(Array.from(lookGray(plane, 8, 3, stride, 8, 4, 4, 2, 0, "full"))).toEqual(Array.from(raw));
    expect(Array.from(lookGray(plane, 8, 3, stride, 8, 4, 4, 2, 0, "limited"))).toEqual([0, 0, 255, 255, 0, 0, 255, 255]);
  });

  it("reads two bytes a sample past 8 bits", () => {
    const ten = new Uint8Array(2 * 4);
    const dv = new DataView(ten.buffer);
    [64, 940, 64, 940].forEach((v, i) => dv.setUint16(2 * i, v, true));
    expect(Array.from(lookGray(ten, 10, 0, 4, 2, 2, 2, 1, 0, "limited"))).toEqual([0, 255]);
  });

  it("turns a half and three quarters too", () => {
    expect(Array.from(lookGray(plane, 8, 3, stride, 8, 4, 2, 1, 180, "full"))).toEqual([235, 16]);
    expect(Array.from(lookGray(plane, 8, 3, stride, 8, 4, 1, 2, 270, "full"))).toEqual([235, 16]);
  });
});

describe("drawnTurn", () => {
  it("turns as the track says when the browser has not", () => {
    expect(drawnTurn(frame(), 90)).toEqual({ turn: 90, why: "turned 90 as the track says" });
    expect(drawnTurn(frame(), -90).turn).toBe(270);
    expect(drawnTurn(frame(), 0).turn).toBe(0);
  });

  it("does not turn again a frame whose display size is already across", () => {
    const turned = frame({ displayWidth: 1080, displayHeight: 1920 });
    expect(drawnTurn(turned, 90)).toEqual({ turn: 0, why: "display 1080x1920 already turned from 1920x1080" });
    expect(drawnTurn(turned, 270).turn).toBe(0);
    // A half turn cannot be told from the sizes.
    expect(drawnTurn(turned, 180).turn).toBe(180);
  });

  it("takes the coded size when there is no visible rectangle, and a square never counts as turned", () => {
    expect(drawnTurn(frame({ visibleRect: null, codedWidth: 1920, codedHeight: 1080, displayWidth: 1080, displayHeight: 1920 }), 90).turn).toBe(0);
    const square = { width: 1080, height: 1080, x: 0, y: 0 };
    expect(drawnTurn(frame({ visibleRect: square, displayWidth: 1080, displayHeight: 1080 }), 90).turn).toBe(90);
  });

  it("leaves to the browser the turn a frame carries, and makes only the rest", () => {
    expect(drawnTurn(frame({ rotation: 90 }), 90)).toEqual({ turn: 0, why: "frame rotation 90, 0 left of the track's 90" });
    expect(drawnTurn(frame({ rotation: 90 }), 180).turn).toBe(90);
    expect(drawnTurn(frame({ rotation: 0 }), 90).turn).toBe(90);
  });
});

describe("frameNote", () => {
  it("says the frame's sizes, format, colour and own turn", () => {
    expect(frameNote(frame({ rotation: 0, flip: false }))).toBe(
      "coded 1920x1088, display 1920x1080, visible 0,0 1920x1080, NV12, color bt709/bt709/bt709 limited, rotation 0, flip false"
    );
  });
  it("says what is not known", () => {
    expect(frameNote(frame({ format: null, visibleRect: null, colorSpace: null }))).toBe("coded 1920x1088, display 1920x1080, visible ?, no format, color ?");
    expect(frameNote(frame({ colorSpace: { primaries: null, fullRange: null } }))).toContain("color ?/?/? range ?");
    expect(frameNote(frame({ colorSpace: { fullRange: true } }))).toContain("full");
  });
});

describe("meanAbsDiff", () => {
  it("is the mean distance of two pictures, NaN for none", () => {
    expect(meanAbsDiff([0, 10, 20], [2, 10, 14])).toBeCloseTo(8 / 3);
    expect(meanAbsDiff([], [])).toBeNaN();
  });
});

describe("glimpseIndices", () => {
  it("picks the frames nearest a quarter, half and three quarters of the video, each once", () => {
    const times = Array.from({ length: 41 }, (_, i) => i * 0.1);
    expect(glimpseIndices(times, 4)).toEqual([10, 20, 30]);
    expect(glimpseIndices([0, 3.9], 4)).toEqual([0, 1]);
    expect(glimpseIndices([], 4)).toEqual([]);
    expect(glimpseIndices(times, 4, [0, 1])).toEqual([0, 40]);
  });
});
