# The ravyn project file (`projects/<id>.json`)

One JSON file per reel is the only source of truth. ravyn edits it, `lib/compile.mjs` turns
it into the HyperFrames composition, and nothing edits the HTML by hand. Times are seconds,
frame-quantised to `fps`. Geometry is composition pixels (1080 x 1920 for a reel).

```json
{
  "schema": 1,
  "id": "reel-001-topic",             // file name, composition id, render name prefix
  "title": "Reel 1 · the hook line",
  "reel": 1,                          // assets live in assets/r01/
  "fps": 30, "width": 1080, "height": 1920,
  "duration": 61.4,                   // root data-duration (the VO length on import)
  "background": "#F4F1EA",            // the ground behind every non-face scene
  "watermark": { "on": false, "text": "@yourhandle", "top": 96 },
  "style": "window",                  // "window" (the facecam style) or null (plain)
  "tracks": [ ...Track ],
  "clips":  [ ...Clip ],
  "markers": [ { "id": "m1", "t": 3.27, "label": "jump cut", "color": "#7CC4FF" } ],
  "words": [ { "text": "Upwork", "start": 0, "end": 0.44 } ],   // from words.js, captions build from these
  "meta": { "created": "...", "modified": "...", "app": "editor", "version": 1 }
}
```

## Track

```json
{ "id": "v2", "kind": "video", "name": "V2", "locked": false, "hidden": false, "muted": false }
```

- `kind` is `video` (anything visual) or `audio`.
- Video tracks are listed **bottom to top**. Their order is the paint order: the first video
  track compiles to `z-index:10`, the next to `20`, and so on. "Bring forward" = move the clip
  to the track above. The watermark sits at `z-index:900`.
- `hidden` video tracks and `muted` audio tracks are skipped by the compiler, so they never
  reach the render either.
- Two clips on one track never overlap in time. Dropping a clip onto another one is an
  overwrite edit (the clip underneath is trimmed, split or removed), the Premiere default.

## Group (a clip that holds clips)

```json
{
  "id": "c209", "type": "group", "track": "v2", "name": "card 3", "start": 4, "duration": 6,
  "tracks": [ { "id": "v12", "kind": "video", "name": "V2" }, { "id": "v13", "kind": "video", "name": "V3" } ],
  "clips":  [ { "id": "c40", "track": "v12", "type": "shape", "start": 4, "duration": 6, ... },
              { "id": "c41", "track": "v13", "type": "text",  "start": 5, "duration": 4, ... } ]
}
```

- A group is a root clip on a video track. Its `clips` keep their **real reel times** (no local
  clock), so `M.groupClips` and `M.ungroup` never change a start, a duration, a word time or a
  key. `start` / `duration` always equal the children's extent (`M.fitGroup`, applied by
  `M.normalizeGroups` after every edit; an empty group is dropped).
- Editing inside a group goes through `M.scopeOf(project, groupId)`: an object whose `clips` and
  `tracks` are the group's, with `fps`, `duration`, `words` and `markers` read from the project.
  Every model op takes a scope, so the ops never learn about groups. `M.clipById` and
  `M.trackById` look inside groups too; `M.allClips` lists every clip that renders.
- Paint order: a child's `z-index` is its group's slot plus one to nine (its internal video
  track index), so children paint above the group's track and below the next one. The compiler
  (`visibleClips`) flattens groups; the HTML never contains a group.
- Rules: one level (grouping a group merges it), `facecam` and `cta` never go inside, ids are
  allocated project-wide (`M.idAllocator`), and a group that comes to overlap a neighbour on
  its track is lifted to a free track by `normalizeGroups`. `M.sliceProject` flattens first.

## Clip (common fields)

```json
{
  "id": "c12", "track": "v2", "type": "video", "name": "opus-cliplist",
  "start": 2.035, "duration": 1.235,
  "x": 0, "y": 0, "w": 1080, "h": 1920, "rotation": 0, "scale": 1, "opacity": 1,
  "locked": false, "label": "#ffb020",
  "enter": { "type": "slideUp", "dur": 0.4, "ease": "power3.out" },
  "exit":  { "type": "fade", "dur": 0.3, "ease": "power2.in" },
  "keyframes": { "x": [ { "t": 0, "v": 0, "ease": "none" }, { "t": 1.2, "v": -120, "ease": "power2.inOut" } ] },
  "effects": { "blur": 0, "brightness": 1, "contrast": 1, "saturate": 1 }
}
```

- `x`,`y` are the top-left of the untransformed box. `scale` and `rotation` act around the
  box centre (`transform-origin: 50% 50%`). The compiler emits `gsap.set` for these.
- `enter` / `exit` types: `none fade slideUp slideDown slideLeft slideRight pop blur`.
- `keyframes` (phase 2 UI, compiler already honours them): per property (`x y scale rotation
  opacity`), `t` relative to the clip start, `v` the value, `ease` the GSAP ease INTO that key.
  A keyframed property overrides enter/exit for that property.
- `effects` compile to a static CSS `filter`.
- `mblur` (px): the peak of the faked directional motion blur on the clip's fast moves (the smooth grammar).

## Per type

| type | extra fields |
|---|---|
| `video` | `src`, `mediaStart` (in point, seconds into the file), `mediaDuration`, `mediaWidth`, `mediaHeight`, `fit` (`cover contain fill`), `radius`, `audio` (true = the clip's own sound is used; compiles to `data-has-audio` + `data-volume`, no `muted`), `volume`, `stroke` |
| `image` | `src`, `fit`, `radius`, `mediaWidth`, `mediaHeight` |
| `audio` | `src`, `mediaStart`, `mediaDuration`, `volume`, `fadeIn`, `fadeOut` (fades are editor-side; the render uses `data-volume` only) |
| `text` | `text` (newlines allowed), `font` (a family from `lib/fonts.mjs`), `weight`, `italic`, `size` px, `lineHeight`, `letterSpacing` em, `align` (`left center right`), `valign` (`top middle bottom`), `fill` (colour), `uppercase`, `shadow` (`none soft hard glow light`), `pill` (`{color, radius, padX, padY}` or null), `hAuto` (height follows the content) |
| `shape` | `shape` (`rect ellipse`), `fill`, `stroke` (`{color, width}` or null), `radius` |
| `caption` | `words` [{text,start,end,srcStart?}] (absolute times; `srcStart` remembers the transcript word it came from so an edit in the cue also fixes `project.words`), `sys` (`capFace capSeam capSide capGround`, the window style's four caption styles; a word with `em: true` is the emphasis word, serif italic in the accent), `hold` (true: a word stays in the `lit` colour once spoken instead of returning to `fill`, so grey words settle to ink), `fill`, `lit` (the karaoke colour), `size`, `shadow`. Compiles to the `.cap` grammar: one `<b id="<clip>w<i>">` per word, ZWSP between words, `tl.set` colour flips on each word's start and end |

`project.style` is `null` (plain) or `"window"` (the facecam style, `styles/window/STYLE.md`).

## Blocks

A block is a clip the compiler expands into a few fixed elements.

| type | fields | compiles to |
|---|---|---|
| `facecam` (one per project) | `src` (facecam.mp4), `mediaStart`, `focus` `{x, y}` (% of the video kept centred in a small window, default 50 / 38: your eyes), `stack` `{x, y, w, h, r}` (default 60, 930, 960, 740, 44), `bubble` `{x, y, size, ring}` (default 60, 1250, 400, the accent), `move` (seconds a shape change takes, default 0.5), `states` `[{t, state: "full" \| "stack" \| "bubble" \| "none", sys?}]` | `#fcwrap > #fcvid` (your full-frame video) and `#fcring` (the bubble's ring). The window is a transform (x, y, scale) plus a `clip-path: inset(... round r)` on the full-frame video, so every shape change interpolates sub-pixel. One `tl.fromTo` per scene change; "none" drops the current shape below the frame. One empty `<div class="sc clip" id="S01">` per scene carries the scene timing |
| `chapter` | `eyebrow`, `name`, `icon` (src), `accent`, `ground`, `ground2`, `radius`, `hold` | a chapter card: mono eyebrow, icon tile, Inter 800 name, an accent bar; rise-in, icon pop, bar draw, hold drift, out on the boundary |
| `cta` | `line1`, `keyword`, `brand`, `pulse`, `ink` (line 1 colour on a light ground), `size1` `lh1` `size2` `lh2` (a compact lockup; defaults 54/104 and 108/200) | `<div class="cr-lockup"> <div class="cta1">Comment</div> <div class="cta2">"KEYWORD"</div>`, line 1 then line 2 0.24 s apart, one slow pulse |

Scene spans come from `sceneSpans(p)`: the block's `states` sorted, the first span from the
block's start, the last to the project end. `snapBoundary(p, t)` moves a requested cut onto
your nearest jump cut (a marker labelled "cut") within 0.85 s, else into the silence:
`last word end + 0.10 <= t <= next word start - 0.12`, or the word edge when there is no real
pause (gap under 0.14 s). `buildSceneCues(p)` builds cues per scene (a word starting within
0.15 s of a cut rides into the next scene), butt-joined, the last one running to the scene's
last frame, the caption style and y from the state (`CAPTION_FOR`: full capFace 1390, stack
capSeam on the window's top edge, bubble capSide 1330, none capGround 1330), and never inside a
`cta` clip's window. `validateScenes(p)` turns the style's sequence rules into warnings.

Track indices in the build: plain video clips `100 + track index`, audio `300 + index`, cues
`11`, scene spans `1000+`, so plain clips never sit on 10 to 19.

## Keyframes in practice (phase 2)

`clipAt(c, t)` returns the clip with keyed properties resolved at absolute time `t`; the stage,
the overlay and the inspector all read through it. `setPropAt(c, prop, v, tRel)` writes the
base value when the property has no keys and upserts a key at `tRel` when it does. That is the
whole "stopwatch" rule: once a property is keyed, every edit at the playhead is a key.

`src` is relative to the studio folder (`assets/r01/clips/x.mp4`) or `pack:<path>` for a file in
your own SFX library (the folder `SFX_LIBRARY` points to). The compiler prefixes `../` for `variants/`, nothing for the root
`index.html`, and the editor serves them at `/reels/...` and `/pack/...`.

## Operations (`lib/model.mjs`)

Every edit is a function, shared by the UI, the CLI and the tests:

`addClip placeClip moveClip trimClip slipClip splitClip splitAt rippleDelete removeClip
duplicateClip setClip moveClipToTrack addTrack removeTrack moveTrack setTrack addMarker
sliceProject snapPoints validate normalize`

`sliceProject(p, from, to)` cuts a window for a 3-second test render: everything shifts by
`-from`, clips are trimmed to the window, the root duration becomes `to - from`.

`validate(p)` refuses duplicate ids, missing tracks, empty durations, media overruns
(a clip declaring more than its file has) and same-track overlaps. It warns on an em dash and on
every broken window-style sequence rule.

## History

Every save keeps the previous file in `projects/.history/<id>/<timestamp>.json` (last 50).
The editor's own undo stack is in memory (200 steps).
