"""The reel's sound: a music bed, the sound effects and the voice, mixed.

compose.mjs runs this with a cue list (cues.json: the length, and a list of
{t, kind, file?}) and a folder to write into. Everything but the voice is
made here from sine waves and noise, so there is nothing to license: a short
120 BPM bed (kick, offbeat hats, bass, a chord pad that ducks under the kick),
whooshes on the flips, a tick on each tap, a pop when a spotlight comes on, a
riser into the end card and a hit when it lands. The music ducks under the
voice, and the mix is brought to -15 LUFS.

Needs numpy, scipy and soundfile (the same Python as voice.py, plus scipy).
"""

import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SR = 48000
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(7)

cue_file, out_dir = sys.argv[1], sys.argv[2]
spec = json.load(open(cue_file))
DUR = spec["duration"] + 0.6
N = int(DUR * SR)
t_all = np.arange(N) / SR


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def add(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (t * freq * (1 + detune)) % 1.0
    return 2 * ph - 1


# --- Where the music changes ---------------------------------------------------
cues = spec["cues"]
end_at = next((c["t"] for c in cues if c["kind"] == "impact"), DUR - 3)
drop_out = end_at - 0.5  # drums stop for the riser's last half second

# --- Music ------------------------------------------------------------------------
music = np.zeros((N, 2))
drums = np.zeros(N)
bass = np.zeros(N)
pad = np.zeros((N, 2))
arp = np.zeros(N)

# A minor, F, C, G: one chord a bar (2 s).
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [45, 41, 36, 43]
bar = 4 * BEAT
n_bars = int(np.ceil(DUR / bar)) + 1

kick_len = int(0.45 * SR)
kt = np.arange(kick_len) / SR
kick = np.sin(2 * np.pi * np.cumsum(45 + 80 * np.exp(-kt / 0.035)) / SR) * np.exp(-kt / 0.28)
kick += 0.4 * rng.standard_normal(kick_len) * np.exp(-kt / 0.004)
kick = lp(kick, 3000)

hat_len = int(0.07 * SR)
hat = hp(rng.standard_normal(hat_len), 7000) * np.exp(-np.arange(hat_len) / SR / 0.018)

beats = np.arange(0, DUR, BEAT)
for b in beats:
    if drop_out <= b < end_at:
        continue
    if b >= end_at:
        break
    add(drums, kick * 0.9, b)
    add(drums, hat * 0.32, b + BEAT / 2)
    add(drums, hat * 0.12, b + BEAT / 4)
    add(drums, hat * 0.12, b + 3 * BEAT / 4)

# Sidechain: everything melodic dips under each kick.
duck = np.ones(N)
for b in beats:
    if b >= drop_out:
        break
    i = int(b * SR)
    n = min(N - i, int(0.4 * SR))
    duck[i : i + n] = np.minimum(duck[i : i + n], 1 - 0.6 * np.exp(-np.arange(n) / SR / 0.11))

for k in range(n_bars):
    start = k * bar
    if start >= DUR:
        break
    chord = CHORDS[k % 4]
    root = ROOTS[k % 4]
    length = bar + 0.4 if start < end_at else DUR - start
    if start >= end_at:
        chord, root, length = [48, 55, 60, 64], 36, DUR - start
    n = int(length * SR)
    e = np.minimum(np.arange(n) / SR / 0.25, 1) * np.minimum((n - np.arange(n)) / SR / 0.35, 1)
    for m in chord + [chord[0] + 12]:
        for side, det in ((0, -0.004), (1, 0.004)):
            v = saw(note(m), n, det) * e * 0.06
            add(pad[:, side], v, start)
    # Bass on the eighths, a short pluck.
    if start < drop_out:
        for q in range(8):
            at = start + q * BEAT / 2
            if at >= drop_out:
                break
            nn = int(0.22 * SR)
            add(bass, saw(note(root), nn) * env(nn, 0.004, 0.09) * 0.5, at)
        # A light arpeggio on the sixteenths.
        for q in range(16):
            at = start + q * BEAT / 4
            if at >= drop_out:
                break
            m = (chord + [chord[0] + 12])[q % 4] + 12
            nn = int(0.16 * SR)
            tt = np.arange(nn) / SR
            add(arp, np.sin(2 * np.pi * note(m) * tt) * env(nn, 0.002, 0.05) * 0.10, at)

pad[:, 0] = lp(pad[:, 0], 2200)
pad[:, 1] = lp(pad[:, 1], 2200)
bass = lp(bass, 380, 4)
# The first two bars open up, so the hook starts softer and grows.
open_up = np.clip(t_all / (2 * bar), 0.35, 1)
for side in (0, 1):
    music[:, side] = (pad[:, side] + bass + arp * (0.7 if side else 1.0)) * duck * open_up + drums

# --- Effects ---------------------------------------------------------------------
sfx = np.zeros((N, 2))


def whoosh(length, lo, hi, gain):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    steps = 24
    for s in range(steps):
        a, b = s * n // steps, (s + 1) * n // steps
        f = lo * (hi / lo) ** (s / steps)
        out[a:b] = bp(noise, f * 0.7, min(f * 1.4, SR / 2 - 100))[a:b]
    shape = np.sin(np.pi * np.arange(n) / n) ** 2
    return out * shape * gain


for c in cues:
    k, at = c["kind"], c["t"]
    if k == "whoosh":
        w = whoosh(0.32, 400, 5000, 0.5)
        pan = np.linspace(0.2, 0.8, len(w))
        add(sfx[:, 0], w * (1 - pan), at)
        add(sfx[:, 1], w * pan, at)
    elif k == "swoosh":
        w = whoosh(0.4, 300, 2500, 0.4)
        add(sfx[:, 0], w, at)
        add(sfx[:, 1], w, at)
    elif k == "tick":
        n = int(0.04 * SR)
        tt = np.arange(n) / SR
        s = np.sin(2 * np.pi * 2600 * tt) * np.exp(-tt / 0.006) * 0.35
        add(sfx[:, 0], s, at)
        add(sfx[:, 1], s, at)
    elif k == "pop":
        n = int(0.12 * SR)
        tt = np.arange(n) / SR
        f = 520 + 500 * np.exp(-tt / 0.02)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, 0.04) * 0.28
        add(sfx[:, 0], s, at)
        add(sfx[:, 1], s, at)
    elif k == "scribble":
        n = int(0.32 * SR)
        s = bp(rng.standard_normal(n), 2500, 6000) * np.sin(np.pi * np.arange(n) / n) * 0.08
        s *= 0.6 + 0.4 * np.sin(2 * np.pi * 22 * np.arange(n) / SR)
        add(sfx[:, 0], s, at)
        add(sfx[:, 1], s, at)
    elif k == "riser":
        w = whoosh(1.6, 200, 9000, 0.35) * np.linspace(0.2, 1, int(1.6 * SR))
        add(sfx[:, 0], w, at)
        add(sfx[:, 1], w, at)
    elif k == "impact":
        n = int(1.2 * SR)
        tt = np.arange(n) / SR
        boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-tt / 0.05)) / SR) * np.exp(-tt / 0.45)
        crash = hp(rng.standard_normal(n), 3000) * np.exp(-tt / 0.35) * 0.25
        add(sfx[:, 0], boom * 0.9 + crash, at)
        add(sfx[:, 1], boom * 0.9 + crash * 0.9, at)

# --- Voice -----------------------------------------------------------------------
voice = np.zeros(N)
for c in cues:
    if c["kind"] != "vo":
        continue
    v, rate = sf.read(c["file"], dtype="float32")
    if v.ndim > 1:
        v = v.mean(axis=1)
    if rate != SR:
        v = resample_poly(v, SR, rate)
    v = v / (np.max(np.abs(v)) + 1e-9) * 0.9
    add(voice, v, c["t"])

# The music ducks under the voice: a smoothed envelope of the voice.
venv = lp(np.abs(voice), 6)
venv = venv / (venv.max() + 1e-9)
music_gain = 0.42 * (1 - 0.55 * np.clip(venv * 3, 0, 1))

mix = np.zeros((N, 2))
for side in (0, 1):
    mix[:, side] = voice * 1.0 + music[:, side] * music_gain + sfx[:, side] * 0.7

# Fade the tail.
tail = int(0.8 * SR)
mix[-tail:] *= np.linspace(1, 0, tail)[:, None]
peak = np.max(np.abs(mix))
mix = mix / peak * 0.89

raw = os.path.join(out_dir, "mix-raw.wav")
sf.write(raw, mix.astype(np.float32), SR)
sf.write(os.path.join(out_dir, "music.wav"), (music / (np.max(np.abs(music)) + 1e-9) * 0.8).astype(np.float32), SR)
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", str(SR), os.path.join(out_dir, "mix.wav")],
    check=True,
)
print("mixed", os.path.join(out_dir, "mix.wav"))
