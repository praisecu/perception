"""Voice a short with ElevenLabs, one clip per script line, placed at the script's times.

    setx ELEVENLABS_API_KEY <your key>      (once, then open a new terminal)
    python eleven_voice.py ch01/1.1-how-does-a-robot-see

Reads out/<short>/script.md (the table's Time and Voiceover columns), writes
out/<short>/eleven/line_NN.mp3, out/<short>/voice_eleven.wav and
out/<short>/<video>_eleven.mp4 (the silent cut with the voice laid on top).
Clips already generated are reused, so re-running only fetches missing lines.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import requests

HERE = Path(__file__).parent
VOICE_ID = "NOpBlnGInO9m6vDvFkFC"
MODEL = "eleven_v4"
SR = 48000


def lines(script):
    out = []
    for row in script.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\|\s*(\d+)\s*\|\s*(\d+):(\d\d)\s*\|[^|]*\|\s*(.+?)\s*\|\s*$", row)
        if m:
            out.append((int(m[1]), int(m[2]) * 60 + int(m[3]), m[4].replace("...", "").strip()))
    return out


def fetch(text, dest, key):
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128",
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        json={"text": text, "model_id": MODEL, "language_code": "en"},
        timeout=120,
    )
    if r.status_code != 200:
        sys.exit(f"ElevenLabs error {r.status_code}: {r.text[:300]}")
    dest.write_bytes(r.content)


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", str(path)]).decode())


def main(short):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("Set ELEVENLABS_API_KEY first.")
    d = HERE / "out" / short
    clips = d / "eleven"
    clips.mkdir(exist_ok=True)
    plan, t_free = [], 0.0
    for n, t, text in lines(d / "script.md"):
        mp3 = clips / f"line_{n:02d}.mp3"
        if not mp3.exists():
            print(f"line {n}: {text}")
            fetch(text, mp3, key)
        start = max(t + 0.15, t_free)
        if start > t + 0.4:
            print(f"  note: line {n} starts {start - t:.1f} s after its visual (previous line runs long)")
        dur = duration(mp3)
        plan.append((mp3, start))
        t_free = start + dur + 0.25
    video = next(p for p in d.glob("*_silent.mp4"))
    vlen = duration(video)
    if t_free > vlen:
        print(f"  note: voice runs {t_free - vlen:.1f} s past the video end")
    inputs, filt = [], []
    for i, (mp3, start) in enumerate(plan):
        inputs += ["-i", str(mp3)]
        filt.append(f"[{i}:a]aresample={SR},adelay={int(start * 1000)}:all=1[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(plan)))
    filt.append(f"{mix}amix=inputs={len(plan)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,apad[out]")
    wav = d / "voice_eleven.wav"
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filt),
                           "-map", "[out]", "-t", f"{vlen:.3f}", "-ar", str(SR), str(wav)])
    out = video.with_name(video.name.replace("_silent", "_eleven"))
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(wav), "-c:v", "copy",
                           "-c:a", "aac", "-b:a", "192k", "-map", "0:v", "-map", "1:a", "-shortest", str(out)])
    (d / "voice_eleven.json").write_text(json.dumps([{"clip": p.name, "start": round(s, 2)} for p, s in plan], indent=1))
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1])
