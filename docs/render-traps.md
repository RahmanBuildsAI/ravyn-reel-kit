# Render traps

Everything here fails silently: the check passes, the render finishes, and the reel is still
wrong. The fix for a silent trap is always the same: **measure the rendered pixels and listen to
the rendered audio.** Never trust a passing gate on its own.

All commands run from the `studio/` folder.

## 1. "Check passed" is not a pass

`npx --yes hyperframes@0.7.89 check .` (or `node ravyn/cli.mjs check <id>`) prints contrast
failures and overlapping text as WARNINGS, prints the element, the time and even a suggested
colour, and then still says "Check passed" because there are zero errors. Reading only the last
line is how unreadable text ships.

Read the sections and require all of these:

1. **Contrast:** the line reads `N/N text checks pass WCAG AA`, with both numbers equal. One
   failure blocks the render.
2. **Layout:** zero `content_overlap` and zero `text_occluded`. Not "only warnings". Zero.
3. **Zero GSAP errors and zero track errors.**
4. **Zero media errors** (a missing file, a clip longer than its media).

What the check cannot see, so check it by eye on the board and the test render:

- **Text over a built graphic.** The layout check compares text against text. A caption sitting
  on top of a card, a logo or a chart is never flagged. Compare their vertical bands by hand.
- **Text over bright footage.** A white word over a white product passes on a dark scene. Look at
  the frame.

## 2. Render with two workers

```bash
node ravyn/cli.mjs render <id> --workers 2
```

The default of 4 parallel browser workers can crash a long reel with several video clips partway
through, and the error looks like running out of memory. Two workers is slower and finishes.

## 3. The 3-second test render first

```bash
node ravyn/cli.mjs render <id> --from 5 --to 8 --workers 2
```

It writes `renders/<id>-test-5s.mp4` in under a minute. Pick the hardest 3 seconds (the busiest
scene change, the first video clip, the CTA). Pull a frame and look at it:

```bash
ffmpeg -v error -ss 1.5 -i renders/<id>-test-5s.mp4 -frames:v 1 test-frame.png
```

A full render costs about a minute per minute of reel. The test costs seconds and catches a black
card, a frozen clip or a silent track before you spend that minute.

## 4. Audio traps

- **A clip's own sound lands at 0:00.** If a video clip keeps its audio, listen to the render at
  that clip's real time and make sure the sound is there and not at the start of the reel. If it
  is wrong, separate the sound into its own audio clip at the same start time.
- **An `<audio>` element without an `id` renders silent.** ravyn adds ids; anything written by
  hand needs one.
- **The last word gets clipped** when the root duration is the last word's transcript end.
  Whisper's final word can end before the audio does. The root runs to the full audio length
  (check it with `ffprobe -v error -show_entries format=duration -of csv=p=0 assets/rNN/vo.mp3`)
  plus 0.5 to 2 s of tail.
- After the render, listen once end to end with the picture off. Missing sounds are easier to
  hear than to see.

## 5. Picture traps

- **A dark layer on top dims everything under it.** When one word looks dull while the captions
  around it look bright, the cause is almost always a darker layer painted above it, not its
  colour. Check the paint order (the track order in ravyn) before touching the colour.
- **Theme colours lose to inline colours.** When a scene switches to a light ground, any element
  with an inline colour keeps its pale colour and disappears. Re-run the contrast check on every
  newly themed scene.
- **A landscape capture in a portrait box with `cover`** keeps only the centre strip of the page,
  which is often empty margin. The frame renders white with no error. Use `contain` in a band for
  full bleed.
- **A scene boundary rounds to a frame.** A cut at 3.27 s lands on a whole frame at 30 fps. An
  element meant to vanish exactly on the cut can show for one frame. Scrub the frame before and
  after every cut in the test render.
- **Phone video is often variable frame rate**, which drifts out of sync over a minute. The
  ingest makes a constant 30 fps copy (`facecam-fix.mp4`); always build from that copy.
- **HDR clips.** A phone clip tagged HDR can push the renderer into a different path that crashes
  with "Target closed" when there is more than one video. ravyn renders with `--sdr`; keep it.

## 6. Hand-written HTML traps (custom blocks only)

ravyn compiles the project for you; never edit `variants/*.html` or `index.html` by hand. If you
write a custom block, these bite:

- A `<video>` with its own timing must be a direct child of the root, never nested inside a timed
  scene, or it freezes. Keep `preload="auto"`.
- A CSS `transform` and a GSAP tween on the same property cancel each other. Position with GSAP
  only.
- `gsap.from({opacity: 0})` on an element whose CSS is already `opacity: 0` does nothing. Use
  `fromTo`.
- A canvas overlay needs `width: 100%; height: 100%` as well as `inset: 0`.
- An element with `top:` but no `position: absolute` reflows to the top of the scene.
- A strobe with an even `repeat` and `yoyo` ends at full opacity. End it before the element is
  removed, or it ghosts back.
- A highlight box must live inside the container that zooms, or it drifts off its target.

## 7. After the full render

```bash
ffmpeg -v error -i renders/<file>.mp4 -vf "fps=2,scale=240:-1,tile=3x3" sheet%02d.png
```

Each sheet covers 4.5 seconds; frame number k (from 0) on sheet s sits at
`((s - 1) * 9 + k) * 0.5` seconds. Look at every sheet before the user sees the reel.
