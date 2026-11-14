import { appendFileSync } from "node:fs";
import { it } from "vitest";
import { behindCamera, renderFrame, truthAt, type SyntheticShot } from "./synthetic";
import * as LF from "./laneFind";
import { invert, apply, horizon } from "./homography";
const L = (...a: unknown[]) => appendFileSync("/tmp/claude-0/probe.txt", a.map((x) => JSON.stringify(x)).join(" ") + "\n");
it("probe", () => {
  const spec: SyntheticShot = {
    camera: behindCamera({ width: 960, height: 720, fill: 0.12, back: 25, side: 0.5, heightFt: 5, roll: -0.03 }),
    fps: 30, duration: 0.5, hand: "right", path: { u0: 24, a: 0.2, s: 36, L: 16, k: -0.025 },
    releaseT: 10, releaseV: -0.3, speedMph: 17, decel: -1.2, touchdownV: 1.2, loft: 0.15, noise: 2, seed: 3, pinMirror: true
  };
  const frames = [0, 5, 10].map((i) => renderFrame(spec, i));
  const T = truthAt(spec, 0).H; const hz = horizon(T);
  L("truth slope", -hz[0] / hz[1]);
  const small = LF.prepare(frames[0]);
  const all = LF.houghLines(small, { fromY: small.height * 0.25, max: 60 });
  L("roll", LF.estimateRoll(all), all.length);
  const per = frames.map((f) => LF.lanesOnFrame(f));
  const r = per[0]!;
  L("rows", r.far, r.near, "cands", r.candidates.map((c) => [c.left, c.right, c.leftEdge, c.rightEdge]));
  L("width", LF.laneWidth(per as LF.FrameLanes[]));
  const rk = LF.rankLanes(per, 960);
  L("rank", rk.map((k) => [k.index, k.width, k.candidate.left, k.candidate.right]));
  const rv = LF.refineVanishingPoint(frames[0], r);
  L("refined", rv);
  const pb = LF.pinBases(frames[0], r.far, 60);
  L("bases", pb.length);
  const wFar = 0; 
  const pr = LF.pinRows(frames[0], r.far, 15 * 8 / 41.5 * 5);
  L("pinrows", pr.length, pr.map((p) => [p.bases.length, p.support, p.line]));
  const H = truthAt(spec, 0).H; const Hi = invert(H);
  L("truth pin row line px", apply(H, {x: 0.5, y: 62.6}), apply(H, {x: 39.5, y: 62.6}), apply(H,{x:0.5,y:0}), apply(H,{x:39.5,y:0}));
  const pk = rk[0];
  const fl = LF.findFoulLines(frames[0], pk.left, pk.right, r.near, r.near - r.far, 0);
  L("foul", fl.length, fl.slice(0,3).map(f=>[f.strength,f.points.length]));
  const { attempts, camera } = LF.laneAttempts(frames);
  L("attempts", attempts.length, camera, attempts.map(a=>a.quality));
  L("hand foul", LF.findFoulLines(frames[0], pk.left, pk.right, 5, 10, 0));
  L(Hi);
});
