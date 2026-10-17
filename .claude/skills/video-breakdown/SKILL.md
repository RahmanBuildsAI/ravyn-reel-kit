---
name: video-breakdown
description: Measure any reference video from its file and turn what it teaches into a new style in styles/. Use when the user says break down this video, how did they edit this, what makes this reel work, study this mp4, measure this video, I want my reels to feel like this one, make a style from this, or drops a video file and asks what is going on in it. Also the first step of "build my reel in this look". It measures frames, cuts, colours, motion timing, a word-level transcript and the sound profile, then writes styles/<name>/STYLE.md in the same format as styles/window/STYLE.md.
---
# Video breakdown

**Measure, never guess.** Every claim in the breakdown comes from the file. Words like "smooth",
"clean" or "punchy" are banned in the output unless the number that produces them follows.

## The rule that comes first

A breakdown is for learning techniques: timing, pacing, layout, motion, sound density. It is
never a way to copy someone's video.

- Never reuse their footage, frames, audio, music, graphics, logos, fonts you have no licence for,
  or their face, name, handle or branding.
- Never put a frame of the reference into `styles/` (no reference `preview.png`). The new style's
  preview comes later, from the user's own first render in that style.
- Never write the creator's name or handle into the style. Name the style after what it does
  (`ticker`, `split-desk`, `slow-zoom`), not after who made the reference.
- The reference file stays in the breakdown's work folder and never ships with anything.
- If the user asks for a frame-for-frame copy of a specific video, decline that part and offer
  the technique-level style instead.

## Setup

Work folder: `breakdowns/<name>/` at the kit root (create it). Copy the measuring scripts from
`docs/breakdown-measure.md` into it as `motion.py`, `colors.py`, `audio_profile.py`. Needs
`ffmpeg`, `ffprobe`, Python 3, `pip install numpy pillow`, and for the transcript
`pip install openai-whisper`. Run every command below from the work folder; `<video>` is the
path to the reference.

## 0. Probe

```bash
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate -of default=noprint_wrappers=1 "<video>"
```

Note resolution, aspect (9:16, 4:5, 16:9), fps, duration, and whether there is audio.

## 1. Frames

Contact sheets at 2 fps for the whole arc, then dense 10 fps sheets on anything fast (the intro,
every transition, every reveal):

```bash
ffmpeg -v error -i "<video>" -vf "fps=2,scale=240:-1,tile=3x3" sheet%02d.png
ffmpeg -v error -ss <t0> -to <t1> -i "<video>" -vf "fps=10,scale=236:-1,tile=3x3" dense%02d.png
```

Look at EVERY sheet. Each 2 fps sheet covers 4.5 s: frame k (from 0, reading left to right, top
to bottom) on sheet s sits at `((s - 1) * 9 + k) * 0.5` seconds. On a dense sheet starting at t0,
frame k sits at `t0 + k * 0.1`. Compute times from position; do not burn timestamps in with
`drawtext`, it depends on a working font setup.

For a full-size still of any moment: `ffmpeg -v error -ss <t> -i "<video>" -frames:v 1 key-<t>.png`.

## 2. Cuts and motion

```bash
python motion.py "<video>"
ffmpeg -v error -i "<video>" -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | findstr pts_time
```

(`grep pts_time` instead of `findstr` in Git Bash.) The first gives hard cuts, shot lengths,
the share of time the screen is moving, and every motion burst with its length in frames. The
second is ffmpeg's own scene detector as a cross-check.

From the bursts and the dense sheets, write down:

- Entry duration and exit duration of each element kind (frames and seconds).
- The ease: peak early in the burst = ease-out; overshoot visible on a dense sheet = back-out
  (estimate how far past the rest position, in px at source width).
- Idle motion: does anything drift or push while held? How much over how long?
- The transition mechanic at each scene change (cut, slide, zoom, blur, a shape that moves).
- Positions and sizes of every recurring element, in px at source width, scaled to 1080 wide.

## 3. Colours and type

```bash
python colors.py key-1.2.png key-5.0.png key-9.8.png
```

Pick key frames that show each scene type. Crop tight on a word for text colours. Output: ground
hex, ink hex, accent hex(es), card fill, shadow, the dim colour of not-yet-spoken words. For
type, measure cap height and line height in px on a full-size still and scale to 1080 wide; name
the closest free font family (Google Fonts) and weight. Never claim to know the exact font.

## 4. Word-level transcript

```bash
ffmpeg -v error -i "<video>" -vn -ac 1 -ar 16000 audio16k.wav
python ../../studio/tools/words.py audio16k.wav small.en > words.json
```

Use `small` instead of `small.en` for a video not in English. Whisper garbles names: fix the
display text, keep the timings. From the words, measure: words per second, where the hook ends,
how many words per caption, and how close each visual change lands to its word (compare with the
cut and burst times from step 2).

## 5. Sound profile (this is where the hidden rules are)

```bash
ffmpeg -v error -i "<video>" -vn -ac 1 -ar 22050 -c:a pcm_s16le audio22k.wav
python audio_profile.py audio22k.wav
```

It answers: is there a music bed at all, and how far under the voice? Is there a real beat, at
what BPM? How many sound effects per minute, and at what times? Are there low swells under scene
changes, a riser at the start? Match the transient times against the cuts and bursts: the share
of visual events that carry a sound is the style's sound density rule. Never assume a bed exists;
many strong reels have none.

## 6. Write the style

Create `styles/<name>/STYLE.md` in the same format as `styles/window/STYLE.md`, with the user's
own content in mind, not the reference's:

1. `# Style: NAME` and one short paragraph: what the style is and who it suits.
2. **Format** (size, fps) and **You need** (what the user must record or collect).
3. **The scene types**, as a table: what is on screen, where the captions sit.
4. **Sequence rules**, numbered, with the measured numbers (shot length range, how often each
   scene type appears, how the reel opens and closes).
5. **Layouts** with exact px positions and sizes at 1080 wide.
6. **Movement**: entry and exit durations, eases, overshoot, idle drift, the transition mechanic,
   each with its number. "Nothing just fades" if the measurements say so.
7. **Look**: a token table (ground, ink, accent, fonts with sizes and weights, card radius,
   shadow).
8. **Safe zone**: nothing important below y 1700 on a 9:16 frame (adjust for other aspects).
9. **Captions**: words per caption, lines, emphasis treatment, timing to the voice.
10. **Sound**: bed or no bed and its level, effects per minute, which events get a sound, swells.
11. **Checklist before you render**: 5 to 8 boxes, each one checkable by looking.

Every number in the file must trace to a measurement from steps 1 to 5. Where the reference
does something the kit's craft rules forbid (text below the safe zone, harsh sounds, unreadable
contrast), keep the kit's rule and say so in one line in the style.

Adding a style never changes another style. Do not edit `styles/window/STYLE.md` or any other
style because the new one "does it better". Each style stays buildable on its own.

## 7. Report to the user

In short plain sentences:

1. The one-line read: what the whole video IS.
2. The three biggest things the measurement found that the eye missed (with numbers).
3. What the new style keeps, and anything it changed to stay inside the kit's rules.
4. The path to the new `STYLE.md`, and that the user can build with it by saying
   "build reel N in <name>" (the `reel-build` skill).

If the user wants their next reel in this style, map their script's beats onto the style's scene
types before building, and run the board first as always.
