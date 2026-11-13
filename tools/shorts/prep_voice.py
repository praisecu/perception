"""Clean a voice recording and tighten its pauses, using Whisper segments.

python prep_voice.py recording.m4a transcript.json ch01/1.2-why-is-seeing-hard/voice "0,1|2|3,4|5,6|7|8,9,10,11|12|13|14"

The last argument groups segment indices into beats ("|" separates beats).
Writes out/<out_name>.wav (cleaned, gaps tightened) and out/<out_name>.json
(out_name may include folders, e.g. one per short)
with the start time of every beat and every segment in the new audio.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
SR = 48000
PAD_IN, PAD_OUT = 0.10, 0.22
GAP_LINE, GAP_BEAT = 0.30, 0.55


def load(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
                                   "-af", "highpass=f=75,afftdn=nf=-28,deesser",
                                   "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype=np.float32).copy()


def main(rec, seg_json, name, groups):
    segs = json.loads(Path(seg_json).read_text())
    audio = load(rec)
    beats = [[int(i) for i in g.split(",")] for g in groups.split("|")]
    out, t = [], 0.0
    beat_starts, seg_starts = [], {}
    for bi, beat in enumerate(beats):
        if bi:
            out.append(np.zeros(int(GAP_BEAT * SR), np.float32)); t += GAP_BEAT
        beat_starts.append(round(t, 3))
        for k, si in enumerate(beat):
            s = segs[si]
            words = s.get("words") or []
            a = (words[0]["start"] if words else s["start"]) - PAD_IN
            b = (words[-1]["end"] if words else s["end"]) + PAD_OUT
            if si + 1 < len(segs):
                nxt = segs[si + 1]
                nstart = (nxt.get("words") or [nxt])[0]["start"]
                b = min(b, nstart - 0.02)
            clip = audio[max(0, int(a * SR)): int(b * SR)].copy()
            fade = int(0.012 * SR)
            clip[:fade] *= np.linspace(0, 1, fade)
            clip[-fade:] *= np.linspace(1, 0, fade)
            if k:
                out.append(np.zeros(int(GAP_LINE * SR), np.float32)); t += GAP_LINE
            seg_starts[si] = round(t + PAD_IN, 3)
            out.append(clip); t += len(clip) / SR
    out.append(np.zeros(int(0.4 * SR), np.float32)); t += 0.4
    y = np.concatenate(out)
    base = HERE / "out" / name
    base.parent.mkdir(parents=True, exist_ok=True)
    raw_path = base.with_name(base.name + "_raw.f32")
    y.astype(np.float32).tofile(raw_path)
    wav = base.with_suffix(".wav")
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(raw_path),
                           "-af", "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-1.5:LRA=9",
                           "-ar", str(SR), str(wav)])
    raw_path.unlink()
    info = {"duration": round(t, 3), "beats": beat_starts, "segments": seg_starts,
            "text": {i: segs[i]["text"].strip() for i in seg_starts}}
    base.with_suffix(".json").write_text(json.dumps(info, indent=1))
    print(json.dumps(info, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:])
