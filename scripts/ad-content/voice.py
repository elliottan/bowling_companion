"""Speaks the ad voiceover lines with Kokoro, an open text-to-speech model.

record.mjs runs this once before recording, with a JSON list on stdin:
[{"text": "...", "out": "/path/to/line.wav"}, ...]
(a line may carry its own "speed"; ADS_TTS_SPEED is the rest's) and reads back one JSON object per line on stdout: {"out": ..., "seconds": ...}.
A clip that already exists is measured, not spoken again.

Setup, once (the model is Apache 2.0, so the voice can run in paid ads):
    python3 -m venv ~/.headpin-tts
    ~/.headpin-tts/bin/pip install kokoro-onnx soundfile
    curl -L -o kokoro-v1.0.onnx https://huggingface.co/fastrtc/kokoro-onnx/resolve/main/kokoro-v1.0.onnx
    curl -L -o voices-v1.0.bin https://huggingface.co/fastrtc/kokoro-onnx/resolve/main/voices-v1.0.bin
then point ADS_TTS_PYTHON at that venv's python and ADS_TTS_MODELS at the
folder holding the two files.
"""

import json
import os
import sys

import soundfile as sf

models = os.environ["ADS_TTS_MODELS"]
voice = os.environ.get("ADS_TTS_VOICE", "af_heart")
speed = float(os.environ.get("ADS_TTS_SPEED", "1.0"))
lines = json.load(sys.stdin)

kokoro = None
for line in lines:
    if not os.path.exists(line["out"]):
        if kokoro is None:
            from kokoro_onnx import Kokoro

            kokoro = Kokoro(
                os.path.join(models, "kokoro-v1.0.onnx"),
                os.path.join(models, "voices-v1.0.bin"),
            )
        samples, rate = kokoro.create(line["text"], voice=voice, speed=line.get("speed", speed), lang="en-us")
        sf.write(line["out"], samples, rate)
    info = sf.info(line["out"])
    print(json.dumps({"out": line["out"], "seconds": round(info.frames / info.samplerate, 3)}))
