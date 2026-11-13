"""Join one-clip-per-line narration into a single track and record where each line starts.

    python line_voice.py ch01/1.1-how-does-a-robot-see [clip_dir]

Takes out/<short>/eleven/line_NN.mp3 (or another folder of line_NN clips),
trims silence at both ends of each clip, joins them with short gaps (longer
ones before a new section, set in GAP_BEFORE), and writes
out/<short>/voice_lines.wav and voice_lines.json:
  {"start": {n: t}, "dur": {n: seconds}, "duration": total}
The scene reads that JSON to time its cuts to the voice.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
SR = 48000
GAP = 0.35
# Extra breathing room before these lines (section changes or holds).
GAP_BEFORE = {3: 0.7, 6: 0.8, 9: 0.8, 10: 0.8, 11: 2.0, 13: 0.9, 14: 2.0, 15: 1.5}


def load(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
                                   "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype=np.float32).copy()


def trim(y, thr_db=-42, pad=0.04):
    env = np.abs(y)
    idx = np.where(env > 10 ** (thr_db / 20))[0]
    if not len(idx):
        return y
    a = max(0, idx[0] - int(pad * SR))
    b = min(len(y), idx[-1] + int(pad * SR * 2))
    return y[a:b]


def main(short, clip_dir=None):
    d = HERE / "out" / short
    src = Path(clip_dir) if clip_dir else d / "eleven"
    clips = sorted(src.glob("line_*.mp3")) + sorted(src.glob("line_*.wav"))
    out, t = [], 0.4
    out.append(np.zeros(int(t * SR), np.float32))
    start, dur = {}, {}
    for i, c in enumerate(clips):
        n = int(c.stem.split("_")[1])
        if i:
            g = GAP_BEFORE.get(n, GAP)
            out.append(np.zeros(int(g * SR), np.float32)); t += g
        y = trim(load(c))
        start[n], dur[n] = round(t, 3), round(len(y) / SR, 3)
        out.append(y); t += len(y) / SR
    out.append(np.zeros(int(2.0 * SR), np.float32)); t += 2.0
    raw = d / "voice_lines.f32"
    np.concatenate(out).astype(np.float32).tofile(raw)
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(raw),
                           "-af", "loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", str(SR), str(d / "voice_lines.wav")])
    raw.unlink()
    info = {"start": start, "dur": dur, "duration": round(t, 3)}
    (d / "voice_lines.json").write_text(json.dumps(info, indent=1))
    print(json.dumps(info))


if __name__ == "__main__":
    main(*sys.argv[1:3])
