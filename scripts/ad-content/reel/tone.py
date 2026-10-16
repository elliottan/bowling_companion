"""Gives a spoken line the tone the words alone do not get from Kokoro.

Kokoro reads "Still guessing your line?" with the pitch falling at the end,
like a statement, and has no way to be asked for a feeling. So the reel's
voice lines can carry a tone, and this reshapes the clip with Praat (pitch
and timing changed by overlap-add, the voice itself untouched):

  question     the last word rises, the way a yes or no question does
  exasperated  the last word drawn out, with a wider, higher swing up to it

A line can also be several clips said one after another, each with its own
tone. compose.mjs runs this with a JSON list on stdin,
[{"parts": [{"in": wav, "tone": name or null}, ...], "gap": s, "out": wav}],
and a clip that already exists is left alone. Needs praat-parselmouth and
soundfile in the same Python as voice.py.
"""

import json
import os
import sys

import tempfile

import numpy as np
import parselmouth
import soundfile as sf
from parselmouth.praat import call


def voiced_end(snd):
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=110, pitch_ceiling=500)
    f0 = pitch.selected_array["frequency"]
    t = pitch.xs()
    v = t[f0 > 0]
    return v[0], v[-1], float(np.median(f0[f0 > 0]))


def reshape(path_in, path_out, tone):
    snd = parselmouth.Sound(path_in)
    start, end, median = voiced_end(snd)
    manip = call(snd, "To Manipulation", 0.01, 110, 500)
    # Praat only moves the periods it found, and it finds none in the hum of
    # a final "n", which would keep its old pitch and drop back. Fill short
    # gaps in the voicing with periods at the pitch either side.
    pulses = call(manip, "Extract pulses")
    times = [call(pulses, "Get time from index", i) for i in range(1, call(pulses, "Get number of points") + 1)]
    for t0, t1 in zip(times, times[1:]):
        if 0.012 < t1 - t0 < 0.2:
            step = 1 / median
            t = t0 + step
            while t < t1 - step / 2:
                call(pulses, "Add point", t)
                t += step
    if times and end - times[-1] > 0.012:
        t = times[-1] + 1 / median
        while t < end:
            call(pulses, "Add point", t)
            t += 1 / median
    call([manip, pulses], "Replace pulses")
    tier = call(manip, "Extract pitch tier")
    n = call(tier, "Get number of points")
    pts = [(call(tier, "Get time from index", i), call(tier, "Get value at index", i)) for i in range(1, n + 1)]
    call(tier, "Remove points between", 0, snd.duration)

    if tone == "question":
        # The last word, about half a second, is replaced by a climb from
        # where it starts to well above the line's own middle.
        a = end - 0.5
        f_a = next((f for t, f in pts if t >= a), median)
        for t, f in pts:
            if t < a:
                call(tier, "Add point", t, f)
        top = max(f_a, median) * 1.45
        for i in range(11):
            k = i / 10
            call(tier, "Add point", a + k * (end - a), f_a + (top - f_a) * k ** 1.4)
    elif tone == "exasperated":
        # A wider swing overall, then the last word drawn out: up high on
        # its stress and hanging there, the "seriously?" of it.
        a = end - 0.5
        for t, f in pts:
            f2 = median * (f / median) ** 1.35
            if t > a:
                k = (t - a) / (end - a)
                f2 *= 1 + 0.45 * np.sin(min(k, 1) * np.pi * 0.75)
            call(tier, "Add point", t, f2)
        dur = call(manip, "Extract duration tier")
        call(dur, "Add point", a - 0.01, 1.0)
        call(dur, "Add point", a + 0.02, 1.35)
        call(dur, "Add point", snd.duration, 1.35)
        call([manip, dur], "Replace duration tier")
    else:
        raise SystemExit(f"unknown tone {tone}")

    call([manip, tier], "Replace pitch tier")
    out = call(manip, "Get resynthesis (overlap-add)")
    out.save(path_out, "WAV")


for job in json.load(sys.stdin):
    if not os.path.exists(job["out"]):
        clips = []
        rate = None
        for part in job["parts"]:
            path = part["in"]
            if part.get("tone"):
                path = os.path.join(tempfile.mkdtemp(), "toned.wav")
                reshape(part["in"], path, part["tone"])
            a, rate = sf.read(path, dtype="float32")
            clips.append(a / (np.max(np.abs(a)) + 1e-9) * 0.9)
        gap = np.zeros(int(job.get("gap", 0.15) * rate), dtype=np.float32)
        joined = clips[0]
        for c in clips[1:]:
            joined = np.concatenate([joined, gap, c])
        sf.write(job["out"], joined, rate)
    print(json.dumps({"out": job["out"], "seconds": round(sf.info(job["out"]).duration, 3)}))
