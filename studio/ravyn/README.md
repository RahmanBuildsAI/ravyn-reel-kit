# ravyn

The reel editor. A Premiere-style editor that runs in your browser: a timeline with razor and
trim, a picture where every layer moves, text you edit in place, keyframes, captions timed to
your voice, review notes pinned to the frame, and a render one click away. Zero npm
dependencies.

The big idea: **one reel is one project file** (`projects/<id>.json`). Claude writes the first
cut into that file, you open the same file in ravyn and edit it by hand, and both of you keep
editing the same thing. Nothing is ever rebuilt from scratch after your notes. The HTML that
renders is a build output, never edited by hand.

Made by [@rahmanbuilds](https://www.rahmanbuilds.com). Free to use, not for resale (see `LICENSE` in the kit).

## Run it

From the `studio/` folder:

```bash
node ravyn/server.mjs          # then open http://localhost:3140
```

Needs Node.js 18 or newer and ffmpeg on your PATH. Renders go through HyperFrames
(`npx hyperframes@0.7.89`, downloaded on first use). Voice notes need `pip install openai-whisper`.

Add `--lan` to review on your phone over the same WiFi (the address prints in the terminal).

## Try the example first

```bash
node assets/example/build.mjs                  # builds a 26-second tour of the kit
node ravyn/server.mjs                          # open http://localhost:3140, pick example-kit-tour
```

It is a complete reel built from code (`assets/example/build.mjs`): a voice with word timings,
props visiting one stage, karaoke captions, sounds. Read the build script as a worked example.

## Start a reel

1. Put your take at `studio/assets/r01/facecam.mp4`.
2. `node tools/ingest.mjs 1` : a clean 30 fps copy, your voice as `vo.mp3`, every word with its
   timing (`words.js`), and every jump cut you made (`cuts.json`).
3. `node ravyn/cli.mjs new 1 my-slug --title "Reel 1 · the hook line"` : the project, with your
   footage on V1, your voice on A1, your words loaded for captions, and your jump cuts as blue
   markers.
4. Open ravyn, pick the project. Or let Claude build the first cut (the `reel-build` skill), then
   open it here for your pass.

## The screen

```
 ravyn  [project ▾]  saved      [ Review | Edit ]      [ Ctrl+/  do anything ]   [Export ▾]
 ------------------------------------------------------------------------------------------
 R | DRAWER        |              THE PICTURE                     | THE CARD
 A | Media         |  click, drag, corner handles, rotate,        |  the selected clip:
 I | Text          |  double-click text to type                   |  position, size, time,
 L | Captions      |                                              |  enter / exit, keyframes
   | Sound         |  00:13:02     |< < > > >|     scene 5 of 21   |
   | Blocks        | ------------------------------------------------
   | Scenes        |  SCENES  ▇▇▇▇▇▇▇▇▇▇  (purple full · indigo stack · teal bubble · grey none)
   | Notes         |  CAPTIONS ||||||||||||||||||||||||||||
   |               |  V2  [screen recording] [screenshot]
   |               |  V1  [facecam window ......................]
   |               |  A1  [voice ...............................]
```

- **Review mode** (the default): the picture, a scene strip, and a side panel with the scene you
  are on, your notes, and Claude's fixes to check. Made for watching and leaving notes.
- **Edit mode** (press **E**): the full editor.
- **Ctrl+/** opens the command box: type what you want ("split", "add text", "render") and press
  Enter. Every button in the app is in it.
- **Stacking order = track order.** V1 is the bottom of the picture, V2 sits on top of it.

## The facecam window (the default style)

Select your footage and add the **Facecam** block (Blocks drawer). Your camera becomes a window
that changes shape per scene, with no cutout and no green screen:

| Scene | Your camera |
|---|---|
| **full** | fills the frame |
| **stack** | a rounded window in the bottom half, an element on top |
| **bubble** | a circle in the corner, the element gets the frame |
| **none** | gone, the element alone |

Add a scene cut at the playhead (Scenes drawer, or double-click the scene strip). Cuts snap onto
your own jump cuts, or into the silence between words. Click a scene to cycle its type. The
window's move between shapes IS the transition. Full rules: `styles/window/STYLE.md`.

**Captions per scene** (Captions drawer) builds every caption from your words, never across a
cut, in the right caption style for each scene type.

## Doing things

| Want to | Do |
|---|---|
| Put a clip on the timeline | drag a file from Media onto a track, or double-click it |
| Move a clip in time | drag it. Dropping it on another clip trims or replaces that one |
| Trim | drag an edge |
| Slip (keep the window, slide the footage) | Alt + drag inside a video clip |
| Razor | **C**, then click. **V** back to select |
| Split everything under the playhead | **Ctrl+K** |
| Delete / ripple delete | **Delete** / **Shift+Delete** |
| Copy, paste, duplicate | **Ctrl+C**, **Ctrl+V** (at the playhead), **Ctrl+D** |
| Nudge | Alt+Left/Right one frame. Ctrl+arrows move the layer 1 px (Shift: 10) |
| Edit text | double-click it on the picture |
| Animate | the card, Animation: slide, pop, blur, sweep, grow, mask up, unfold |
| Keyframes | the diamond next to a value keys it at the playhead |
| Group clips into one block | **Ctrl+G** (double-click to open, **Esc** to leave, **Ctrl+Shift+G** to ungroup) |
| Markers | **M** at the playhead |
| Safe zones | tick "safe zones" under the picture (nothing important below y 1700) |
| Undo / redo | **Ctrl+Z** / **Ctrl+Shift+Z**, 200 steps |
| Save | automatic. The last 50 saves are in `projects/.history/<id>/` |

## Review notes

Press **N**, click the exact spot (or drag a box), type what is wrong and what it should do
instead. **Shift+N** makes an arrow note: drag from the thing to where it should go. Each note
keeps the frame, the spot, what is under it, and the words you are saying there, so Claude knows
exactly what you mean.

Then ask Claude to apply your notes. It reads them with `node ravyn/cli.mjs notes <id>`, fixes the
project, and marks each one fixed. **Check Claude's fixes** walks you through them with a
before / after toggle (**B**): pass it, or send it back with what is still wrong.

| Key | Does |
|---|---|
| N / Shift+N | note / arrow note |
| , / . | previous / next scene |
| G / X | this scene is good / not right |
| < / > | playback speed |
| P | the real render instead of the live preview |
| O | the Instagram overlay, to see what the app's buttons cover |
| F / E | full screen / Edit mode |

**Your hand edits survive rebuilds.** If Claude rebuilds the reel after you moved or retyped
something, your edits are re-applied on top (`projects/edits/<id>.json`).

## Export

**Export** (top right): Compile, Check, Test render (3 seconds around the playhead), Render,
Board. One job runs at a time; the Log shows it.

- **Board** writes `boards/BOARD-<id>.html`: one frame per scene. Look at it before any render.
- **Check** runs the HyperFrames checks. Read every section, not just the last line: contrast and
  overlap problems show up as warnings above a "Check passed".
- **Render** writes `renders/<id>-vN.mp4`. On a long reel use `--workers 2` from the CLI if a
  render crashes.

## The CLI

```bash
node ravyn/cli.mjs new <n> <slug> [--title "..."]
node ravyn/cli.mjs list
node ravyn/cli.mjs compile <id>
node ravyn/cli.mjs check <id>
node ravyn/cli.mjs render <id> [--from a --to b] [--quality draft|standard|high] [--workers 2]
node ravyn/cli.mjs notes <id>                 # your review notes, with what is under each one
node ravyn/cli.mjs note-fix <id> <n> "what changed"
node ravyn/cli.mjs edits <id>                 # your hand edits
```

## Files

| Path | What |
|---|---|
| `projects/<id>.json` | the reel (the only source of truth). Format: `ravyn/docs/DATA-MODEL.md` |
| `projects/notes/<id>.json` | your review notes |
| `projects/edits/<id>.json` | your hand edits, re-applied on every rebuild |
| `variants/<id>.html` | the compiled reel (build output) |
| `renders/` | your MP4s |
| `boards/` | the boards |
| `ravyn/build-template.mjs` | the script Claude copies to build a first cut |
| `ravyn/test/` | `npm test` from `studio/` runs all of them |

## Settings

| Environment variable | Default | Does |
|---|---|---|
| `RAVYN_PORT` | 3140 | the port |
| `RAVYN_WHISPER` | small.en | the Whisper model for voice notes |
| `SFX_LIBRARY` | (none) | a folder of your own sound effects to browse in the Media drawer |
| `STUDIO_DIR` | the folder above `ravyn/` | where assets, projects and renders live |
