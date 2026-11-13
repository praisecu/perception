"""Add an AI voiceover to a short.

Each line is spoken with Kokoro (an open, offline neural voice) and placed at
the start of its beat. If a line runs long, the next one waits for it, and the
whole track is checked against the video length.

Usage (from tools/shorts, with the TTS venv):
    tts/.venv/Scripts/python narrate.py ch01_seeing out/ch01-how-does-a-robot-see.mp4

Lines and beat times live in narration.json.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).parent
SR = 24000


def main(key, video, voice=None, speed=None):
    cfg = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    short = cfg[key]
    voice = voice or cfg.get("voice", "af_heart")
    speed = float(speed or cfg.get("speed", 1.0))
    tts = Kokoro(str(HERE / "tts" / "kokoro-v1.0.onnx"), str(HERE / "tts" / "voices-v1.0.bin"))

    dur = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)]).decode())
    track = np.zeros(int((dur + 2) * SR), dtype=np.float32)
    t = 0.0
    report = []
    for beat in short["lines"]:
        audio, sr = tts.create(beat["text"], voice=voice, speed=speed * beat.get("speed", 1.0), lang="en-us")
        assert sr == SR
        # Trim leading and trailing silence so lines sit tightly on their beats.
        a = np.abs(audio)
        nz = np.where(a > 0.01)[0]
        audio = audio[max(0, nz[0] - 600): nz[-1] + 1200] if len(nz) else audio
        start = max(beat["at"], t)
        i = int(start * SR)
        track[i:i + len(audio)] += audio
        t = start + len(audio) / SR + beat.get("gap", 0.25)
        report.append(f'{start:5.2f}-{start + len(audio) / SR:5.2f}  (beat {beat["at"]:5.2f})  {beat["text"]}')
    print("\n".join(report))
    end = t
    if end > dur + 0.3:
        print(f"WARNING: narration ends at {end:.2f}s but the video is {dur:.2f}s")
    track = track[: int(dur * SR)]
    peak = np.abs(track).max() or 1
    track = track / peak * 0.89
    wav = HERE / "out" / f"{key}_voice.wav"
    sf.write(wav, track, SR)
    out = Path(video).with_name(Path(video).stem + "-voiced.mp4")
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(wav),
                           "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                           "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-shortest", str(out)])
    print("wrote", out)


if __name__ == "__main__":
    main(*sys.argv[1:])
