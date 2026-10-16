// Cuts the feature reel from the takes capture.mjs recorded.
//
//   REEL_OUT=/tmp/reel ADS_TTS_PYTHON=... ADS_TTS_MODELS=... \
//     node scripts/ad-content/reel/compose.mjs
//
// (npm run dev must be up: the compositor page is served by it.)
//
// The edit is the BEATS list below: for each beat, which take and which part
// of it, what the voice says, the caption, and where the camera, spotlight,
// circle and finger go, named by the marks capture.mjs wrote. From that, every
// frame is worked out here as plain numbers and drawn by reel.html, one at a
// time, so a zoom or a flip is as smooth in the file as it is on paper.
//
// The voice is Kokoro (voice.py beside record.mjs); music.py writes the music
// bed and the sound effects to the same cue list, and ffmpeg mixes them.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.REEL_BASE ?? "http://localhost:5173";
const OUT = resolve(process.env.REEL_OUT ?? "reel-out");
const FPS = 30;
const PREVIEW = process.env.REEL_PREVIEW; // "t1,t2,..." renders only those stills

// --- Geometry ------------------------------------------------------------------

const APP_W = 390;
const APP_H = 844;
const S_FULL = 1.55; // phone scale when the whole screen is in view
const FULL_TOP = 600;
const FOCUS = { x: 540, y: 890 }; // where a zoomed subject sits: the middle of the safe area
const WIN = { l: 28, r: 1052, t: 560, b: 1896 }; // the app's window under the caption (reel.html)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k * k;
const easeOutBack = (k) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
const smooth = (k) => k * k * (3 - 2 * k);

// --- Takes ---------------------------------------------------------------------

const takes = {};
function take(name) {
  if (!takes[name]) {
    const t = JSON.parse(readFileSync(join(OUT, name, "take.json"), "utf8"));
    t.times = t.frames.map((f) => f.t);
    takes[name] = t;
  }
  return takes[name];
}
/** The frame on screen at time t of a take. */
function frameAt(name, t) {
  const tk = take(name);
  let lo = 0;
  let hi = tk.times.length - 1;
  if (t <= tk.times[0]) return `/takes/${name}/frames/${tk.frames[0].file}`;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tk.times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return `/takes/${name}/frames/${tk.frames[lo].file}`;
}
/** A mark by label ("tap-strike"), or the n-th of that label ("tap-strike#1"). */
function markOf(name, ref) {
  const [label, nth] = ref.split("#");
  const all = take(name).marks.filter((m) => m.label === label);
  const m = all[nth ? Number(nth) : 0];
  if (!m) throw new Error(`no mark ${ref} in take ${name}`);
  return m;
}
/** A time in a take: a number, or "label", "label+0.3", "label-0.2". */
function timeOf(name, ref) {
  if (typeof ref === "number") return ref;
  // Labels have dashes of their own ("tenth-0"), so a whole label wins first.
  const [label] = ref.split("#");
  if (take(name).marks.some((m) => m.label === label)) return markOf(name, ref).t;
  const m = /^(.*?)([+-]\d+(?:\.\d+)?)$/.exec(ref);
  if (!m) throw new Error(`bad time ${ref}`);
  return markOf(name, m[1]).t + Number(m[2]);
}
/** Boxes, in app pixels: a mark's boxes, or boxes given as they are. */
function boxesOf(name, ref) {
  if (!ref) return [];
  if (typeof ref === "string") return markOf(name, ref).boxes;
  return [ref].flat();
}
function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}
const FULL = { x: 0, y: 0, w: APP_W, h: APP_H };

// --- The edit --------------------------------------------------------------------
//
// Times in a beat are the take's own (marks or seconds). `cam` is a list of
// camera stops: from `at`, move over `ease` seconds to frame `box` at zoom `z`
// (1 is the whole phone). `spots` light boxes and dim the rest; `circles`
// draw a ring round a box. Taps in the beat's range get the finger and a
// ripple on their own. `trans` is how the beat comes in: cut, flip, whip, zoom,
// or none (the same take carrying on, so there is nothing to cut). `fan` deals
// several takes' frames out side by side instead of one phone.

const box = (name, ref, i = 0) => markOf(name, ref).boxes[i];
// The scorer pulled back a little: the whole card at the top down to the notes,
// so a beat that opens on it shows where on the screen it is before going in.
const WIDE = { x: 0, y: 56, w: 390, h: 340 };

const BEATS = [
  // Hook: the line drawn over a PBA pattern's oil, captioned from frame one,
  // then three screens flipped past fast, each one whole so the eye knows what
  // it is looking at.
  { id: "hook", take: "patterns", from: "tap-try+0.36", to: "tap-try+1.75", dur: 1.75, caption: "Still guessing <em>your line</em>?", vo: "hook", instant: true,
    cam: [{ at: "tap-try+0.36", box: { x: 30, y: 60, w: 330, h: 640 }, z: 1.12, ease: 0 }, { at: "tap-try+0.4", box: { x: 30, y: 60, w: 330, h: 640 }, z: 1.3, ease: 1.4 }] },
  { id: "flip-a", take: "game", from: "stats+0.5", to: "stats+0.7", dur: 0.3, caption: "Headpin <em>tracks it all</em>.", captionKey: "all", vo: "all", trans: "flip" },
  { id: "flip-b", take: "catalog", from: "list+0.2", to: "list+0.4", dur: 0.3, captionKey: "all", trans: "flip" },
  { id: "flip-c", take: "game", from: 0.1, to: "ball-1.05", dur: 0.6, captionKey: "all", trans: "flip" },

  // The game, frames 8 to 10. Each beat opens wide enough to see where on the
  // scorer it is, then goes in on the one thing it is about.
  { id: "ball", take: "game", from: "ball-1.05", to: "tap-pick+0.4", dur: 2.5, freeze: "tap-pick+0.03", caption: "Pick <em>your ball</em>.", vo: "ball", trans: "none",
    cam: [{ at: "ball-1.05", box: FULL, z: 1.025, ease: 0 },
          { at: "ball-0.35", box: "ball", z: 2.1, ease: 0.5 },
          { at: "picker-0.35", box: "pick", z: 1.4, ease: 0.4 }],
    // The picker closes the instant it is tapped: hold its last frame while
    // the tap's ripple plays, so the row is what the eye ends on.
    spots: [{ from: "ball+0.1", to: "tap-ball+0.15", boxes: "ball" },
            { from: "pick", to: "tap-pick+0.4", boxes: "pick" }] },
  { id: "line", take: "game", from: "tap-pick+0.45", to: "line-set+0.1", dur: 1.5, caption: "Set <em>your line</em>.", vo: "line", trans: "cut",
    cam: [{ at: "tap-pick+0.45", box: FULL, z: 1, ease: 0 }, { at: "tap-stance", box: "intended", z: 2.3, ease: 0.45 }] },
  { id: "lane", take: "game", from: "lane-open+0.3", to: "lane-held", caption: "See it <em>on the lane</em>.", vo: "lane", trans: "flip",
    cam: [{ at: "lane-open+0.3", box: { x: 20, y: 60, w: 350, h: 640 }, z: 1.12, ease: 0 }, { at: "lane-open+0.4", box: { x: 20, y: 60, w: 350, h: 640 }, z: 1.28, ease: 1.2 }] },
  { id: "strike", take: "game", from: "strike-wide", to: "frame8+0.45", dur: 2.0, caption: "Tap. <em>It's scored.</em>", vo: "strike", trans: "zoom",
    cam: [{ at: "strike-wide", box: WIDE, z: 1.3, ease: 0 },
          { at: "strike-0.2", box: box("game", "strike", 0), z: 2.2, ease: 0.45 },
          { at: "tap-strike+0.12", box: box("game", "frame8"), z: 2.6, ease: 0.3 }],
    spots: [{ from: "strike+0.1", to: "tap-strike+0.1", boxes: [box("game", "strike", 0)] },
            { from: "tap-strike+0.35", to: "frame8+0.45", boxes: "frame8" }] },
  { id: "carry", take: "game", from: "carry", to: "carry+1.45", caption: "Your line carries over|<em>to the next shot</em>.", vo: "carry", trans: "cut",
    cam: [{ at: "carry", box: WIDE, z: 1.3, ease: 0 }, { at: "carry+0.3", box: "carry", z: 2.15, ease: 0.45 }],
    spots: [{ from: "carry+0.75", to: "carry+1.45", boxes: "carry" }] },
  { id: "move", take: "game", from: "tap-stance2-0.3", to: "moved+0.35", caption: "Went high?|<em>2-1, one tap.</em>", vo: "move", trans: "cut",
    cam: [{ at: "tap-stance2-0.3", box: WIDE, z: 1.3, ease: 0 }, { at: "tap-stance2-0.1", box: "moves", z: 1.9, ease: 0.35 }],
    circles: [{ at: "moves", box: [box("game", "moves", 0)], dur: 0.5 }],
    spots: [{ from: "moved", to: "moved+0.35", boxes: "moved" }] },
  { id: "spare", take: "game", from: "ten-0.55", to: "frame9+0.35", caption: "Left the 10?|<em>Spare line's set.</em>", vo: "spare", trans: "cut",
    cam: [{ at: "ten-0.55", box: WIDE, z: 1.3, ease: 0 },
          { at: "ten-0.4", box: "deck", z: 1.85, ease: 0.35 },
          { at: "tap-next+0.1", box: "spare-set", z: 2.0, ease: 0.3 },
          { at: "tap-spare+0.05", box: "frame9", z: 2.6, ease: 0.3 }],
    circles: [{ at: "ten-0.05", box: "ten", dur: 0.4 }],
    spots: [{ from: "tap-next+0.4", to: "spare-0.15", boxes: "spare-set" },
            { from: "tap-spare+0.35", to: "frame9+0.35", boxes: "frame9" }] },
  { id: "tenth", take: "game", from: "tenth-0-0.15", to: "frame10+0.5", caption: "Strike out <em>the tenth</em>.", vo: "tenth", trans: "cut",
    cam: [{ at: "tenth-0-0.15", box: WIDE, z: 1.3, ease: 0 },
          { at: "tenth-0", box: box("game", "tenth-0", 1), z: 2.3, ease: 0.35 },
          { at: "frame10", box: "frame10", z: 2.7, ease: 0.3 }],
    spots: [{ from: "frame10", to: "frame10+0.5", boxes: "frame10" }] },
  { id: "stats", take: "game", from: "stats", to: "balls+0.5", caption: "Your average.|<em>Which ball carries.</em>", vo: "stats", trans: "whip",
    cam: [{ at: "stats", box: FULL, z: 1, ease: 0 },
          { at: "stats+0.3", box: { x: 0, y: 40, w: 390, h: 340 }, z: 1.5, ease: 0.4 },
          { at: "balls-0.2", box: "balls", z: 1.45, ease: 0.45 }],
    circles: [{ at: "balls+0.1", box: (() => { const b = box("game", "balls"); return { x: b.x + 4, y: b.y + 66, w: b.w - 8, h: 62 }; })(), dur: 0.5 }] },

  // The rest of the app, flicked past one screen to a word, then all of it.
  { id: "sessions", pad: 0.02, take: "history", from: "list", to: "list+0.9", caption: "Unlimited <em>sessions</em>.", vo: "sessions", trans: "flip" },
  { id: "oil", pad: 0.02, take: "patterns", from: "graph-0.2", to: "graph+0.6", caption: "Oil <em>patterns</em>.", vo: "oil", trans: "whip" },
  { id: "balls", pad: 0.02, take: "catalog", from: "tap-ball+0.1", to: "ball-0.1", caption: "Bowling <em>balls</em>.", vo: "balls", trans: "flip" },
  { id: "layouts", pad: 0.02, take: "layouts", from: "drag-0.15", to: "dragged+0.3", caption: "Layout <em>visualizer</em>.", vo: "layouts", trans: "whip" },
  { id: "fan", caption: "All on <em>Headpin</em>.", vo: "fan", trans: "zoom", min: 1.25, pad: 0.05,
    fan: [{ take: "history", at: "list+0.9" }, { take: "patterns", at: "graph+0.6" }, { take: "catalog", at: "ball+0.6" }, { take: "layouts", at: "dragged+0.3" }] },

  { id: "end", end: true, vo: "end", trans: "zoom", min: 2.75 }
];

/** What the voice says, keyed by beat. Written to be heard: "Head pin" is two
 *  words so the p is not swallowed. */
const VOICE = {
  hook: "Still guessing your line?",
  all: "Head pin tracks it all.",
  ball: "Pick your ball.",
  line: "Set your line.",
  lane: "See it on the lane.",
  strike: "Tap. It's scored.",
  carry: "Your line carries over to the next shot.",
  move: "Went high? Two and one, one tap.",
  spare: "Left the ten? Your spare line's already set.",
  tenth: "Strike out the tenth.",
  stats: "Your average, and which ball carries.",
  // The montage is read quicker, one word-pair to a flick.
  sessions: ["Unlimited sessions.", 1.25],
  oil: ["Oil patterns.", 1.25],
  balls: ["Bowling balls.", 1.25],
  layouts: ["Layout visualizer.", 1.25],
  fan: ["All on Head pin.", 1.2],
  end: "It's free, at head pin dot app."
};

// --- Voice -----------------------------------------------------------------------

function speak() {
  const python = process.env.ADS_TTS_PYTHON;
  if (!python || !process.env.ADS_TTS_MODELS) throw new Error("ADS_TTS_PYTHON and ADS_TTS_MODELS must be set (see ../voice.py).");
  const dir = join(OUT, "voice");
  execFileSync("mkdir", ["-p", dir]);
  const base = Number(process.env.ADS_TTS_SPEED ?? "1.08");
  const jobs = Object.entries(VOICE).map(([key, line]) => {
    const [text, speed = base] = [line].flat();
    const style = `${process.env.ADS_TTS_VOICE ?? "af_heart"}@${speed}`;
    const hash = createHash("sha1").update(`${style}\n${text}`).digest("hex").slice(0, 12);
    return { key, text, speed, out: join(dir, `${key}-${hash}.wav`) };
  });
  const stdout = execFileSync(python, [join(HERE, "..", "voice.py")], {
    input: JSON.stringify(jobs.map(({ text, speed, out }) => ({ text, speed, out }))),
    encoding: "utf8",
    env: { ...process.env, ADS_TTS_SPEED: process.env.ADS_TTS_SPEED ?? "1.08" }
  });
  const seconds = Object.fromEntries(stdout.trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.out, r.seconds]));
  return Object.fromEntries(jobs.map((j) => [j.key, { file: j.out, seconds: seconds[j.out] }]));
}

// --- Timeline ------------------------------------------------------------------------

/** Beat lengths: at least the beat's line, and a whole number of eighth notes
 *  of the 120 BPM bed (0.25 s), so every cut lands on the music. */
const GRID = 0.25;
function timeline(voice) {
  const out = BEATS.map((b0) => {
    const b = { ...b0 };
    const line = b.vo && !b.captionKey ? voice[b.vo].seconds + (b.pad ?? 0.15) : 0;
    let natural;
    if (b.end) natural = Math.max(b.min ?? 3, voice[b.vo].seconds + 0.7);
    else if (b.fan) natural = Math.max(b.min ?? 1, line);
    else {
      const span = timeOf(b.take, b.to) - timeOf(b.take, b.from);
      natural = Math.max(b.dur ?? Math.max(span / 1.6, 0.9), line);
    }
    b.dur = Math.ceil(natural / GRID - 1e-6) * GRID;
    return b;
  });
  // A run of beats under one caption carries its line across all of them:
  // the last one grows until the line fits.
  for (let i = 0; i < out.length; i++) {
    const key = out[i].captionKey;
    if (!key || (i > 0 && out[i - 1].captionKey === key)) continue;
    let j = i;
    while (out[j + 1]?.captionKey === key) j++;
    const run = out.slice(i, j + 1).reduce((a, b) => a + b.dur, 0);
    const need = voice[out[i].vo].seconds + 0.15;
    if (run < need) out[j].dur += Math.ceil((need - run) / GRID - 1e-6) * GRID;
  }
  let t = 0;
  for (const b of out) {
    b.start = t;
    if (b.take) {
      b.src0 = timeOf(b.take, b.from);
      b.src1 = timeOf(b.take, b.to);
      b.speed = clamp((b.src1 - b.src0) / b.dur, 0.25, 3);
    }
    t += b.dur;
  }
  return out;
}

// --- Per-frame state ------------------------------------------------------------------

/** Camera at local time u of a beat: { s, x, y } for the phone's top left. */
function cameraAt(beat, u) {
  const stops = (beat.cam ?? [{ at: beat.src0, box: FULL, z: 1 }]).map((c) => ({
    t: (timeOf(beat.take, c.at) - beat.src0) / beat.speed,
    box: union(boxesOf(beat.take, c.box)),
    z: c.z,
    ease: c.ease ?? 0.4
  }));
  const pose = (st) => ({ cx: st.box.x + st.box.w / 2, cy: st.box.y + st.box.h / 2, z: st.z });
  let p = pose(stops[0]);
  for (const st of stops.slice(1)) {
    if (u <= st.t) break;
    const k = st.ease > 0 ? easeInOut(clamp((u - st.t) / st.ease)) : 1;
    const q = pose(st);
    p = { cx: lerp(p.cx, q.cx, k), cy: lerp(p.cy, q.cy, k), z: lerp(p.z, q.z, k) };
  }
  // A slow push the whole beat long, so no shot is ever quite still.
  const z = p.z * (1 + 0.025 * (u / beat.dur));
  const s = S_FULL * z;
  const k = smooth(clamp((z - 1.04) / 0.3));
  const fullX = 540 - (APP_W * s) / 2;
  const fullY = FULL_TOP - (z - 1) * 260;
  let x = lerp(fullX, FOCUS.x - s * p.cx, k);
  let y = lerp(fullY, FOCUS.y - s * p.cy, k);
  // Zoomed in, the phone always fills the window: no edge of it drifts in.
  const W = APP_W * s;
  const H = APP_H * s;
  if (W >= WIN.r - WIN.l) x = clamp(x, WIN.r - W, WIN.l);
  if (H >= WIN.b - WIN.t && k > 0.5) y = clamp(y, WIN.b - H, WIN.t);
  return { s, x, y };
}
const toCanvas = (cam, b, pad = 0) => ({
  x: cam.x + cam.s * b.x - pad,
  y: cam.y + cam.s * b.y - pad,
  w: cam.s * b.w + pad * 2,
  h: cam.s * b.h + pad * 2
});

/** A hand-drawn ring round a box: a little more than one turn, a little uneven. */
function ringPath(b, seed) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2 + 34;
  const ry = b.h / 2 + 30;
  const pts = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI * 0.62 + (i / n) * Math.PI * 2.18;
    const wob = 1 + 0.035 * Math.sin(a * 3 + seed) + 0.02 * (i / n);
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
  }
  return "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join(" L");
}

/** Caption words: "Pick <em>your ball</em>." becomes words, some lit; "|"
 *  forces a line break, so no word is left alone on a line. */
function words(html) {
  const out = [];
  let em = false;
  for (const part of html.split(/(<\/?em>|\|)/)) {
    if (part === "<em>") em = true;
    else if (part === "</em>") em = false;
    else if (part === "|") out.push({ br: true });
    else for (const w of part.split(/(?<= )/)) if (w.trim()) out.push({ text: w.replace(/ $/, " "), em });
  }
  return out;
}

function captionAt(beats, i, u) {
  const b = beats[i];
  if (!b.caption && !b.captionKey) return null;
  const key = b.captionKey ?? b.id;
  const first = beats.findIndex((x) => (x.captionKey ?? x.id) === key);
  const html = beats[first].caption;
  let lastIdx = i;
  while (beats[lastIdx + 1] && (beats[lastIdx + 1].captionKey ?? beats[lastIdx + 1].id) === key) lastIdx++;
  const since = b.start + u - beats[first].start;
  const until = beats[lastIdx].start + beats[lastIdx].dur - (b.start + u);
  let j = 0;
  const ws = words(html).map((w) => {
    if (w.br) return w;
    // Words pop in 50 ms apart and hold to the cut. The opening caption is
    // there from the first frame.
    const k = beats[first].instant ? 1 : clamp((since - j++ * 0.05) / 0.2);
    const out = clamp((0.06 - until) / 0.06);
    return {
      text: w.text,
      em: w.em,
      opacity: Math.min(1, easeOut(k) * 1.4) * (1 - out),
      dy: (1 - easeOutBack(k)) * 34,
      scale: 0.88 + 0.12 * easeOutBack(k),
      blur: (1 - k) * 4
    };
  });
  return { key, words: ws };
}

const RIPPLE = 0.45;
const LEAD = 0.3;

function beatFrame(beats, i, u) {
  const b = beats[i];
  const f = { phones: [], ripples: [], circles: [] };
  if (b.end) return f;
  if (b.fan) {
    // The four screens dealt out in a fan, one after another.
    const s = 0.8;
    b.fan.forEach((it, j) => {
      const k = clamp((u - j * 0.07) / 0.35);
      const w = APP_W * s;
      const h = APP_H * s;
      const cx = 540 + [-292, -98, 98, 292][j];
      const cy = 1070 + [26, 0, 0, 26][j] - 14 * (u / b.dur);
      f.phones.push({ key: `fan${j}`, src: frameAt(it.take, timeOf(it.take, it.at)), x: cx - w / 2, y: cy - h / 2 + (1 - easeOut(k)) * 120, w, h,
        radius: 40 * (s / S_FULL) * 1.6, bezel: 10, opacity: easeOut(k), z: [1, 2, 3, 2][j],
        rotZ: [-9, -3, 3, 9][j] * easeOutBack(k), scale: 0.8 + 0.2 * easeOutBack(k) + 0.03 * (u / b.dur) });
    });
    return f;
  }
  let src = Math.min(b.src0 + u * b.speed, b.src1);
  if (b.freeze) src = Math.min(src, timeOf(b.take, b.freeze));
  const cam = cameraAt(b, u);
  const radius = 40 * (cam.s / S_FULL);
  f.phones.push({ key: "a", src: frameAt(b.take, src), x: cam.x, y: cam.y, w: APP_W * cam.s, h: APP_H * cam.s, radius, bezel: 16 * (cam.s / S_FULL), opacity: 1 });
  const local = (ref) => (timeOf(b.take, ref) - b.src0) / b.speed;

  // Spotlight: the lit boxes of whichever spot is on, faded in and out.
  for (const sp of b.spots ?? []) {
    const a = local(sp.from);
    const z = local(sp.to);
    if (u < a || u > z) continue;
    const k = Math.min(easeOut(clamp((u - a) / 0.18)), clamp((z - u) / 0.14));
    const pad = 10 + (1 - easeOut(clamp((u - a) / 0.25))) * 26;
    f.spot = {
      alpha: 0.64 * k,
      rim: k,
      holes: boxesOf(b.take, sp.boxes).map((bx) => ({ ...toCanvas(cam, bx, pad), r: 22 }))
    };
  }
  // Circles.
  b.circles?.forEach((c, j) => {
    const a = local(c.at);
    const z = a + (c.dur ?? 0.6) + 0.5;
    if (u < a || u > z) return;
    const box = toCanvas(cam, union(boxesOf(b.take, c.box)));
    f.circles.push({ d: ringPath(box, j + i), progress: easeOut(clamp((u - a) / 0.38)), opacity: clamp((z - u) / 0.2) });
  });
  // Finger and ripples for the taps in range.
  const taps = take(b.take).marks.filter((m) => m.tap && m.t >= b.src0 - 0.02 && m.t <= b.src1);
  if (taps.length) {
    const ts = taps.map((m) => ({ u: (m.t - b.src0) / b.speed, x: m.tap.x, y: m.tap.y }));
    const first = ts[0];
    const last = ts[ts.length - 1];
    if (u >= first.u - LEAD - 0.15 && u <= last.u + 0.35) {
      // Where the finger is: travelling to the next tap, resting after one.
      let pos = { x: first.x, y: first.y + 160 };
      let press = 0;
      for (let j = 0; j < ts.length; j++) {
        const tp = ts[j];
        const prev = j ? { x: ts[j - 1].x, y: ts[j - 1].y } : { x: first.x, y: first.y + 160 };
        if (u < tp.u - LEAD) { pos = prev; break; }
        if (u < tp.u) { const k = easeInOut((u - (tp.u - LEAD)) / LEAD); pos = { x: lerp(prev.x, tp.x, k), y: lerp(prev.y, tp.y, k) }; break; }
        pos = { x: tp.x, y: tp.y };
        if (u < tp.u + 0.18) press = Math.sin(((u - tp.u) / 0.18) * Math.PI);
      }
      const c = toCanvas(cam, { x: pos.x, y: pos.y, w: 0, h: 0 });
      const vis = Math.min(clamp((u - (first.u - LEAD - 0.15)) / 0.15), clamp((last.u + 0.35 - u) / 0.15));
      f.finger = { x: c.x + 18, y: c.y + 22, opacity: 0.95 * vis, scale: 1 - 0.22 * press };
    }
    for (const tp of ts) {
      if (u < tp.u || u > tp.u + RIPPLE) continue;
      const k = (u - tp.u) / RIPPLE;
      const c = toCanvas(cam, { x: tp.x, y: tp.y, w: 0, h: 0 });
      f.ripples.push({ x: c.x, y: c.y, size: 40 + 130 * easeOut(k), opacity: 1 - k });
    }
  }
  return f;
}

/** The whole frame at time t: the beat, its transition in, the next one's out. */
function frameAtTime(beats, t) {
  let i = beats.findIndex((b) => t < b.start + b.dur);
  if (i < 0) i = beats.length - 1;
  const b = beats[i];
  const u = t - b.start;
  const T = 0.16; // half a transition
  let f = beatFrame(beats, i, u);
  const cap = captionAt(beats, i, u);
  f.caption = cap;
  f.kicker = b.kicker ? { text: b.kicker, opacity: Math.min(clamp(u / 0.15), clamp((b.dur - u) / 0.1)) } : null;

  // Out: the last T of a beat hands over to the next one's way in.
  const nb = beats[i + 1];
  if (nb && b.dur - u < T && nb.trans !== "cut" && nb.trans !== "none") {
    const k = 1 - (b.dur - u) / T;
    for (const p of f.phones) applyOut(p, nb.trans, k);
    f.spot = null; f.circles = []; f.finger = null; f.ripples = [];
  }
  // In.
  if (u < T && b.trans !== "cut" && b.trans !== "none" && i > 0) {
    const k = u / T;
    for (const p of f.phones) applyIn(p, b.trans, k);
    if (b.trans === "flip" || b.trans === "whip") f.flash = 0.12 * (1 - k);
  }
  if (b.trans === "cut" && u < 0.1 && i > 0) for (const p of f.phones) p.scale = 1.035 - 0.035 * (u / 0.1);

  // End card.
  if (b.end) {
    const items = [0, 1, 2, 3, 4, 5].map((j) => {
      const k = j === 0 ? clamp(u / 0.22) : clamp((u - 0.05 - j * 0.07) / 0.3);
      return { opacity: j === 0 ? 1 : easeOut(k), dy: (1 - easeOutBack(k)) * 50, scale: j === 0 ? 0.75 + 0.25 * easeOutBack(k) : 1 };
    });
    // The address kicks on every beat of the music.
    const beat = (t % 0.5) / 0.5;
    if (u > 0.5) items[3].scale = 1 + 0.06 * Math.exp(-beat * 6);
    f.end = { items };
    f.caption = null;
    f.kicker = null;
  }
  f.bg = { g1: [-200 + 120 * Math.sin(t * 0.35), -250 + 90 * Math.cos(t * 0.3)], g2: [500 + 80 * Math.cos(t * 0.27), 1250 + 100 * Math.sin(t * 0.33)] };
  return f;
}
function applyOut(p, kind, k) {
  if (kind === "flip") { p.rotY = -90 * easeIn(k); p.scale = 1 - 0.06 * k; }
  else if (kind === "whip") { p.x -= 1300 * easeIn(k); p.blur = 18 * k; }
  else if (kind === "zoom") { p.scale = 1 + 0.4 * easeIn(k); p.blur = 10 * k; }
}
function applyIn(p, kind, k) {
  if (kind === "flip") { p.rotY = 90 * (1 - easeOut(k)); p.scale = 0.94 + 0.06 * k; }
  else if (kind === "whip") { p.x += 1300 * (1 - easeOut(k)); p.blur = 18 * (1 - k); }
  else if (kind === "zoom") { p.scale = 0.84 + 0.16 * easeOut(k); p.blur = 8 * (1 - k); }
}

// --- Sound cues ---------------------------------------------------------------------

function cues(beats, voice) {
  const out = [];
  for (const [i, b] of beats.entries()) {
    if (i > 0 && b.trans !== "cut" && b.trans !== "none") out.push({ t: b.start - 0.12, kind: b.trans === "zoom" ? "swoosh" : "whoosh" });
    if (b.vo && voice[b.vo]) out.push({ t: b.start + 0.06, kind: "vo", file: voice[b.vo].file });
    if (b.end) out.push({ t: b.start, kind: "impact" }, { t: b.start - 1.6, kind: "riser" });
    if (!b.take) continue;
    for (const m of take(b.take).marks.filter((m) => m.tap && m.t >= b.src0 && m.t <= b.src1)) out.push({ t: b.start + (m.t - b.src0) / b.speed, kind: "tick" });
    for (const sp of b.spots ?? []) out.push({ t: b.start + (timeOf(b.take, sp.from) - b.src0) / b.speed, kind: "pop" });
    for (const c of b.circles ?? []) out.push({ t: b.start + (timeOf(b.take, c.at) - b.src0) / b.speed, kind: "scribble" });
  }
  return out.filter((c) => c.t >= 0);
}

// --- Render --------------------------------------------------------------------------

const voice = speak();
const beats = timeline(voice);
const total = beats.reduce((a, b) => a + b.dur, 0);
console.log(beats.map((b) => `${b.id} ${b.start.toFixed(2)}+${b.dur.toFixed(2)}${b.speed ? ` x${b.speed.toFixed(2)}` : ""}`).join("\n"));
console.log("total", total.toFixed(2), "s");
await mkdir(join(OUT, "render"), { recursive: true });

const browser = await chromium.launch(process.env.SHOTS_CHROMIUM ? { executablePath: process.env.SHOTS_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.route("**/takes/**", async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/takes\//, ""));
  const file = join(OUT, rel);
  if (!existsSync(file)) return route.fulfill({ status: 404 });
  await route.fulfill({ contentType: "image/jpeg", body: readFileSync(file) });
});
await page.goto(`${BASE}/scripts/ad-content/reel/reel.html`);
await page.evaluate(() => window.ready);

if (PREVIEW) {
  for (const t of PREVIEW.split(",").map(Number)) {
    await page.evaluate((f) => window.draw(f), frameAtTime(beats, t));
    await page.screenshot({ path: join(OUT, "render", `preview-${t.toFixed(2)}.jpg`), type: "jpeg", quality: 85 });
  }
  await browser.close();
  process.exit(0);
}

const video = join(OUT, "render", "video.mp4");
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), video], { stdio: ["pipe", "inherit", "inherit"] });
const frames = Math.round(total * FPS);
for (let n = 0; n < frames; n++) {
  await page.evaluate((f) => window.draw(f), frameAtTime(beats, n / FPS));
  const jpg = await page.screenshot({ type: "jpeg", quality: 94 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  if (n % 90 === 0) console.log(`frame ${n}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();

// Sound: music bed and effects from music.py, then the voice on top.
const cueFile = join(OUT, "render", "cues.json");
await writeFile(cueFile, JSON.stringify({ duration: total, cues: cues(beats, voice) }, null, 1));
execFileSync(process.env.ADS_TTS_PYTHON, [join(HERE, "music.py"), cueFile, join(OUT, "render")], { stdio: "inherit" });
const mp4 = join(OUT, "headpin-reel.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-i", join(OUT, "render", "mix.wav"),
  "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]);
console.log("wrote", mp4);
