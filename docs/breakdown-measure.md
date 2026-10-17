# Breakdown measuring scripts

Three small Python scripts the `video-breakdown` skill uses to turn a reference video into
numbers. Save each one into the breakdown's work folder (`breakdowns/<name>/`) and run it from
there. They need Python 3 plus:

```bash
pip install numpy pillow
```

and `ffmpeg` / `ffprobe` on the PATH (`winget install Gyan.FFmpeg` on Windows).

## motion.py: cuts, motion bursts and how long moves take

Reads every frame (scaled down to grey), measures how much each frame differs from the one
before, then prints the hard cuts, the motion bursts (an element moving in or out) with their
length in frames and seconds, and the share of time the screen is moving at all.

```python
# python motion.py <video> [fps]
import subprocess, sys, json
import numpy as np

src = sys.argv[1]
info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=r_frame_rate", "-of", "json", src], capture_output=True, text=True).stdout)
num, den = info["streams"][0]["r_frame_rate"].split("/")
fps = float(sys.argv[2]) if len(sys.argv) > 2 else float(num) / float(den or 1)
W, H = 90, 160
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", f"scale={W}:{H}", "-f", "rawvideo",
    "-pix_fmt", "gray", "pipe:1"], capture_output=True).stdout
f = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
d = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))          # d[i] = change from frame i to i+1
med = float(np.median(d))
cut_bar = max(12.0, 6 * med)
move_bar = max(1.5, 2 * med)
cuts = []
for i in range(len(d)):
    if d[i] > cut_bar and not (cuts and (i + 1) / fps - cuts[-1] < 2.5 / fps):   # one cut per 2 frames
        cuts.append(round((i + 1) / fps, 3))
print(f"frames {len(f)}  fps {fps:.3f}  median change {med:.2f}")
print(f"hard cuts ({len(cuts)}):", cuts)
gaps = np.diff([0] + cuts + [len(f) / fps])
print(f"shot length: mean {gaps.mean():.2f}s  min {gaps.min():.2f}s  max {gaps.max():.2f}s")
moving = (d > move_bar) & (d <= cut_bar)
print(f"screen moving {100 * moving.mean():.0f}% of the time")
bursts, start = [], None
for i, m in enumerate(list(moving) + [False]):
    if m and start is None: start = i
    if not m and start is not None:
        if i - start >= 3: bursts.append((start, i))
        start = None
print("motion bursts (start s, frames, seconds, peak change):")
for a, b in bursts:
    print(f"  {a / fps:7.2f}  {b - a:3d}f  {(b - a) / fps:.2f}s  peak {d[a:b].max():.1f}")
```

Read the bursts as entrance and exit durations: a card that slides in over 0.4 s shows as a
burst of about 12 frames at 30 fps. A burst whose peak sits in its first third is an ease-out
(fast start, soft landing); a peak in the middle is ease-in-out. A long low burst is a slow push
or drift.

## colors.py: the palette of each key frame

Pass key frames extracted with ffmpeg. Prints the dominant colours with their share of the frame
and the most saturated pixel (the accent candidate).

```python
# python colors.py frame1.png frame2.png ...
import sys, colorsys
import numpy as np
from PIL import Image

def vivid(p):
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in p))
    return s * (1 - abs(2 * l - 1))                  # saturated AND mid-light, not near black or white

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    im.thumbnail((270, 480))
    q = im.quantize(colors=12)
    pal = q.getpalette()
    idx, n = np.unique(np.asarray(q).ravel(), return_counts=True)
    print(path)
    for k in np.argsort(-n)[:8]:
        r, g, b = pal[idx[k] * 3: idx[k] * 3 + 3]
        print(f"  #{r:02X}{g:02X}{b:02X}  {100 * n[k] / n.sum():5.1f}%")
    px = {tuple(p) for p in np.asarray(im).reshape(-1, 3)[::7]}
    r, g, b = max(px, key=vivid)
    print(f"  accent candidate: #{r:02X}{g:02X}{b:02X}")
```

Get the key frames first:

```bash
ffmpeg -v error -ss <t> -i "<video>" -frames:v 1 key-<t>.png
```

Text colours: crop tight on a word and run the script on the crop; the two top colours are the
ground and the ink.

## audio_profile.py: bed or no bed, beat, and the sound-effect map

First extract a mono 22.05 kHz wav:

```bash
ffmpeg -v error -i "<video>" -vn -ac 1 -ar 22050 -c:a pcm_s16le audio22k.wav
```

```python
# python audio_profile.py audio22k.wav
import sys, wave
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

w = wave.open(sys.argv[1]); sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
win, hop = int(sr * 0.05), int(sr * 0.01)                 # 50 ms windows every 10 ms
fr = sliding_window_view(x, win)[::hop] * np.hanning(win)
spec = np.abs(np.fft.rfft(fr, axis=1)) ** 2
fq = np.fft.rfftfreq(win, 1 / sr)
bands = {"sub <80": (0, 80), "low 80-300": (80, 300), "mid 300-2k": (300, 2000), "high 2k+": (2000, sr / 2)}
db = {k: 10 * np.log10(spec[:, (fq >= a) & (fq < b)].sum(1) + 1e-10) for k, (a, b) in bands.items()}
total = 10 * np.log10(spec.sum(1) + 1e-10)
t = np.arange(len(total)) * hop / sr

# 1. bed: compare the quietest 10% of the track (the gaps between phrases) with the loud part
quiet, loud = np.percentile(total, 10), np.percentile(total, 70)
print(f"gap level {quiet:.1f} dB vs speech {loud:.1f} dB: difference {loud - quiet:.1f} dB")
print("  over ~35 dB: no bed (silence in the gaps). 15 to 35: a quiet bed. under 15: a loud bed or music")

# 2. beat: autocorrelation of low-end onsets between 50 and 180 BPM
onset = np.maximum(np.diff(db["sub <80"] + db["low 80-300"]), 0)
onset -= onset.mean()
ac = np.correlate(onset, onset, "full")[len(onset) - 1:]
lo, hi = int(60 / 180 / 0.01), int(60 / 50 / 0.01)
lag = lo + int(np.argmax(ac[lo:hi]))
strength = ac[lag] / (ac[0] + 1e-9)
print(f"strongest pulse {60 / (lag * 0.01):.0f} BPM, strength {strength:.2f} (over ~0.3 = a real beat)")

# 3. sound-effect map: high-band jumps well above the recent level
h = db["high 2k+"]
hits = []
for i in range(30, len(h)):
    if h[i] - np.median(h[i - 30:i]) > 10 and (not hits or t[i] - hits[-1] > 0.15):
        hits.append(round(float(t[i]), 2))
dur = len(x) / sr
print(f"{len(hits)} high transients in {dur:.1f}s = {60 * len(hits) / dur:.0f} per minute")
print("  times:", hits)

# 4. low swells (sub energy rising 8 dB over half a second): risers and scene-change swells
s = db["sub <80"]
swells = []
for i in range(50, len(s) - 25):
    if s[i] - s[i - 50] > 8 and s[i] == s[i - 25: i + 25].max() and (not swells or t[i] - swells[-1] > 0.5):
        swells.append(round(float(t[i]), 2))
print("  sub swells:", swells)

# 5. band levels per second
print("sec  " + "  ".join(f"{k:>11}" for k in bands))
for sec in range(int(dur)):
    m = (t >= sec) & (t < sec + 1)
    print(f"{sec:3d}  " + "  ".join(f"{db[k][m].mean():11.1f}" for k in bands))
```

How to read it:

- A transient that lands on a cut or a motion burst from `motion.py` is a sound effect scored to
  a visual event. Count how many visual events have one: that ratio is the sound density rule.
- Transients that fall on speech only are usually consonants, not effects. Check them against the
  word times from `words.py` before counting them.
- A swell just before each cut is a scene-change swell. A swell over the first seconds is an intro
  riser.
- Speech with a high gap level and a strong pulse is a music bed. Measure how far under the voice
  it sits (the loud level with and without speech).
